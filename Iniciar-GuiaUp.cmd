@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instale Node.js 24 ou superior para iniciar o GuiaUp.
 pause
 exit /b 1
)
echo GuiaUp: abra http://localhost:3080 no navegador.
echo Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.
node server.js
pause
