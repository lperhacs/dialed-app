#!/bin/bash

# Dialed — Start Script
echo ""
echo "  🔥 Starting Dialed..."
echo ""

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Check if node_modules exist
if [ ! -d "$ROOT/backend/node_modules" ]; then
  echo "  📦 Installing backend dependencies..."
  cd "$ROOT/backend" && npm install
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "  📦 Installing frontend dependencies..."
  cd "$ROOT/frontend" && npm install
fi

# Seed database if it doesn't exist
if [ ! -f "$ROOT/backend/database/dialed.db" ]; then
  echo "  🌱 Seeding database with demo data..."
  cd "$ROOT/backend" && node database/seed.js
fi

echo ""
echo "  ✅ Launching servers..."
echo ""
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo ""
echo "  Demo accounts (password: password123):"
echo "  → alex@dialed.app  (42d run streak)"
echo "  → jess@dialed.app  (118d meditation streak)"
echo "  → marco@dialed.app (198d coding streak)"
echo "  → priya@dialed.app (360d yoga streak!)"
echo "  → jay@dialed.app"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

# Start backend (suppress experimental SQLite warning)
cd "$ROOT/backend" && node --no-warnings server.js &
BACKEND_PID=$!

# Start frontend
cd "$ROOT/frontend" && npm run dev &
FRONTEND_PID=$!

# Trap ctrl-c to kill both
trap "echo ''; echo '  Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

wait
