#!/usr/bin/env bash
# Copies @medicore/shared-types from the Medicore web repo into this app (no workspace link between projects).
# Mirrors the web files exactly, but never deletes the Android-only files in LOCAL_FILES and re-adds their exports
# to index.ts after copying. Records the synced web commit in .synced-from-commit.
# Usage: scripts/sync-shared-types.sh [path-to-medicore-repo]
set -euo pipefail
REPO="${1:-$HOME/Desktop/Medicore}"
SRC="$REPO/packages/shared-types/src"
DEST="$(cd "$(dirname "$0")/.." && pwd)/src/types/medicore"

# Not in shared-types yet (the web declares these locally). Move them there when the app joins the monorepo.
LOCAL_FILES=(ssr.ts permission-modules.ts)
LOCAL_EXPORTS=(
  "export type { SsrView, SsrRow, SsrReport, SsrInvoice } from './ssr';"
  "export * from './permission-modules';"
)

[ -d "$SRC" ] || { echo "shared-types not found at $SRC" >&2; exit 1; }
is_local() {
  local f
  for f in "${LOCAL_FILES[@]}"; do [ "$1" = "$f" ] && return 0; done
  return 1
}

# Stop before touching anything if the web repo now ships one of the Android-only files.
for f in "$SRC"/*.ts; do
  if is_local "$(basename "$f")"; then
    echo "shared-types now has $(basename "$f"): delete the Android copy and remove it from LOCAL_FILES/LOCAL_EXPORTS" >&2
    exit 1
  fi
done

mkdir -p "$DEST"
# Remove copies of files the web repo has since deleted; Android-only files are kept.
for f in "$DEST"/*.ts; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"
  is_local "$name" || [ -e "$SRC/$name" ] || rm "$f"
done

cp "$SRC"/*.ts "$DEST"/
printf '%s\n' "${LOCAL_EXPORTS[@]}" >> "$DEST/index.ts"

commit="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)"
if [ -n "$(git -C "$REPO" status --porcelain -- packages/shared-types 2>/dev/null)" ]; then commit="$commit-dirty"; fi
echo "$commit" > "$DEST/.synced-from-commit"
echo "Synced $(ls "$SRC"/*.ts | wc -l | tr -d ' ') files from $SRC ($commit); kept ${LOCAL_FILES[*]}"
