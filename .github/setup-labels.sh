#!/usr/bin/env bash
set -euo pipefail
# Usage: gh auth login && ./.github/setup-labels.sh [repo]
REPO="${1:-jacobrakaiFoundation/beanstalk}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LABELS_FILE="$SCRIPT_DIR/labels.yml"
if ! command -v gh >/dev/null; then echo "gh CLI not found" >&2; exit 1; fi
if ! command -v yq >/dev/null; then
  echo "yq not found, falling back to manual gh label create" >&2
  gh label create bug --color d73a4a --description "Something isn't working" --repo "$REPO" --force || true
  gh label create enhancement --color a2eeef --description "New feature or request" --repo "$REPO" --force || true
  gh label create data --color 006b75 --description "Recall / openFDA data issue" --repo "$REPO" --force || true
  gh label create triage --color ededed --description "Needs triage" --repo "$REPO" --force || true
  exit 0
fi
yq -r '.[] | "\(.name)|\(.color)|\(.description)"' "$LABELS_FILE" | while IFS='|' read -r name color desc; do
  gh label create "$name" --color "$color" --description "$desc" --repo "$REPO" --force || gh label edit "$name" --color "$color" --description "$desc" --repo "$REPO" || true
done
echo "Labels synced to $REPO"
