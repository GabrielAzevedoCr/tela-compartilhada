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
const outExe  = path.join(ROOT, 'dist', `TelaCompartilhada-Portable-${VERSION}.exe`);

// 0. Remove apenas o .exe da versão atual (não outros arquivos)
if (fs.existsSync(outExe)) {
  try { fs.unlinkSync(outExe); console.log('→ Removido exe anterior:', path.basename(outExe)); }
  catch (e) { console.warn('⚠ Não conseguiu remover exe:', e.message); }
}
// Remove .7z de versões antigas que causam lock
const distFiles = fs.readdirSync(path.join(ROOT, 'dist'));
for (const f of distFiles) {
  if (f.endsWith('.7z')) {
    try { fs.unlinkSync(path.join(ROOT, 'dist', f)); console.log('→ Removido:', f); }
    catch (e) { /* ignora */ }
  }
}

// 1. Extrai o asar atual
console.log('→ Extraindo app.asar...');
if (fs.existsSync(EXTRACT_TO)) fs.rmSync(EXTRACT_TO, { recursive: true });
asar.extractAll(ASAR_FILE, EXTRACT_TO);
console.log('✓ Extraído em', EXTRACT_TO);

// 2. Copia os arquivos modificados
const filesToPatch = [
  ['main.js',              'main.js'],
  ['preload.js',           'preload.js'],
  ['renderer/renderer.js', 'renderer/renderer.js'],
  ['renderer/index.html',  'renderer/index.html'],
  ['renderer/styles.css',  'renderer/styles.css'],
];

console.log('→ Aplicando patches...');
for (const [src, dest] of filesToPatch) {
  const srcPath  = path.join(ROOT, src);
  const destPath = path.join(EXTRACT_TO, dest);
  if (!fs.existsSync(srcPath)) { console.warn('  ⚠ não encontrado:', src); continue; }
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
