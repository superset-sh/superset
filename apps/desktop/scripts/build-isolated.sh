#!/usr/bin/env bash

set -e

echo "Building desktop app in isolated context..."

# 1. Compile the app first
echo "Compiling app..."
bun run compile:app

# 2. Create temp build directory
BUILD_DIR=$(mktemp -d)
echo "Created temp build directory: $BUILD_DIR"

# 3. Copy compiled files
echo "Copying compiled files..."
mkdir -p "$BUILD_DIR/node_modules/.dev"
cp -R node_modules/.dev/* "$BUILD_DIR/node_modules/.dev/"

# 4. Create minimal package.json (without node-pty for now)
echo "Creating minimal package.json..."
cat > "$BUILD_DIR/package.json" << 'EOF'
{
  "name": "Superset",
  "version": "0.0.0",
  "main": "./node_modules/.dev/main/index.js",
  "dependencies": {}
}
EOF

# 6. Copy resources
echo "Copying resources..."
mkdir -p "$BUILD_DIR/src"
cp -R src/resources "$BUILD_DIR/src/"

# 7. Create simplified electron-builder config
echo "Creating electron-builder config..."
cat > "$BUILD_DIR/electron-builder.json5" << 'EBCONFIG'
{
  appId: "com.dalton-menezes.superset",
  productName: "Superset",
  copyright: "Copyright © 2025 — Dalton Menezes",
  electronVersion: "39.1.2",

  directories: {
    output: "dist/v0.0.0",
    buildResources: "src/resources"
  },

  files: [
    {
      from: "node_modules/.dev",
      to: "node_modules/.dev"
    },
    "package.json"
  ],

  npmRebuild: false,
  buildDependenciesFromSource: false,
  nodeGypRebuild: false,

  mac: {
    artifactName: "Superset-v0.0.0-mac.${ext}",
    icon: "src/resources/build/icons/icon.icns",
    category: "public.app-category.utilities",
    target: ["zip", "dmg", "dir"],
    notarize: false
  },

  protocols: {
    name: "Superset",
    schemes: ["superset"]
  },

  linux: {
    artifactName: "Superset-v0.0.0-mac.${ext}",
    category: "Utilities",
    synopsis: "The last developer tool you'll ever need",
    target: ["AppImage", "deb", "pacman", "freebsd", "rpm"]
  },

  win: {
    artifactName: "Superset-v0.0.0-mac.${ext}",
    icon: "src/resources/build/icons/icon.ico",
    target: ["zip", "portable"]
  }
}
EBCONFIG

# 8. Run electron-builder from temp directory
echo "Running electron-builder..."
cd "$BUILD_DIR"
npx electron-builder --dir --config electron-builder.json5

# 9. Copy build output back
echo "Copying build output..."
mkdir -p "$(dirname "$0")/../dist"
cp -R dist/* "$(dirname "$0")/../dist/"

# 10. Cleanup
echo "Cleaning up..."
rm -rf "$BUILD_DIR"

echo "Build complete! Output in dist/"
