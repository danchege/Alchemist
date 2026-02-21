#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$ROOT_DIR/build.sh"

ARCH="$(uname -m)"
OUT_DIR="$ROOT_DIR/release"
NAME="Alchemist-linux-${ARCH}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

TAR_PATH="$OUT_DIR/${NAME}.tar.gz"

STAGE_DIR="$OUT_DIR/$NAME"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

cp -a "$ROOT_DIR/dist/Alchemist/." "$STAGE_DIR/"

cp -a "$ROOT_DIR/install.sh" "$STAGE_DIR/"
cp -a "$ROOT_DIR/uninstall.sh" "$STAGE_DIR/"

chmod +x "$STAGE_DIR/install.sh" "$STAGE_DIR/uninstall.sh" || true

tar -C "$OUT_DIR" -czf "$TAR_PATH" "$NAME"

( cd "$OUT_DIR" && sha256sum "${NAME}.tar.gz" > "${NAME}.tar.gz.sha256" )

echo "Release created: $TAR_PATH"
