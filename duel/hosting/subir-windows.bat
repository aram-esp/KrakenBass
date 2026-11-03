@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Subir Duelo de Figuras a Firebase Hosting ===
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo.
  pause
  exit /b 1
)
echo 1/3 Iniciar sesion con tu cuenta de Google ^(se abre el navegador^)...
call npx --yes firebase-tools login
echo.
echo 2/3 Tus proyectos de Firebase:
call npx --yes firebase-tools projects:list
echo.
set /p PROJECT=Escribe el "Project ID" de la lista de arriba y pulsa Enter: 
echo.
echo 3/3 Subiendo...
call npx --yes firebase-tools deploy --only hosting --project %PROJECT%
echo.
echo Si todo ha ido bien, arriba sale "Hosting URL": esa es la direccion del juego.
pause
