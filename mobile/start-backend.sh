#!/bin/bash
# Convenience script to start ONLY the backend (for mobile dev)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "🔥 Starting Dialed backend on :3001..."
cd "$ROOT/backend" && node --no-warnings server.js
