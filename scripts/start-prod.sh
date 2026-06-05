#!/bin/bash
set -e

if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example and fill in values."
  exit 1
fi

echo "Building and starting IT Inventory (production)..."
docker-compose build --no-cache
docker-compose up -d

echo ""
echo "==================================================="
echo " IT Inventory is running!"
echo " Application: http://localhost"
echo " API Docs: http://localhost/api/docs"
echo " Default login: admin / Admin@123"
echo ""
echo " IMPORTANT: Change the default password immediately!"
echo "==================================================="
