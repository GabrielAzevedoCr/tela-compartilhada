/**
 * patch-exe.js
 * Extrai o app.asar existente, substitui os arquivos alterados,
 * reempacota, e reconstrói o portable .exe sem re-baixar o Electron.
 */
'use strict';

const asar   = require('@electron/asar');
const fs     = require('fs');
const path   = require('path');
const { spawnSync } = require('child_process');

const ROOT       = __dirname;
const ASAR_FILE  = path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar');
const EXTRACT_TO = path.join(ROOT, 'dist', 'app-extracted');

// Lê versão atual
const pkg     = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

// 0. Limpa arquivos antigos que causam lock
const oldExes = fs.readdirSync(path.join(ROOT, 'dist')).filter(f => f.endsWith('.exe') || f.endsWith('.7z'));
for (const f of oldExes) {
  try {
    fs.unlinkSync(path.join(ROOT, 'dist', f));
    console.log('→ Removido:', f);
  } catch (e) {
    console.warn('⚠ Não conseguiu remover', f, '—', e.message);
  }
}

// 1. Extrai o asar atual
console.log('→ Extraindo app.asar...');
if (fs.existsSync(EXTRACT_TO)) fs.rmSync(EXTRACT_TO, { recursive: true });
asar.extractAll(ASAR_FILE, EXTRACT_TO);
console.log('✓ Extraído em', EXTRACT_TO);

// 2. Copia os arquivos modificados
const filesToPatch = [
  ['renderer/renderer.js', 'renderer/renderer.js'],
  ['renderer/index.html',  'renderer/index.html'],
  ['renderer/styles.css',  'renderer/styles.css'],
];

console.log('→ Aplicando patches...');
for (const [src, dest] of filesToPatch) {
  const srcPath  = path.join(ROOT, src);
  const destPath = path.join(EXTRACT_TO, dest);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  console.log('  ✓', dest);
}

// 3. Reempacota o asar
console.log('→ Reempacotando app.asar...');
asar.createPackage(EXTRACT_TO, ASAR_FILE).then(() => {
  console.log('✓ app.asar atualizado!\n');

  // 4. Gera o portable com --prepackaged (usa win-unpacked existente, não re-extrai electron)
  console.log('→ Gerando portable .exe (compressão store — rápido)...\n');

  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules', 'electron-builder', 'cli.js'),
      '--win', 'portable',
      '--x64',
      '--prepackaged', path.join(ROOT, 'dist', 'win-unpacked')
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
    }
  );

  const outExe = path.join(ROOT, 'dist', `TelaCompartilhada-Portable-${VERSION}.exe`);

  if (result.status === 0 && fs.existsSync(outExe)) {
    const sizeMb = (fs.statSync(outExe).size / 1_048_576).toFixed(1);
    console.log(`\n✓ Pronto! dist/TelaCompartilhada-Portable-${VERSION}.exe (${sizeMb} MB)`);
  } else {
    console.log('\n⚠ electron-builder retornou:', result.status);
    console.log('  O app já está atualizado em dist/win-unpacked/');
    console.log(`  Rode direto: "dist\\win-unpacked\\Tela Compartilhada.exe"`);
  }
}).catch(err => {
  console.error('✗ Erro ao reempacotar:', err.message);
  process.exit(1);
});
