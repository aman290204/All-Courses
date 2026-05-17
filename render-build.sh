#!/usr/bin/env bash
# render-build.sh
# Build Command on Render: bash render-build.sh

set -e
echo "[build] Installing Node dependencies..."
npm install

echo "[build] Installing Python dependencies..."
pip install --quiet google-api-python-client google-auth-oauthlib tqdm redis

echo "[build] Python version: $(python3 --version)"
echo "[build] Done."
