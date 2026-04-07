@echo off
echo Запуск Erden...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /PID %%a /F 2>nul

start cmd /k "cd backend && npm run dev"

timeout /t 2 /nobreak > nul

start cmd /k "cd frontend && npm run dev"

echo Приложение запускается...
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
pause
