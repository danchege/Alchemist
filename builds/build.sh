#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Build Alchemist (Linux/macOS) using PyInstaller
# - creates/uses venv at backend/.venv
# - installs deps + pyinstaller + pillow
# - builds dist/Alchemist/Alchemist
# ============================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"

echo "[*] Project root: $ROOT_DIR"
echo "[*] Backend dir : $BACKEND_DIR"
echo "[*] Venv dir    : $VENV_DIR"
echo

# -----------------------------------------------------------------
# 1) Ensure Python is available
# -----------------------------------------------------------------
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python3 not found. Please install Python 3 and ensure it is on PATH."
    exit 1
fi

if [[ ! -d "$BACKEND_DIR" ]]; then
    echo "[ERROR] Backend directory not found: $BACKEND_DIR"
    exit 1
fi

# -----------------------------------------------------------------
# 2) Create / reuse virtual environment
# -----------------------------------------------------------------
echo "[1/4] Creating virtual environment (if needed)..."
if [[ ! -f "$VENV_DIR/bin/python" ]]; then
    python3 -m venv "$VENV_DIR"
    if [[ $? -ne 0 ]]; then
        echo "[ERROR] Failed to create virtual environment."
        exit 1
    fi
fi

PYTHON_VENV="$VENV_DIR/bin/python"
if [[ ! -f "$PYTHON_VENV" ]]; then
    echo "[ERROR] Virtual environment Python not found at: $PYTHON_VENV"
    exit 1
fi

# -----------------------------------------------------------------
# 3) Install dependencies + PyInstaller + Pillow
# -----------------------------------------------------------------
echo "[2/4] Upgrading pip..."
"$PYTHON_VENV" -m pip install --upgrade pip
if [[ $? -ne 0 ]]; then
    echo "[ERROR] Failed to upgrade pip."
    exit 1
fi

echo "[3/4] Installing backend requirements..."
if [[ -f "$BACKEND_DIR/requirements.txt" ]]; then
    "$PYTHON_VENV" -m pip install -r "$BACKEND_DIR/requirements.txt"
    if [[ $? -ne 0 ]]; then
        echo "[ERROR] Failed to install backend requirements."
        exit 1
    fi
else
    echo "[WARN] requirements.txt not found in $BACKEND_DIR. Skipping dependency install."
fi

echo "[3.5/4] Installing PyInstaller and Pillow..."
"$PYTHON_VENV" -m pip install pyinstaller pillow
if [[ $? -ne 0 ]]; then
    echo "[ERROR] Failed to install PyInstaller and Pillow."
    exit 1
fi

# -----------------------------------------------------------------
# 4) Convert PNG to ICO and clean previous build artifacts
# -----------------------------------------------------------------
echo "[4/5] Converting icon.png to icon.ico..."
if [[ -f "$ROOT_DIR/icon.png" ]]; then
    "$PYTHON_VENV" -c "from PIL import Image; img = Image.open(r'$ROOT_DIR/icon.png'); img.save(r'$ROOT_DIR/icon.ico', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]); print('Icon converted successfully')"
    if [[ $? -ne 0 ]]; then
        echo "[ERROR] Failed to convert icon.png to icon.ico."
        exit 1
    fi
else
    echo "[WARN] icon.png not found. Using default icon."
fi

echo "[4.5/5] Cleaning previous build output..."
rm -rf "$ROOT_DIR/dist" "$ROOT_DIR/build"

# -----------------------------------------------------------------
# 5) Run PyInstaller
# -----------------------------------------------------------------
echo "[5/5] Building Alchemist executable with PyInstaller..."
cd "$ROOT_DIR"

"$PYTHON_VENV" -m PyInstaller --version
if [[ $? -ne 0 ]]; then
    echo "[ERROR] PyInstaller is not available in the venv."
    exit 1
fi

"$PYTHON_VENV" -m PyInstaller --noconfirm --clean \
  --name Alchemist \
  --icon "icon.ico" \
  --add-data "frontend:frontend" \
  "backend/app.py"
BUILD_ERROR=$?

if [[ $BUILD_ERROR -ne 0 ]]; then
    echo
    echo "[ERROR] PyInstaller build failed with exit code $BUILD_ERROR."
    exit $BUILD_ERROR
fi

echo
echo "[OK] Build complete."
echo "[OK] You can run the app with:"
echo "     $ROOT_DIR/dist/Alchemist/Alchemist"
