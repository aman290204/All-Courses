#!/usr/bin/env bash
# render-build.sh
# Build Command on Render: bash render-build.sh

set -eo pipefail

echo "[build] Installing Node dependencies (root)..."
npm install

echo "[build] Installing Python dependencies..."
pip install --quiet google-api-python-client google-auth-oauthlib tqdm redis

echo "[build] Python version: $(python3 --version)"
# Abort if Python < 3.8 (datetime.timezone, f-strings, walrus operator required)
python3 -c "import sys; assert sys.version_info >= (3, 8), f'Python 3.8+ required, got {sys.version}'"

echo "[build] Building Vite React client..."
cd client
npm install
npm run build
cd ..

echo "[build] Client dist size: $(du -sh client/dist 2>/dev/null || echo 'not found')"
echo "[build] Done."
