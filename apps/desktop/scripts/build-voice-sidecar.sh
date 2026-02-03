#!/usr/bin/env bash
# Builds the voice sidecar Python script into a standalone binary using PyInstaller.
# The output binary is placed in dist/voice-sidecar/ and gets bundled into
# the Electron app's extraResources by electron-builder.
#
# This script is self-contained: it creates the venv and installs all
# dependencies automatically if they are missing. The only prerequisite
# is that `python3` is available on the PATH.
#
# Usage:
#   ./scripts/build-voice-sidecar.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON_DIR="$DESKTOP_DIR/src/main/lib/voice/python"
VENV_DIR="$PYTHON_DIR/.venv"
OUTPUT_DIR="$DESKTOP_DIR/dist/voice-sidecar"

PYTHON="$VENV_DIR/bin/python3"
PIP="$VENV_DIR/bin/pip"

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
  echo "[voice-sidecar] Creating Python venv..."
  python3 -m venv "$VENV_DIR"
fi

# Install runtime dependencies
if ! "$PYTHON" -c "import openwakeword" 2>/dev/null; then
  echo "[voice-sidecar] Installing dependencies..."
  "$PIP" install --quiet openwakeword sounddevice numpy
fi

# openwakeword >=0.6.0 no longer ships pre-trained models in the pip package.
# Download the required models into the package's resources directory.
OWW_PKG_DIR=$("$PYTHON" -c "import openwakeword, os; print(os.path.dirname(openwakeword.__file__))")
OWW_MODELS_DIR="$OWW_PKG_DIR/resources/models"
mkdir -p "$OWW_MODELS_DIR"

OWW_BASE_URL="https://github.com/dscripka/openWakeWord/releases/download/v0.5.1"
for model in hey_jarvis_v0.1.onnx melspectrogram.onnx embedding_model.onnx; do
  if [ ! -f "$OWW_MODELS_DIR/$model" ]; then
    echo "[voice-sidecar] Downloading model: $model"
    curl -sL "$OWW_BASE_URL/$model" -o "$OWW_MODELS_DIR/$model"
  fi
done

# Install PyInstaller
if ! "$PYTHON" -c "import PyInstaller" 2>/dev/null; then
  echo "[voice-sidecar] Installing PyInstaller..."
  "$PIP" install --quiet pyinstaller
fi

echo "[voice-sidecar] Building binary..."

"$PYTHON" -m PyInstaller \
  --name voice-sidecar \
  --onedir \
  --noconfirm \
  --clean \
  --distpath "$OUTPUT_DIR" \
  --workpath "$DESKTOP_DIR/dist/voice-sidecar-build" \
  --specpath "$DESKTOP_DIR/dist" \
  --collect-data openwakeword \
  "$PYTHON_DIR/main.py"

BUNDLE_DIR="$OUTPUT_DIR/voice-sidecar"
INTERNAL_DIR="$BUNDLE_DIR/_internal"

echo "[voice-sidecar] Built at: $BUNDLE_DIR/"
ls -la "$BUNDLE_DIR/"

# PyInstaller's --collect-data may miss openwakeword's data files.
# Copy them manually as a guaranteed fallback.
if [ ! -f "$INTERNAL_DIR/openwakeword/resources/models/hey_jarvis_v0.1.onnx" ]; then
  echo "[voice-sidecar] Model not found in bundle, copying openwakeword data manually..."
  OWW_PKG_DIR=$("$PYTHON" -c "import openwakeword, os; print(os.path.dirname(openwakeword.__file__))")
  echo "[voice-sidecar] Copying openwakeword package from: $OWW_PKG_DIR"
  rm -rf "$INTERNAL_DIR/openwakeword"
  cp -R "$OWW_PKG_DIR" "$INTERNAL_DIR/openwakeword"
fi

# Final verification
if [ ! -f "$INTERNAL_DIR/openwakeword/resources/models/hey_jarvis_v0.1.onnx" ]; then
  echo "[voice-sidecar] ERROR: hey_jarvis model not found in bundle!"
  exit 1
fi
echo "[voice-sidecar] Verified hey_jarvis model is bundled."
