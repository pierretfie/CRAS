#!/bin/bash
# Build a minimal production server directory with only the files needed to run.
set -e

BUILD_DIR="release/server-build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "[build-server] Copying server files..."
cp -r dist/server "$BUILD_DIR/dist-server"

echo "[build-server] Installing production-only dependencies..."
cd "$BUILD_DIR"
npm init -y > /dev/null 2>&1

# Copy production deps from root package.json
node -e "
const root = require('../../package.json');
const pkg = { name: 'cras-server', version: '1.0.0', type: 'module', dependencies: root.dependencies };
require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

npm install --production --ignore-scripts 2>&1 | tail -3
cd ../..

echo "[build-server] Done → $BUILD_DIR"
du -sh "$BUILD_DIR"
