#!/bin/bash
set -e
echo "--- 🚀 Starting Production Deployment on VPS ---"

# 0. Upgrade Node.js (Required for Vite 7)
if [[ $(node -v) != v2* ]]; then
    echo "Upgrading Node.js to v20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi


# 1. Update project files
echo "Updating project files..."
# Ollama removed - switching to OpenRouter Gemini 2.0 Cloud API

# 3. Setup Project
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi

echo "Installing dependencies..."
pnpm install

# 4. Update Database Schema
echo "Syncing database schema..."
pnpm db:push

# 5. Build the application
echo "Building for production..."
pnpm build

# 5. Restart the application using PM2
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

echo "Restarting application..."
pm2 delete bible-study-pro || true
pm2 start dist/index.js --name "bible-study-pro" --env NODE_ENV=production

echo "--- ✅ Deployment Complete! ---"
echo "Your app is now live and locked into the VPS."
echo "AI Assistant (Ollama) is running in the cloud."
