#!/bin/bash
# Roda este script no Linux para gerar o AppImage
# Uso: bash build-linux.sh

set -e
cd "$(dirname "$0")"

echo "==> Verificando Node.js..."
if ! command -v node &>/dev/null; then
  echo "Node.js nao encontrado. Instalando via NVM..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
fi
echo "Node: $(node -v) | npm: $(npm -v)"

echo ""
echo "==> Instalando dependencias..."
npm install

echo ""
echo "==> Gerando AppImage..."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --linux AppImage --x64

echo ""
echo "============================================"
echo " Pronto! Arquivo gerado em dist/"
echo "============================================"
ls -lh dist/*.AppImage 2>/dev/null

echo ""
echo "Para executar:"
APPIMAGE=$(ls dist/*.AppImage 2>/dev/null | head -1)
echo "  chmod +x \"$APPIMAGE\""
echo "  .\"$APPIMAGE\""
