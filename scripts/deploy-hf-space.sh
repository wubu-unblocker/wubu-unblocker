#!/usr/bin/env bash
set -euo pipefail

SPACE_REPO="${1:-wubu-unblocker/v1.0}"
HF_TOKEN="${HF_TOKEN:-}"

if [[ -z "$HF_TOKEN" ]]; then
  echo "HF_TOKEN environment variable is required."
  echo "Usage: HF_TOKEN=hf_xxx ./scripts/deploy-hf-space.sh [owner/space_name]"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HF_REMOTE_URL="https://user:${HF_TOKEN}@huggingface.co/spaces/${SPACE_REPO}"

if git remote get-url hf-space >/dev/null 2>&1; then
  git remote set-url hf-space "$HF_REMOTE_URL"
else
  git remote add hf-space "$HF_REMOTE_URL"
fi

echo "Pushing current branch HEAD to Hugging Face Space: ${SPACE_REPO}"
git push hf-space HEAD:main

echo "Done."
