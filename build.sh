#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"

PYTHON_BIN="python3"

if [[ ! -d "$VENV_DIR" ]]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

python -m pip install --upgrade pip
python -m pip install -r "$BACKEND_DIR/requirements.txt"
python -m pip install pyinstaller

rm -rf "$ROOT_DIR/dist" "$ROOT_DIR/build"

pyinstaller --noconfirm --clean \
  --name Alchemist \
  --add-data "$ROOT_DIR/frontend:frontend" \
  "$BACKEND_DIR/app.py"

echo "Build complete. Run: $ROOT_DIR/dist/Alchemist/Alchemist"
