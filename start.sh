#!/bin/bash
echo "Запуск Erden..."

fuser -k 3001/tcp 2>/dev/null

cd backend && npm run dev &
BACKEND_PID=$!

sleep 2

cd ../frontend && npm run dev &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Приложение запущено!"
echo "Backend:  http://localhost:3001"
echo "Frontend: http://localhost:5173"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
