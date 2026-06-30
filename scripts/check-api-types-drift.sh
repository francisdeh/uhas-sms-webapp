#!/usr/bin/env bash
# Verifies apps/web/src/types/api.d.ts is in sync with the FastAPI
# OpenAPI schema. Fails CI if a Pydantic schema changed in apps/api
# without regenerating the frontend types.
#
# Used by:
#   - CI:           .github/workflows/ci.yml (api job)
#   - pre-commit:   (later, when pre-commit replaces husky)
#
# How it works:
#   1. Start the FastAPI app on port 8001 in the background
#   2. Run openapi-typescript against it, writing to a temp file
#   3. Diff the temp file against the committed api.d.ts
#   4. Cleanup + return non-zero if they differ

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
WEB_DIR="$REPO_ROOT/apps/web"
COMMITTED_TYPES="$WEB_DIR/src/types/api.d.ts"
TMP_TYPES="$(mktemp -t api-types-drift.XXXXXX.d.ts)"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  rm -f "$TMP_TYPES"
}
trap cleanup EXIT

echo "→ Starting FastAPI on port 8001…"
cd "$API_DIR"
uv run uvicorn app.main:app --port 8001 --log-level warning &
API_PID=$!

# Wait up to 10s for /openapi.json to respond.
for _ in $(seq 1 20); do
  if curl -sf http://localhost:8001/openapi.json >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -sf http://localhost:8001/openapi.json >/dev/null 2>&1; then
  echo "✗ FastAPI didn't come up in time." >&2
  exit 1
fi

echo "→ Generating types…"
cd "$WEB_DIR"
pnpm exec openapi-typescript http://localhost:8001/openapi.json -o "$TMP_TYPES" >/dev/null

if diff -q "$COMMITTED_TYPES" "$TMP_TYPES" >/dev/null 2>&1; then
  echo "✓ api.d.ts is in sync with the FastAPI OpenAPI schema."
  exit 0
fi

echo ""
echo "✗ api.d.ts is out of date with the FastAPI OpenAPI schema."
echo ""
echo "  Regenerate locally with:"
echo "    cd apps/api && uv run uvicorn app.main:app --port 8000 &"
echo "    cd apps/web && pnpm generate:api-types"
echo "    kill %1"
echo ""
echo "  Then commit the updated apps/web/src/types/api.d.ts."
echo ""
echo "  Diff (committed → expected):"
diff -u "$COMMITTED_TYPES" "$TMP_TYPES" || true
exit 1
