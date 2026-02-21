#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR_NAME="$(basename "$SCRIPT_DIR")"

INSTALL_BASE="/opt/alchemist"
INSTALL_DIR="$INSTALL_BASE/$PKG_DIR_NAME"
BIN_LINK="/usr/local/bin/Alchemist"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run as root: sudo ./uninstall.sh"
  exit 1
fi

rm -f "$BIN_LINK"
rm -rf "$INSTALL_DIR"

echo "Removed: $INSTALL_DIR"
echo "Removed symlink: $BIN_LINK"
