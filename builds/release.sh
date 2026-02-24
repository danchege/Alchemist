#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Release Alchemist (Linux/macOS) 
# - builds the application using build.sh
# - creates distribution package with install/uninstall scripts
# - generates tar.gz archive with checksum
# ============================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[*] Project root: $ROOT_DIR"
echo "[*] Starting release process..."
echo

# -----------------------------------------------------------------
# 1) Build the application
# -----------------------------------------------------------------
echo "[1/4] Building application..."
if [[ ! -f "$ROOT_DIR/build.sh" ]]; then
    echo "[ERROR] build.sh not found in project root."
    exit 1
fi

"$ROOT_DIR/build.sh"
if [[ $? -ne 0 ]]; then
    echo "[ERROR] Build failed. Aborting release."
    exit 1
fi

# -----------------------------------------------------------------
# 2) Setup release directories and naming
# -----------------------------------------------------------------
echo "[2/4] Setting up release directories..."
ARCH="$(uname -m)"
OUT_DIR="$ROOT_DIR/release"
NAME="Alchemist-linux-${ARCH}"

if [[ ! -d "$ROOT_DIR/dist/Alchemist" ]]; then
    echo "[ERROR] Build output not found: $ROOT_DIR/dist/Alchemist"
    exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

TAR_PATH="$OUT_DIR/${NAME}.tar.gz"

STAGE_DIR="$OUT_DIR/$NAME"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

# -----------------------------------------------------------------
# 3) Copy application files and scripts
# -----------------------------------------------------------------
echo "[3/4] Copying application files..."
cp -a "$ROOT_DIR/dist/Alchemist/." "$STAGE_DIR/"
if [[ $? -ne 0 ]]; then
    echo "[ERROR] Failed to copy application files."
    exit 1
fi

if [[ -f "$ROOT_DIR/install.sh" ]]; then
    cp -a "$ROOT_DIR/install.sh" "$STAGE_DIR/"
    if [[ $? -ne 0 ]]; then
        echo "[ERROR] Failed to copy install.sh."
        exit 1
    fi
else
    echo "[WARN] install.sh not found. Skipping."
fi

if [[ -f "$ROOT_DIR/uninstall.sh" ]]; then
    cp -a "$ROOT_DIR/uninstall.sh" "$STAGE_DIR/"
    if [[ $? -ne 0 ]]; then
        echo "[ERROR] Failed to copy uninstall.sh."
        exit 1
    fi
else
    echo "[WARN] uninstall.sh not found. Skipping."
fi

chmod +x "$STAGE_DIR/install.sh" "$STAGE_DIR/uninstall.sh" 2>/dev/null || true

# -----------------------------------------------------------------
# 4) Create archive and checksum
# -----------------------------------------------------------------
echo "[4/4] Creating release archive..."
tar -C "$OUT_DIR" -czf "$TAR_PATH" "$NAME"
if [[ $? -ne 0 ]]; then
    echo "[ERROR] Failed to create tar archive."
    exit 1
fi

( cd "$OUT_DIR" && sha256sum "${NAME}.tar.gz" > "${NAME}.tar.gz.sha256" )
if [[ $? -ne 0 ]]; then
    echo "[ERROR] Failed to generate checksum."
    exit 1
fi

echo
echo "[OK] Release created successfully!"
echo "[OK] Archive: $TAR_PATH"
echo "[OK] Checksum: $TAR_PATH.sha256"
