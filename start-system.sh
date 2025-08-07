#!/bin/bash

echo "🚀 Starting WhatsApp E-commerce Automation System..."

# Kill any existing processes
echo "🛑 Stopping existing processes..."
pkill -f "next-server" 2>/dev/null
pkill -f "node.*next" 2>/dev/null
sleep 2

# Clear old session data
echo "🧹 Clearing old session data..."
rm -rf whatsapp-session-persistent/.wwebjs_auth 2>/dev/null
rm -rf whatsapp-session-persistent/.wwebjs_cache 2>/dev/null
rm -rf .wwebjs_auth 2>/dev/null
rm -rf .wwebjs_cache 2>/dev/null

# Check if port 3000 is free
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 3000 is in use, killing process..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    sleep 2
fi

# Set environment variables
export NODE_ENV=development
export PORT=3000
export NODE_TLS_REJECT_UNAUTHORIZED=0
export NODE_OPTIONS="--max-old-space-size=4096"

# Start the application
echo "🎯 Starting Next.js application on port 3000..."
npm run dev 