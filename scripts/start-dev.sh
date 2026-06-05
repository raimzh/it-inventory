#!/bin/bash
set -e

# Copy example env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit it before production!"
fi

# Start infrastructure (DB + Redis) only
docker-compose up -d postgres redis

echo "Waiting for PostgreSQL..."
sleep 3

# Start backend in dev mode
cd backend && npm install && npm run start:dev &

# Start frontend in dev mode
cd ../frontend && npm install && npm run dev &

echo ""
echo "==================================================="
echo " IT Inventory started!"
echo " Frontend: http://localhost:3000"
echo " Backend:  http://localhost:3001"
echo " API Docs: http://localhost:3001/api/docs"
echo " Default:  admin / Admin@123"
echo "==================================================="
wait
