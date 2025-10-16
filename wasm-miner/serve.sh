#!/bin/bash

# Simple server script for testing the WASM miner

PORT=${1:-8080}

echo "🌐 Starting web server on port $PORT..."
echo "📂 Serving files from: $(pwd)"
echo ""
echo "🔗 Open in browser: http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Try different server options
if command -v python3 &> /dev/null; then
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer $PORT
elif command -v npx &> /dev/null; then
    npx serve -l $PORT .
else
    echo "❌ No suitable web server found"
    echo "Please install Python 3 or Node.js"
    exit 1
fi
