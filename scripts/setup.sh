#!/bin/bash

echo "🚀 Setting up BagOS MCP Server..."

# Ensure config directory exists
mkdir -p ~/.config/bags

echo "📚 Installing dependencies..."
npm install

echo "🔑 Reminder: Please add your keypair to ~/.config/bags/keypair.json or configure it in your .env"
echo "✅ Setup Complete. You can now build and run: npm run lint && npm start"
