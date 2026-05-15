# Deployment Plan

This document proposes a deployment design for issue [#3](https://github.com/yelsayed/osman-family-tree/issues/3). It does not implement [#1 Scheduled Backup](https://github.com/yelsayed/osman-family-tree/issues/1) or [#2 Profile pictures](https://github.com/yelsayed/osman-family-tree/issues/2), but it is shaped to support both without rework.

## Goals and constraints

- Steady-state cost under $5 per month.
- No changes to code under `client/` or `server/`. The existing `Dockerfile`, `redis.conf`, and `supervisord.conf` stay as written.
- One host. Everything that runs in `docker-compose.yml` today continues to run on a single machine.
- Deploys run automatically on merges to `main`.
- The design works with the future scheduled-backup workflow (#1) and the future S3 media store (#2) without changes here.

## High-level shape

```
              ┌────────────────────────────────────────────┐
              │  AWS Lightsail instance (~$5/mo)           │
              │                                            │
              │  caddy (80/443)                            │
              │     │                                      │
              │     ▼                                      │
              │  family-tree container :3001               │
              │     ├── express                            │
              │     └── redis (bound 127.0.0.1)            │
              │  volume: redis-data → /data                │
              │                                            │
              │  /home/deploy/family-tree/.env  (secrets)  │
              └────────────────────────────────────────────┘
                          ▲           ▲              │
          docker login    │           │  SSH         │ (future) S3:
          + pull image    │           │ deploy +     │ - backups   #1
                          │           │ future       │ - media     #2
                          │           │ backup       ▼
                   ┌──────┴───────────┴──────┐   ┌─────────┐
                   │   GitHub Actions         │   │   S3    │
                   │   - build & push GHCR    │   └─────────┘
                   │   - ssh + compose pull   │
                   └──────────────────────────┘
```

## Hosting

**AWS Lightsail, $5/month plan.** 2 vCPU, 1 GB RAM, 40 GB SSD, 2 TB transfer. The app's working set (a small Redis dataset plus a small Node process) fits in well under 200 MB, so 1 GB is comfortable. Living in AWS means the future S3 buckets for backups (#1) and media (#2) share an account and IAM model with the host.

Other AWS shapes considered and rejected:

| Option | Reason |
| --- | --- |
| EC2 `t4g.micro` on-demand | Instance, EBS, and transfer billed separately. More moving parts; ends up more expensive than Lightsail for the same compute. |
| EC2 spot | Can be reclaimed. Not appropriate for an always-on service. |
| Lightsail $3.50 plan (512 MB) | Tight once Caddy, Node, and Redis run together. |

Region: pick the Lightsail region nearest most of the family. Re-provisioning is the only way to change the region later.

## Container layout

The deployed `docker-compose.yml` adds a Caddy service for TLS termination and points the app service at the prebuilt GHCR image. The application image itself is not modified.

```yaml
# docker-compose.yml (illustrative)
services:
  app:
    image: ghcr.io/yelsayed/osman-family-tree:latest
    container_name: family-tree
    expose: ["3001"]
    environment:
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      PORT: "3001"
      REDIS_URL: "redis://127.0.0.1:6379"
      STATIC_DIR: "/app/dist"
      # Pre-declared for issue #2; empty until those secrets exist:
      S3_BUCKET: ${S3_BUCKET:-}
      S3_REGION: ${S3_REGION:-}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:-}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:-}
    volumes:
      - redis-data:/data
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    container_name: family-tree-caddy
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on: [app]
    restart: unless-stopped

volumes:
  redis-data:
  caddy-data:
  caddy-config:
```

`Caddyfile`:

```
tree.example.com {
    reverse_proxy app:3001
    encode zstd gzip
}
```

## CI/CD

A single workflow at `.github/workflows/deploy.yml`:

1. Trigger on `push` to `main`.
2. Build the image with Buildx, log in to `ghcr.io` using `GITHUB_TOKEN`, push two tags: `latest` and `sha-<short>`.
3. SSH to the instance, write `/home/deploy/family-tree/.env` from GitHub Secrets, then pull and restart:

```sh
cd /home/deploy/family-tree
install -m 600 /dev/null .env
cat > .env <<EOF
ADMIN_PASSWORD=${{ secrets.ADMIN_PASSWORD }}
# Pre-wired for #2, empty until those secrets exist:
S3_BUCKET=${{ secrets.S3_BUCKET }}
S3_REGION=${{ secrets.S3_REGION }}
AWS_ACCESS_KEY_ID=${{ secrets.AWS_ACCESS_KEY_ID }}
AWS_SECRET_ACCESS_KEY=${{ secrets.AWS_SECRET_ACCESS_KEY }}
EOF
docker compose pull
docker compose up -d
docker image prune -f
```

Cost: $0. GitHub Actions minutes and GHCR storage are free for public repositories.

GHCR is preferred over Amazon ECR because it is free for public packages and authenticates with the built-in `GITHUB_TOKEN`. ECR remains an option if we later need its IAM integration.

## Secrets

GitHub Secrets is the single source of truth. The deploy workflow writes a fresh `.env` file (mode 600, owned by `deploy`) on every run. The file on disk is a cache of the secret values, not a parallel source. Rotation is: change the secret in GitHub, re-run the workflow.

| Secret | Consumer | Purpose |
| --- | --- | --- |
| `DEPLOY_HOST` | workflow | Lightsail static IP |
| `DEPLOY_USER` | workflow | `deploy` |
| `DEPLOY_SSH_KEY` | workflow | Private half of the deploy SSH key |
| `ADMIN_PASSWORD` | written to `.env` | Required for write APIs |
| `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | written to `.env` (empty for now) | Reserved for issue #2 |

### Why not bake secrets into the image

- GHCR images inherit repository visibility. A public repo means a public image; any reader can pull it and inspect baked-in env values.
- Image layers are immutable. Removing a secret in a later layer does not remove it from earlier ones.
- Rotation would require a full rebuild and re-push for every change.
- Each image tag would carry the password as it was at build time, so rollback would also roll back the password.

### Why not inject inline on `docker compose up`

- A host reboot or container recreation outside the workflow loses the env value.
- The `.env` file makes manual recovery on the host possible without re-running CI.

### IAM scope for the future AWS credentials

When the S3 secrets are populated (issue #2), the AWS credentials should belong to a dedicated IAM user limited to:

- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on the media bucket (#2).
- `s3:PutObject` on the backups bucket (#1). A separate IAM user is preferable for #1 since its credentials only ever sit in GitHub Secrets, not on the host.

## Domain and TLS

- Use any registrar. Create one A record pointing at the Lightsail static IP.
- Caddy provisions and renews a Let's Encrypt certificate automatically. No certbot, no cron, $0.
- Optional: Route 53 hosted zone ($0.50/month) for alias records and IAM integration.

## Supply-chain hygiene

The deploy workflow runs with access to `DEPLOY_SSH_KEY` and `ADMIN_PASSWORD`. Once code is on `main`, that code runs in the workflow context with those secrets available. A malicious pull request that gets merged could exfiltrate those secrets by modifying the workflow, the Dockerfile, or any script the workflow invokes.

GitHub already mitigates part of this:

- A `pull_request` workflow run from a fork has no access to repository secrets by default.
- Triggering only on `push: branches: [main]` means a fork cannot trigger the deploy workflow at all without code first being merged.

The remaining gap is closed with five low-cost measures:

1. **Branch protection on `main`.** Require pull requests, require at least one approving review, disallow direct pushes. This matches the rule stated in issue #3.
2. **CODEOWNERS file.** Mark `.github/workflows/`, `Dockerfile`, and `docker-compose.yml` as requiring the repo owner's approval. A reviewer cannot approve workflow changes without specifically reviewing them.
3. **GitHub Environment for the deploy job.** Place deploy-related secrets in a `production` environment with "required reviewers" set to the repo owner. After a merge, the deploy job pauses until the owner approves it in the Actions UI.
4. **Least-privilege workflow permissions.** Set `permissions: contents: read` at the workflow top and widen only on the job that pushes to GHCR.
5. **Pin third-party Actions to commit SHAs**, not floating tags. A compromised `@v1` tag of a popular Action becomes a compromised deploy step.

These steps do not prevent malicious pull requests from being opened. They ensure that secrets are not released to a workflow run without an explicit human approval after merge.

## Persistence and backup seam (for issue #1, not implemented here)

- The `redis-data` volume holds `appendonly.aof` and `dump.rdb` per the existing `redis.conf`.
- A future scheduled GH Actions workflow will SSH in, run `docker exec family-tree redis-cli BGSAVE`, tar the volume contents, and upload to S3.
- This plan keeps that path clear. SSH access from CI is already in place, Redis is reachable via `docker exec`, and the volume name is stable.

## Media-storage seam (for issue #2, not implemented here)

- Profile pictures will live in S3, not on the host.
- The compose file pre-declares the four S3-related env vars. They are empty until #2 ships and the server ignores them.
- When #2 is implemented, the only deployment change is to populate the secrets in GitHub and re-run the workflow.

## Cost summary

| Item | Monthly |
| --- | --- |
| Lightsail instance ($5 plan) | $5.00 |
| Domain (.com), monthly average | ~$0.85 |
| GHCR storage and Actions minutes | $0 |
| Let's Encrypt certificate | $0 |
| **Steady-state total** | **~$6/mo** |

Optional add-ons not included above: Lightsail weekly snapshots (~$2/month for 40 GB) and Route 53 hosted zone ($0.50/month).

## What this plan does not do

- No backup workflow. Issue #1 will add it.
- No S3 wiring. Issue #2 will add it.
- No staging environment. One host is the whole point of "minimal."
- No autoscaling, load balancer, or managed Redis.
- No edits inside `client/` or `server/`.

## TODOs

Items are tagged **[human]** if they require account access, billing, or repository administration, and **[agent]** if they can be completed as file changes in a pull request.

### Infrastructure setup (before first deploy)

1. **[human]** Create or select an AWS account and pick a region.
2. **[human]** Provision a Lightsail instance: $5/month plan, Ubuntu 24.04 LTS. Attach a static IP.
3. **[human]** In the Lightsail instance firewall, open ports 22, 80, and 443. Close everything else.
4. **[human]** Install Docker and the Compose plugin on the instance.
5. **[human]** Create the `deploy` user. Install the deploy SSH public key in `/home/deploy/.ssh/authorized_keys`. Disable SSH password authentication.
6. **[human]** Buy a domain (or pick a free DuckDNS subdomain). Create an A record pointing at the Lightsail static IP.

### Repository changes

7. **[agent]** Add `.github/workflows/deploy.yml` implementing the build / push / SSH / deploy flow.
8. **[agent]** Edit `docker-compose.yml`: change `build: .` to `image: ghcr.io/yelsayed/osman-family-tree:latest`, add the `caddy` service, and declare the new env vars.
9. **[agent]** Add a `Caddyfile` at the repo root. Use the chosen domain as the site name.
10. **[agent]** Add a `CODEOWNERS` file requiring the repo owner's approval on `.github/workflows/*`, `Dockerfile`, and `docker-compose.yml`.
11. **[agent]** Update `README.md` with a short pointer to this document.

### GitHub configuration

12. **[human]** Add repository secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `ADMIN_PASSWORD`. Leave `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` empty.
13. **[human]** Create a `production` GitHub Environment. Move the deploy-related secrets into it. Enable "required reviewers" with the repo owner listed.
14. **[human]** Enable branch protection on `main`: require pull requests, at least one approving review, no direct pushes.

### Smoke test

15. **[human]** Merge the implementation PR. Approve the `production` environment when the workflow prompts.
16. **[human]** Confirm the app loads at the chosen domain over HTTPS.
17. **[agent]** Provide a small `curl` script that exercises a write API call with the new `ADMIN_PASSWORD`.
18. **[human]** Run the smoke-test script and confirm success.

### Optional (post-deploy)

19. **[human]** Enable weekly automatic Lightsail snapshots (~$2/month).
