#!/usr/bin/env bash
# Smoke test for the profile-pictures endpoints.
#
#   BASE=http://localhost:3001 \
#   ADMIN_PASSWORD=family123 \
#   NODE_ID=28 \
#   PHOTO=./scripts/test-photo.jpg \
#   ./scripts/smoke-photo.sh
#
# Walks upload → fetch (all 3 variants) → delete. Exits non-zero on any failure.
set -euo pipefail

BASE=${BASE:-http://localhost:3001}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-family123}
NODE_ID=${NODE_ID:?must set NODE_ID}
PHOTO=${PHOTO:?must set PHOTO (path to a jpg/png/webp under 5MB)}

if [[ ! -f "$PHOTO" ]]; then
  echo "PHOTO not found: $PHOTO" >&2
  exit 1
fi

echo "==> POST /api/nodes/$NODE_ID/photo (upload)"
upload=$(curl -sS -f -X POST \
  -H "x-admin-password: $ADMIN_PASSWORD" \
  -F "photo=@$PHOTO" \
  "$BASE/api/nodes/$NODE_ID/photo")
echo "$upload"

# Pull each variant URL out of the response with python (jq isn't guaranteed).
read_url() {
  python3 -c "
import json, sys
data = json.loads(sys.argv[1])['data']
urls = data.get('photoUrls') or {}
print(urls.get(sys.argv[2], ''))
" "$upload" "$1"
}

for v in thumb medium original ; do
  url=$(read_url "$v")
  if [[ -z "$url" ]]; then
    echo "missing photoUrls.$v in upload response" >&2
    exit 1
  fi
  # Local backend returns relative URLs; prefix BASE.
  case "$url" in
    http*) full="$url" ;;
    *)     full="$BASE$url" ;;
  esac
  echo "==> GET $full (variant=$v)"
  status=$(curl -sS -o /dev/null -w "%{http_code} %{content_type}" "$full")
  echo "    $status"
  case "$status" in
    "200 image/webp"*) ;;
    *) echo "unexpected status / content-type for $v" >&2 ; exit 1 ;;
  esac
done

echo "==> DELETE /api/nodes/$NODE_ID/photo"
curl -sS -f -X DELETE \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}" \
  "$BASE/api/nodes/$NODE_ID/photo"
echo

echo "==> Verifying photoUrls is now null"
node_json=$(curl -sS -f "$BASE/api/nodes")
python3 - <<EOF
import json, sys
nodes = json.loads('''$node_json''')['data']
match = next((n for n in nodes if n['id'] == $NODE_ID), None)
if match is None:
    print("node $NODE_ID not found in response", file=sys.stderr); sys.exit(1)
if match.get('photoUrls') is not None:
    print("photoUrls was not cleared:", match, file=sys.stderr); sys.exit(1)
print("ok")
EOF

echo "==> All checks passed."
