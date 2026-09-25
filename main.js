const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  dialog
} = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { startServer, stopServer } = require('./signaling');

// ─── Linux / Wayland: habilita captura de tela via PipeWire ──────────────────
if (process.platform === 'linux') {
  // Necessário para captura no Wayland (ex: GNOME, KDE moderno)
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
  // Evita crash no X11 sem compositor
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

// ─── Paths ────────────────────────────────────────────────────────────────────
const USER_DATA    = app.getPath('userData');
const PROFILE_PATH = path.join(USER_DATA, 'profile.json');
const AVATAR_DIR   = path.join(USER_DATA, 'avatars');

// ─── Defaults ─────────────────────────────────────────────────────────────────
function defaultProfile() {
  return {
    name:        (os.userInfo().username || 'Usuario').slice(0, 24),
    color:       '#4f8cff',
    status:      'disponível',
    avatarPath:  '',
    defaultPort: 8765,
    lastAddress: '',
    theme:       'dark',
    quality:     'high'   // 'high' | 'medium' | 'low'
  };
}

// ─── Profile persistence ──────────────────────────────────────────────────────
function loadProfile() {
  try {
    const raw = fs.readFileSync(PROFILE_PATH, 'utf-8');
    return { ...defaultProfile(), ...JSON.parse(raw) };
  } catch {
    return defaultProfile();
  }
}

function saveProfile(profile) {
  const safe = {
    name:        String(profile.name        || '').slice(0, 24) || defaultProfile().name,
    color:       /^#[0-9a-fA-F]{6}$/.test(profile.color) ? profile.color : '#4f8cff',
    status:      ['disponível','ocupado','ausente','invisível'].includes(profile.status)
                   ? profile.status : 'disponível',
    avatarPath:  String(profile.avatarPath  || '').slice(0, 512),
    defaultPort: Number(profile.defaultPort) || 8765,
    lastAddress: String(profile.lastAddress  || '').slice(0, 64),
    theme:       profile.theme === 'light' ? 'light' : 'dark',
    quality:     ['high','medium','low'].includes(profile.quality) ? profile.quality : 'high'
  };
  fs.mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(safe, null, 2), 'utf-8');
  return safe;
}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow;
let serverHandle = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1200,
    height:          760,
    minWidth:        900,
    minHeight:       600,
    backgroundColor: '#0f1115',
    show:            false,         // não mostra até estar pronto (evita flash branco)
    autoHideMenuBar: true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      webSecurity:      false   // permite carregar file:// para avatares locais
    }
  });

  // Mostra a janela só quando o renderer terminou de pintar o primeiro frame
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // ── Necessário no Electron 33+ para captura manual via desktopCapturer ──────
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    cb({});
  }, { useSystemPicker: false });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverHandle) stopServer(serverHandle);
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: info do app ─────────────────────────────────────────────────────────
ipcMain.handle('app:version',  () => app.getVersion());
ipcMain.handle('app:platform', () => process.platform);  // 'win32' | 'linux' | 'darwin'

// ─── IPC: perfil ──────────────────────────────────────────────────────────────
ipcMain.handle('profile:get',  ()            => loadProfile());
ipcMain.handle('profile:save', (_e, profile) => saveProfile(profile));

// ─── IPC: avatar — abre diálogo nativo de arquivo ─────────────────────────────
ipcMain.handle('profile:pick-avatar', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title:      'Escolher avatar',
    filters:    [{ name: 'Imagens', extensions: ['png','jpg','jpeg','webp','gif'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;

  const src = result.filePaths[0];
  const ext = path.extname(src).toLowerCase() || '.png';
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  const dest = path.join(AVATAR_DIR, `avatar${ext}`);
  fs.copyFileSync(src, dest);
  return dest;
});

// ─── IPC: fontes de captura (telas e janelas) ─────────────────────────────────
ipcMain.handle('sources:list', async () => {
  const sources = await desktopCapturer.getSources({
    types:            ['screen', 'window'],
    thumbnailSize:    { width: 256, height: 144 },  // menor = mais rápido
    fetchWindowIcons: false                          // ícones de app são lentos
  });
  return sources.map((s) => ({
    id:        s.id,
    name:      s.name,
    thumbnail: s.thumbnail.toDataURL()
  }));
});

// ─── IPC: presets de qualidade → retornados ao renderer para getUserMedia ──────
const QUALITY_PRESETS = {
  high:   { width: 1920, height: 1080, frameRate: 60, bitrate: 8_000_000 },
  medium: { width: 1280, height:  720, frameRate: 30, bitrate: 3_000_000 },
  low:    { width:  854, height:  480, frameRate: 15, bitrate: 1_000_000 }
};

ipcMain.handle('quality:presets', () => QUALITY_PRESETS);

// ─── IPC: IPs locais ──────────────────────────────────────────────────────────
ipcMain.handle('network:list-ips', () => {
  const nets   = os.networkInterfaces();
  const result = [];
  for (const name of Object.keys(nets)) {
    for (const net of (nets[name] || [])) {
      if (net.family === 'IPv4' && !net.internal) {
        result.push({
          iface:    name,
          address:  net.address,
          isRadmin: net.address.startsWith('26.')
        });
      }
    }
  }
  result.sort((a, b) => (b.isRadmin ? 1 : 0) - (a.isRadmin ? 1 : 0));
  return result;
});

// ─── IPC: servidor de sinalização ─────────────────────────────────────────────
ipcMain.handle('signaling:start', (_e, { port, password }) => {
  if (serverHandle) return { ok: false, error: 'Servidor já está rodando.' };
  try {
    serverHandle = startServer({ port: Number(port) || 8765, password: password || '' });
    return { ok: true, port: Number(port) || 8765 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('signaling:stop', () => {
  if (serverHandle) {
    stopServer(serverHandle);
    serverHandle = null;
  }
  return { ok: true };
});
