#!/bin/sh
cd "$(dirname "$0")"
echo
echo "=== Subir Duelo de Figuras a Firebase Hosting ==="
echo
if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node.js. Instálalo desde https://nodejs.org (versión LTS) y vuelve a abrir este archivo."
  read -r _
  exit 1
fi
echo "1/3 Iniciar sesión con tu cuenta de Google (se abre el navegador)..."
npx --yes firebase-tools login
echo
echo "2/3 Tus proyectos de Firebase:"
npx --yes firebase-tools projects:list
echo
printf 'Escribe el "Project ID" de la lista de arriba y pulsa Enter: '
read -r PROJECT
echo
echo "3/3 Subiendo..."
npx --yes firebase-tools deploy --only hosting --project "$PROJECT"
echo
echo 'Si todo ha ido bien, arriba sale "Hosting URL": esa es la dirección del juego.'
read -r _
