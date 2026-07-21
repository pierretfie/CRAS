#!/bin/bash
# Build a lean production server — only the packages the server code actually imports.
set -e

BUILD_DIR="release/server-lean"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/dist-server"

echo "[lean-server] Copying server bundle..."
cp -r dist/server/* "$BUILD_DIR/dist-server/"

echo "[lean-server] Creating minimal package.json..."
cat > "$BUILD_DIR/package.json" << 'EOF'
{
  "name": "cras-server",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "pg": "^8.21.0",
    "openai": "^6.42.0",
    "@supabase/supabase-js": "^2.108.2",
    "h3": "^1.15.3",
    "serve-static": "^1.16.2",
    "requrl": "^3.0.2",
    "unstorage": "^1.15.0",
    "radix3": "^1.1.2",
    "hookable": "^5.5.4",
    "iron-webcrypto": "^1.2.1",
    "crypto-js": "^4.2.0",
    "consola": "^3.4.2",
    "citty": "^0.1.6",
    "defu": "^6.1.4",
    "destr": "^2.0.3",
    "pathe": "^2.0.3",
    "ufo": "^1.5.4",
    "crossws": "^1.5.3",
    "ws": "^8.18.0",
    "agent-base": "^7.1.3",
    "undici": "^7.10.0"
  }
}
EOF

cd "$BUILD_DIR"
echo "[lean-server] Installing minimal dependencies..."
npm install --production --ignore-scripts 2>&1 | tail -3
cd ../..

echo "[lean-server] Done → $BUILD_DIR"
du -sh "$BUILD_DIR"
