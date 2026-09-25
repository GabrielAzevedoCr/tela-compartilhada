#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# build-linux.sh — Gera o AppImage do Tela Compartilhada no Linux
# Uso: bash build-linux.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")"

echo "→ Verificando Node.js..."
if ! command -v node &>/dev/null; then
  echo "✗ Node.js não encontrado. Instale com:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi
echo "✓ Node $(node -v)"

echo "→ Instalando dependências..."
npm install

echo "→ Gerando AppImage e .deb..."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --linux --x64

echo ""
echo "✓ Pronto! Arquivos gerados em dist/"
ls -lh dist/*.AppImage dist/*.deb 2>/dev/null || true
echo ""
echo "Para rodar:"
echo "  chmod +x dist/*.AppImage && ./dist/*.AppImage"
