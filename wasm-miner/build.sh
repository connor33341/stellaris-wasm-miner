#!/bin/bash

# Stellaris WASM Miner Build Script

set -e

echo "🔨 Building Stellaris WASM Miner..."

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust is not installed, install it now..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo "✅ Rust installed successfully"
fi

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack is not installed, installing it now..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
    echo "✅ wasm-pack installed successfully"
fi

# Build the WASM module
echo "📦 Compiling Rust to WASM..."
wasm-pack build --target web --out-dir pkg --release

echo ""
echo "✅ Build complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Serve the files with a web server:"
echo "      python3 -m http.server 8080"
echo "   or"
echo "      npx serve ."
echo ""
echo "   2. Open http://localhost:8080 in your browser"
echo ""
echo "   3. Enter your wallet address and start mining!"
echo ""
