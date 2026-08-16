#!/usr/bin/env bash
set -uo pipefail

echo "=========================================="
echo "  Halonyx Server Auto-Starter"
echo "=========================================="


cd "$(dirname "$0")/.." || { echo "Could not resolve repo root."; exit 1; }

PORTS=(3000 8081 9000)

for port in "${PORTS[@]}"; do
  echo "Checking port $port..."

  # lsof is present by default on macOS; on Linux it may need installing
  # (apt install lsof / dnf install lsof), but most dev machines have it.
  pids=$(lsof -ti tcp:"$port" 2>/dev/null)

  if [ -n "$pids" ]; then
    for pid in $pids; do
      echo "Found process $pid on port $port. Terminating..."
      kill -9 "$pid" 2>/dev/null
    done
  fi
done

echo ""
echo "No conflicting processes remain."
echo "Starting Halonyx Server..."
echo ""

node backend/server.js

# Keep the terminal open after the server exits, matching the .bat's `pause`.
read -n 1 -s -r -p "Press any key to exit..."
echo ""
