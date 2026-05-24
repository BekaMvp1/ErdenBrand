@echo off
title ErdenBrand — Запуск
color 0A

echo ==========================================
echo    ERDEN BRAND — Запуск системы
echo ==========================================
echo.

:: Запустить бэкенд в отдельном окне
echo [1/2] Запускаю бэкенд...
start "ErdenBrand BACKEND" cmd /k "cd /d "C:\Users\user\Desktop\Cursor Project\ErdenBrand\backend" && npm run dev"

:: Подождать 3 секунды
timeout /t 3 /nobreak > nul

:: Запустить фронтенд в отдельном окне
echo [2/2] Запускаю фронтенд...
start "ErdenBrand FRONTEND" cmd /k "cd /d "C:\Users\user\Desktop\Cursor Project\ErdenBrand\frontend" && npm run dev"

:: Подождать пока бэкенд стартует
echo.
echo Ожидание запуска сервера (10 сек)...
timeout /t 10 /nobreak > nul

:: Открыть браузер
echo Открываю браузер...
start http://localhost:5173/orders

echo.
echo ==========================================
echo    Система запущена!
echo    Бэкенд:  http://localhost:3001
echo    Фронтенд: http://localhost:5173
echo ==========================================
echo.
echo Не закрывайте окна с BACKEND и FRONTEND
pause
