@echo off
title SipamClone - Monitoramento
echo ===================================================
echo    Iniciando o servidor do SipamClone...
echo    Aguarde, o seu navegador abrira automaticamente!
echo ===================================================
echo.
cd /d "%~dp0"

echo Iniciando Banco de Dados (se necessario)...
docker-compose -f backend/docker-compose.yml up -d

echo Aguardando 5 segundos para o Banco de Dados iniciar...
timeout /t 5 /nobreak > NUL

echo Iniciando a API Python (Backend)...
start "SipamClone API" cmd /k "cd backend && call venv\Scripts\activate && uvicorn main:app --reload"

echo Iniciando a Interface React (Frontend)...
call npm run dev -- --open
