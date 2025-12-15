#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
API_PORT=8088
FRONTEND_PORT=3000

# --- Function to cleanup background processes ---
cleanup() {
    echo "\n››› Shutting down background servers..."
    # Kill the captured PIDs. The `|| true` suppresses errors if the process is already gone.
    if [ -n "$API_SERVER_PID" ]; then
        kill $API_SERVER_PID || true
    fi
    if [ -n "$DEV_SERVER_PID" ]; then
        kill $DEV_SERVER_PID || true
    fi
    echo "Servers shut down. Exiting."
    exit 0
}

# Trap signals to run the cleanup function
trap cleanup INT TERM EXIT

# --- Use correct Node version ---
echo "››› Sourcing nvm and using correct Node.js version..."
# Make sure nvm is sourced if it's not already in the shell's rc file
[[ -s "$HOME/.nvm/nvm.sh" ]] && . "$HOME/.nvm/nvm.sh"
nvm use 22.15.1

# --- Pre-flight Check: Check for running processes on target ports ---
echo "››› Checking for running processes on ports $API_PORT and $FRONTEND_PORT..."
if lsof -i :$API_PORT > /dev/null; then
    echo "Warning: Port $API_PORT is already in use. Attempting to kill the process..."
    kill $(lsof -t -i:$API_PORT) || true
    sleep 1
fi
if lsof -i :$FRONTEND_PORT > /dev/null; then
    echo "Warning: Port $FRONTEND_PORT is already in use. Attempting to kill the process..."
    kill $(lsof -t -i:$FRONTEND_PORT) || true
    sleep 1
fi
echo "Ports are clear."

# --- Start the Fake API Server in the background ---
echo "››› Starting Fake API Server on port $API_PORT..."
pnpm dev:fake-api &
API_SERVER_PID=$!
echo "Fake API Server started with PID: $API_SERVER_PID"

# --- Wait for the API server to be ready ---
echo "››› Waiting for API server to be available at http://localhost:$API_PORT..."
pnpm exec wait-on http://localhost:$API_PORT -v --timeout 60000
echo "✅ API Server is up and running."

# --- Start the Extension Development Server ---
echo "››› Starting Extension Development Server on port $FRONTEND_PORT..."
pnpm dev &
DEV_SERVER_PID=$!
echo "Extension Dev Server started with PID: $DEV_SERVER_PID"

# --- Instructions for the User ---
echo "\n\n✅ All development servers are running."
echo "--------------------------------------------------"
echo "Fake API Server: http://localhost:$API_PORT"
echo "Extension Dev Server (for HMR): http://localhost:$FRONTEND_PORT (and others)"
echo "--------------------------------------------------"
echo "Next Steps:"
echo "1. Open Chrome and navigate to: chrome://extensions"
echo "2. Enable 'Developer mode'."
echo "3. Click 'Load unpacked'."
echo "4. Select the 'dist' folder from this project directory."
echo "5. Click the extension icon to test the 'Register with Passkey' button."
echo "--------------------------------------------------"
echo "\n››› Watching for file changes. Press Ctrl+C to stop all servers."

# Wait indefinitely
wait
