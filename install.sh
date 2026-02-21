#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR_NAME="$(basename "$SCRIPT_DIR")"

INSTALL_BASE="/opt/alchemist"
INSTALL_DIR="$INSTALL_BASE/$PKG_DIR_NAME"
BIN_LINK="/usr/local/bin/Alchemist"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run as root: sudo ./install.sh"
  exit 1
fi

mkdir -p "$INSTALL_BASE"
rm -rf "$INSTALL_DIR"
cp -a "$SCRIPT_DIR" "$INSTALL_DIR"

ln -sf "$INSTALL_DIR/Alchemist" "$BIN_LINK"

chmod +x "$INSTALL_DIR/Alchemist" || true

echo "Installed to: $INSTALL_DIR"
echo "Symlink created: $BIN_LINK -> $INSTALL_DIR/Alchemist"
echo "Run: Alchemist"
