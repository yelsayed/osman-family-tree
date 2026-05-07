# شجرة آل عثمان بحيري — Family Tree App

Full-stack Arabic / RTL family tree viewer & editor for my family tree. I'm keeping this open source in case anyone from the family wants to add to this application. Checkout the issues attached to this repo.

<img width="1390" height="999" alt="Screenshot 2026-05-07 at 9 38 30 AM" src="https://github.com/user-attachments/assets/0fe767c9-98d8-4d62-82cf-74e2905ab16c" />


## Structure at a glance

- **Frontend** — React + TypeScript + Vite, built into a static `dist/` bundle.
- **Backend** — Node.js + Express, serves both `/api/*` and the static frontend.
- **Database** — Redis (with `appendonly` + `save` so it's not ephemral).
- **Container** — single Docker image runs Express + Redis side-by-side via `supervisord`.

The whole stack ships in **one container** and listens on **port 3001**.

---

## Run with Docker

```bash
# from the project root (where the Dockerfile lives)
docker compose up --build
```

Then open <http://localhost:3001>.

The first build takes a minute (it installs npm deps and runs `vite build`).
Subsequent runs reuse the cached layers and start in seconds.

To stop:

```bash
docker compose down
```

Redis data is persisted to a named volume `redis-data` — your edits survive
`down` / `up` cycles. To wipe everything and start fresh from the seed fixture:

```bash
docker compose down -v
```

### Plain `docker` (no compose)

```bash
docker build -t family-tree .
docker run --rm -p 3001:3001 -v family-tree-data:/data family-tree
```

---

## Configuration

| Env var          | Default                    | What it does                                     |
| ---------------- | -------------------------- | ------------------------------------------------ |
| `ADMIN_PASSWORD` | `family123`                | Required for POST / PUT / DELETE on `/api/nodes` |
| `PORT`           | `3001`                     | Express listen port                              |
| `REDIS_URL`      | `redis://127.0.0.1:6379`   | Redis connection string                          |
| `STATIC_DIR`     | `/app/dist`                | Where Express serves the SPA from                |

Override via compose:

```bash
ADMIN_PASSWORD='something-stronger' docker compose up --build
```

---

## Local dev (without Docker)

You need a local Redis (`brew install redis && brew services start redis`,
or `docker run -p 6379:6379 redis:7-alpine`).

```bash
# Terminal 1 — backend
cd server
npm install
ADMIN_PASSWORD=family123 PORT=3001 npm start

# Terminal 2 — frontend with Vite HMR
cd client
npm install
npm run dev      # http://localhost:5173 (proxies /api → :3001)
```


