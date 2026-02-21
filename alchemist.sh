#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"

PYTHON_BIN="python3"

usage() {
  echo "Usage: $0 [run|build]"
  echo "  run   - create/use venv, install deps, start server"
  echo "  build - create/use venv, install deps, build PyInstaller executable"
}

MODE="${1:-run}"
if [[ "$MODE" != "run" && "$MODE" != "build" ]]; then
  usage
  exit 1
fi

if [[ ! -d "$VENV_DIR" ]]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

python -m pip install --upgrade pip
python -m pip install -r "$BACKEND_DIR/requirements.txt"
python -m pip install pyinstaller

if [[ "$MODE" == "run" ]]; then
  exec python "$BACKEND_DIR/app.py"
fi

if [[ "$MODE" == "build" ]]; then
  rm -rf "$ROOT_DIR/dist" "$ROOT_DIR/build"
  pyinstaller --noconfirm --clean \
    --name Alchemist \
    --add-data "$ROOT_DIR/frontend:frontend" \
    "$BACKEND_DIR/app.py"

  echo "Built: $ROOT_DIR/dist/Alchemist"
fi
