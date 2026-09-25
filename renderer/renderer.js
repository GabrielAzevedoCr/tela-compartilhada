/* global api */
'use strict';

// ─── Estado global ─────────────────────────────────────────────────────────────
const state = {
  profile:        null,
  platform:       'win32',   // 'win32' | 'linux' | 'darwin'
  qualityPresets: {},
  ws:             null,
  myId:           null,
  isHost:         false,
  peers:          [],
  broadcasting:   false,
  localStream:    null,
  broadcastPCs:   new Map(),   // viewerId  → RTCPeerConnection
  watchPCs:       new Map(),   // hostId    → RTCPeerConnection
  roomAddress:    '',
  selectedSource: null
};

// ─── ICE: STUN público (fallback fora da Radmin, não obrigatório na LAN) ──────
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ═══════════════════════════ NAVEGAÇÃO ══════════════════════════════════════════
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === name)
  );
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    showView(btn.dataset.view);
  });
});

// ═══════════════════════════ TEMA ════════════════════════════════════════════════
document.getElementById('btnThemeToggle').addEventListener('click', async () => {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  if (state.profile) {
    state.profile.theme = next;
    await api.saveProfile(state.profile);
  }
});

// ═══════════════════════════ PERFIL ══════════════════════════════════════════════
async function loadProfileIntoUI() {
  // Paraleliza as 3 chamadas IPC em vez de esperar uma por uma
  [state.profile, state.platform, state.qualityPresets] = await Promise.all([
    api.getProfile(),
    api.getPlatform(),
    api.getQualityPresets()
  ]);

  const p = state.profile;
  document.documentElement.dataset.theme = p.theme || 'dark';

  document.getElementById('profileName').value         = p.name;
  document.getElementById('profileColor').value        = p.color;
  document.getElementById('profileStatus').value       = p.status       || 'disponível';
  document.getElementById('profileDefaultPort').value  = p.defaultPort;
  document.getElementById('profileQuality').value      = p.quality      || 'high';
  document.getElementById('qualitySelect').value       = p.quality      || 'high';

  if (p.lastAddress) document.getElementById('joinAddress').value = p.lastAddress;
  document.getElementById('createPort').value = p.defaultPort;

  // Mostra dica sobre Wayland no Linux
  if (state.platform === 'linux') {
    const hint = document.getElementById('linuxHint');
    if (hint) hint.hidden = false;
  }

  updateAvatarUI(p.avatarPath);
  updateProfileBadge();
  updateSidebarBadge();
}

// Converte path absoluto em URL file:// compatível com Windows e Linux
function toFileUrl(p) {
  if (!p) return '';
  if (process && process.platform === 'win32') {
    return 'file:///' + p.replace(/\\/g, '/');
  }
  return 'file://' + p;
}

function updateAvatarUI(avatarPath) {
  const el = document.getElementById('avatarPreview');
  if (avatarPath) {
    el.style.backgroundImage = `url("${toFileUrl(avatarPath)}")`;
    el.dataset.initial = '';
  } else {
    el.style.backgroundImage = '';
    el.dataset.initial = (state.profile?.name || '?')[0].toUpperCase();
  }
}

function updateProfileBadge() {
  const el  = document.getElementById('profilePreviewBadge');
  const p   = state.profile;
  el.innerHTML = `
    <span class="dot" style="background:${p.color}"></span>
    ${escapeHtml(p.name)}
    <span class="status-dot status-${p.status || 'disponível'}"></span>
  `;
}

function updateSidebarBadge() {
  const p      = state.profile;
  const avatar = document.getElementById('sidebarAvatar');
  const nameEl = document.getElementById('sidebarName');
  const statEl = document.getElementById('sidebarStatus');

  if (p.avatarPath) {
    avatar.style.backgroundImage = `url("${toFileUrl(p.avatarPath)}")`;
    avatar.dataset.initial = '';
  } else {
    avatar.style.backgroundImage = '';
    avatar.dataset.initial = (p.name || '?')[0].toUpperCase();
  }
  avatar.style.borderColor   = p.color;
  nameEl.textContent         = p.name;
  statEl.textContent         = p.status || 'disponível';
  statEl.className           = `sidebar-status status-text-${p.status || 'disponível'}`;
}

// ── Live update dos inputs ─────────────────────────────────────────────────────
document.getElementById('profileName').addEventListener('input', (e) => {
  state.profile.name = e.target.value;
  updateProfileBadge();
  updateSidebarBadge();
});
document.getElementById('profileColor').addEventListener('input', (e) => {
  state.profile.color = e.target.value;
  updateProfileBadge();
  updateSidebarBadge();
});
document.getElementById('profileStatus').addEventListener('change', (e) => {
  state.profile.status = e.target.value;
  updateProfileBadge();
  updateSidebarBadge();
});

// ── Avatar ─────────────────────────────────────────────────────────────────────
document.getElementById('btnPickAvatar').addEventListener('click', async () => {
  const filePath = await api.pickAvatar();
  if (!filePath) return;
  state.profile.avatarPath = filePath;
  updateAvatarUI(filePath);
  updateSidebarBadge();
});

document.getElementById('btnRemoveAvatar').addEventListener('click', () => {
  state.profile.avatarPath = '';
  updateAvatarUI('');
  updateSidebarBadge();
});

// ── Salvar perfil ──────────────────────────────────────────────────────────────
document.getElementById('btnSaveProfile').addEventListener('click', async () => {
  const profile = {
    name:        document.getElementById('profileName').value.trim() || 'Usuário',
    color:       document.getElementById('profileColor').value,
    status:      document.getElementById('profileStatus').value,
    avatarPath:  state.profile.avatarPath || '',
    defaultPort: Number(document.getElementById('profileDefaultPort').value) || 8765,
    lastAddress: state.profile.lastAddress || '',
    theme:       document.documentElement.dataset.theme || 'dark',
    quality:     document.getElementById('profileQuality').value || 'high'
  };

  state.profile = await api.saveProfile(profile);
  document.getElementById('createPort').value    = state.profile.defaultPort;
  document.getElementById('qualitySelect').value = state.profile.quality;
  updateProfileBadge();
  updateSidebarBadge();

  // Notifica peers na sala
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({
      type:   'update-profile',
      name:   state.profile.name,
      color:  state.profile.color,
      status: state.profile.status
    }));
  }

  setStatus('profileStatus', 'Perfil salvo!', 'ok');
  setTimeout(() => setStatus('profileStatus', '', ''), 2500);
});

// ═══════════════════════════ IPs LOCAIS ══════════════════════════════════════════
async function loadIps() {
  const ips = await api.listLocalIps();
  const el  = document.getElementById('ipList');
  if (!ips.length) {
    el.innerHTML = '<span class="muted">Nenhum IP de rede encontrado.</span>';
    return;
  }
  el.innerHTML = ips.map((ip) => `
    <div class="ip-row ${ip.isRadmin ? 'radmin' : ''}">
      <code>${ip.address}</code>
      <span class="ip-label">${ip.isRadmin ? '✓ Radmin VPN' : ip.iface}</span>
      ${ip.isRadmin
        ? `<button class="secondary small copy-btn" data-addr="${ip.address}:${state.profile?.defaultPort || 8765}">Copiar</button>`
        : ''}
    </div>
  `).join('');

  el.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.addr).then(() => {
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = 'Copiar'; }, 1500);
      });
    });
  });
}

document.getElementById('ipDetails').addEventListener('toggle', (e) => {
  if (e.target.open) loadIps();
});

// ═══════════════════════════ CRIAR / ENTRAR ═══════════════════════════════════════
document.getElementById('btnCreateRoom').addEventListener('click', async () => {
  const port     = Number(document.getElementById('createPort').value)    || 8765;
  const password = document.getElementById('createPassword').value;

  const res = await api.startSignaling({ port, password });
  if (!res.ok) { setStatus('createStatus', res.error, 'error'); return; }

  state.isHost = true;
  setStatus('createStatus', 'Sala criada, conectando...', 'ok');
  connectToRoom(`127.0.0.1:${port}`, password, true);
});

document.getElementById('btnJoinRoom').addEventListener('click', () => {
  const address  = document.getElementById('joinAddress').value.trim();
  const password = document.getElementById('joinPassword').value;
  if (!address.includes(':')) {
    setStatus('joinStatus', 'Use o formato ip:porta — ex: 26.12.34.56:8765', 'error');
    return;
  }
  state.isHost = false;
  setStatus('joinStatus', 'Conectando...', 'ok');
  connectToRoom(address, password, false);
});

function connectToRoom(address, password, isHost) {
  const ws = new WebSocket(`ws://${address}`);
  state.ws  = ws;
  state.roomAddress = address;

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({
      type:     'join',
      name:     state.profile.name,
      color:    state.profile.color,
      status:   state.profile.status || 'disponível',
      password
    }));
  });

  ws.addEventListener('message', (ev) => handleSignalingMessage(JSON.parse(ev.data)));
  ws.addEventListener('close',   () => { if (state.myId) resetRoomUI(); });
  ws.addEventListener('error',   () => {
    setStatus(isHost ? 'createStatus' : 'joinStatus',
      'Não foi possível conectar. Confirme que a Radmin VPN está ativa e o endereço está certo.',
      'error');
  });
}

async function handleSignalingMessage(msg) {
  if (msg.type === 'welcome') {
    state.myId = msg.id;
    enterRoomUI();
    if (!state.isHost) {
      state.profile.lastAddress = state.roomAddress;
      await api.saveProfile(state.profile);
    }
    return;
  }
  if (msg.type === 'error') {
    setStatus(state.isHost ? 'createStatus' : 'joinStatus', msg.message, 'error');
    return;
  }
  if (msg.type === 'peers') {
    state.peers = msg.peers.filter((p) => p.id !== state.myId);
    renderPeerList();
    return;
  }
  if (msg.type === 'signal') {
    await handlePeerSignal(msg.from, msg.data);
    return;
  }
}

function enterRoomUI() {
  document.querySelector('[data-view="room"]').disabled = false;
  document.getElementById('roomAddress').textContent = state.roomAddress;
  showView('room');
}

function resetRoomUI() {
  stopBroadcast();
  for (const pc of state.watchPCs.values()) pc.close();
  state.watchPCs.clear();
  document.getElementById('videoGrid').innerHTML = '';
  document.getElementById('videoEmpty').hidden   = false;
  document.getElementById('videoGrid').appendChild(document.getElementById('videoEmpty'));
  document.getElementById('peerList').innerHTML  = '';
  document.getElementById('peerCount').textContent = '0';
  document.querySelector('[data-view="room"]').disabled = true;
  state.myId  = null;
  state.peers = [];
  showView('home');
}

document.getElementById('btnLeaveRoom').addEventListener('click', () => {
  if (state.ws) state.ws.close();
  if (state.isHost) api.stopSignaling();
  resetRoomUI();
});

// ═══════════════════════════ LISTA DE PEERS ═══════════════════════════════════════
function renderPeerList() {
  const ul = document.getElementById('peerList');
  document.getElementById('peerCount').textContent = state.peers.length;
  ul.innerHTML = '';

  for (const p of state.peers) {
    const watching = state.watchPCs.has(p.id);
    const li       = document.createElement('li');
    li.className   = 'peer-item';
    li.innerHTML = `
      <div class="peer-avatar" style="border-color:${p.color}"
           data-initial="${escapeHtml((p.name||'?')[0].toUpperCase())}"></div>
      <div class="peer-info">
        <span class="peer-name">${escapeHtml(p.name)}</span>
        <span class="peer-status status-text-${p.status || 'disponível'}">${p.status || 'disponível'}</span>
      </div>
      <div class="peer-actions">
        ${p.broadcasting
          ? `<button class="peer-btn ${watching ? 'danger' : 'primary'}"
               data-action="${watching ? 'stop' : 'watch'}"
               data-id="${p.id}">
               ${watching ? 'Parar' : 'Assistir'}
             </button>`
          : '<span class="muted small">sem transmissão</span>'
        }
      </div>
    `;
    ul.appendChild(li);
  }

  ul.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.dataset.action === 'watch' ? startWatching(btn.dataset.id) : stopWatching(btn.dataset.id);
    });
  });

  document.getElementById('videoEmpty').hidden = state.watchPCs.size > 0;
}

// ═══════════════════════════ QUALIDADE ════════════════════════════════════════════
document.getElementById('qualitySelect').addEventListener('change', (e) => {
  if (state.profile) {
    state.profile.quality = e.target.value;
    api.saveProfile(state.profile);
  }
  if (state.broadcasting) applyBitrateToSenders(e.target.value);
});

function getActivePreset() {
  const q = document.getElementById('qualitySelect').value || 'high';
  return state.qualityPresets[q] || { width: 1920, height: 1080, frameRate: 60, bitrate: 8_000_000 };
}

async function applyBitrateToSenders(quality) {
  const preset = state.qualityPresets[quality];
  if (!preset) return;
  for (const pc of state.broadcastPCs.values()) {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = preset.bitrate;
        await sender.setParameters(params);
      } catch { /* navegador pode não suportar */ }
    }
  }
}

// ═══════════════════════════ MODAL DE FONTE ═══════════════════════════════════════
const sourceModal = document.getElementById('sourceModal');
let activeTab     = 'screen';
let allSources    = [];

async function openSourceModal() {
  sourceModal.hidden   = false;
  allSources           = await api.listSources();
  renderSourceGrid(activeTab);
  document.getElementById('btnConfirmSource').disabled = true;
  state.selectedSource = null;
}

function renderSourceGrid(tab) {
  const grid     = document.getElementById('sourceGrid');
  grid.innerHTML = '';
  const filtered = allSources.filter((s) =>
    tab === 'screen' ? s.id.startsWith('screen:') : !s.id.startsWith('screen:')
  );
  if (!filtered.length) {
    grid.innerHTML = '<p class="muted" style="padding:20px;grid-column:1/-1">Nenhuma fonte encontrada.</p>';
    return;
  }
  filtered.forEach((src) => {
    const item       = document.createElement('div');
    item.className   = 'source-item';
    item.dataset.id  = src.id;
    item.innerHTML   = `
      <div class="source-thumb"><img src="${src.thumbnail}" alt="${escapeHtml(src.name)}" /></div>
      <span class="source-name">${escapeHtml(src.name)}</span>
    `;
    item.addEventListener('click', () => {
      grid.querySelectorAll('.source-item').forEach((el) => el.classList.remove('selected'));
      item.classList.add('selected');
      state.selectedSource = { id: src.id, name: src.name };
      document.getElementById('btnConfirmSource').disabled = false;
    });
    grid.appendChild(item);
  });
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    renderSourceGrid(activeTab);
    document.getElementById('btnConfirmSource').disabled = true;
    state.selectedSource = null;
  });
});

document.getElementById('btnCloseSourceModal').addEventListener('click',  () => { sourceModal.hidden = true; });
document.getElementById('btnCancelSource').addEventListener('click',      () => { sourceModal.hidden = true; });
sourceModal.addEventListener('click', (e) => { if (e.target === sourceModal) sourceModal.hidden = true; });

document.getElementById('btnConfirmSource').addEventListener('click', async () => {
  if (!state.selectedSource) return;
  sourceModal.hidden = true;
  await startBroadcastWithSource(state.selectedSource.id);
});

// ═══════════════════════════ TRANSMITIR ════════════════════════════════════════════
document.getElementById('btnToggleBroadcast').addEventListener('click', async () => {
  if (state.broadcasting) { stopBroadcast(); return; }
  await openSourceModal();
});

// ─── Captura de áudio do sistema (loopback) excluindo Discord ─────────────────
//
// Estratégia:
//   Windows: getUserMedia com chromeMediaSource:'desktop' captura áudio loopback
//            do sistema inteiro. Filtramos o Discord com Web Audio API —
//            abrimos também o microfone do Discord via enumerateDevices e
//            subtraímos do mix usando um InverterNode (phase inversion).
//            Na prática, a forma mais confiável é capturar loopback do sistema
//            e usar um GainNode que muta quando detecta fala no canal do Discord.
//            MAS o Electron não expõe qual processo gerou o áudio.
//            Solução real usada aqui: captura loopback normal + instrução ao
//            usuário para mutar Discord nas configurações de som do Windows/Linux.
//
//   Linux:   getDisplayMedia com audio:true deixa o PipeWire/portal escolher
//            a fonte de áudio separadamente (o usuário pode excluir Discord lá).

async function captureSystemAudio(sourceId) {
  const includeAudio = document.getElementById('chkIncludeAudio')?.checked ?? true;
  if (!includeAudio) return null;

  let audioStream = null;

  try {
    if (state.platform === 'linux') {
      // No Linux com PipeWire o áudio vem junto no getDisplayMedia
      return null; // será tratado junto com o vídeo
    }

    // Windows: captura loopback do sistema via chromeMediaSource desktop
    // O sourceId 'screen:0:0' captura o áudio de toda saída de áudio do sistema
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop'
          // Não passa chromeMediaSourceId para pegar o loopback geral do sistema
        }
      },
      video: false
    });
  } catch (err) {
    console.warn('Áudio do sistema não disponível:', err.message);
    return null;
  }

  return audioStream;
}

async function startBroadcastWithSource(sourceId) {
  const preset = getActivePreset();
  let stream;
  const includeAudio = document.getElementById('chkIncludeAudio')?.checked ?? true;

  try {
    if (state.platform === 'linux') {
      // ── Linux: getDisplayMedia com audio:true (PipeWire escolhe a fonte) ──────
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width:     { ideal: preset.width },
            height:    { ideal: preset.height },
            frameRate: { ideal: preset.frameRate }
          },
          audio: includeAudio   // PipeWire abre seletor de fonte de áudio
        });
      } catch {
        // Fallback X11: sem áudio
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource:   'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth:            preset.width,
              maxHeight:           preset.height,
              maxFrameRate:        preset.frameRate
            }
          }
        });
      }
    } else {
      // ── Windows: captura vídeo da fonte escolhida ────────────────────────────
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource:   'desktop',
            chromeMediaSourceId: sourceId,
            minWidth:            preset.width,
            maxWidth:            preset.width,
            minHeight:           preset.height,
            maxHeight:           preset.height,
            maxFrameRate:        preset.frameRate
          }
        }
      });

      // ── Windows: adiciona áudio loopback do sistema separadamente ─────────────
      if (includeAudio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: { chromeMediaSource: 'desktop' }
            },
            video: false
          });

          // Pega a track de áudio e mistura com o stream de vídeo
          const audioTrack = audioStream.getAudioTracks()[0];
          if (audioTrack) {
            stream.addTrack(audioTrack);
          }
        } catch (audioErr) {
          // Áudio do sistema não disponível (normal em algumas configs do Windows)
          console.warn('Loopback de áudio não disponível:', audioErr.message);
          setStatus('broadcastStatus',
            '⚠ Sem áudio do sistema — ative "Mixagem estéreo" ou "What U Hear" no painel de som do Windows.',
            'error');
          setTimeout(() => setStatus('broadcastStatus', '', ''), 6000);
        }
      }
    }
  } catch (err) {
    alert('Não foi possível capturar a tela:\n' + err.message);
    return;
  }

  state.localStream  = stream;
  state.broadcasting = true;

  const btn = document.getElementById('btnToggleBroadcast');
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor"/>
    </svg>
    Parar transmissão
  `;
  btn.classList.replace('primary', 'danger');

  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'set-broadcasting', value: true }));
  }
}

function stopBroadcast() {
  if (!state.broadcasting) return;
  state.broadcasting = false;

  state.localStream?.getTracks().forEach((t) => t.stop());
  state.localStream = null;

  for (const pc of state.broadcastPCs.values()) pc.close();
  state.broadcastPCs.clear();

  const btn = document.getElementById('btnToggleBroadcast');
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M5.5 5l3 2-3 2V5z" fill="currentColor"/>
    </svg>
    Transmitir
  `;
  btn.classList.replace('danger', 'primary');

  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'set-broadcasting', value: false }));
  }
}

// ═══════════════════════════ WEBRTC ════════════════════════════════════════════════
function sendSignal(to, data) {
  state.ws.send(JSON.stringify({ type: 'signal', to, data }));
}

function preferVideoCodec(pc, mimeType) {
  try {
    const caps = RTCRtpSender.getCapabilities('video');
    if (!caps) return;
    const preferred = caps.codecs.filter((c) => c.mimeType.toLowerCase() === mimeType.toLowerCase());
    if (!preferred.length) return;
    const rest = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== mimeType.toLowerCase());
    for (const t of pc.getTransceivers()) {
      if (t.sender?.track?.kind === 'video') {
        try { t.setCodecPreferences([...preferred, ...rest]); } catch { /* unsupported */ }
      }
    }
  } catch { /* ignore */ }
}

async function handlePeerSignal(fromId, data) {
  // ── Transmissor: recebeu watch-request ────────────────────────────────────
  if (data.kind === 'watch-request') {
    if (!state.broadcasting || !state.localStream) return;

    const pc = new RTCPeerConnection(ICE_CONFIG);
    state.broadcastPCs.set(fromId, pc);
    state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(fromId, { kind: 'candidate', candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (['failed','disconnected','closed'].includes(pc.connectionState)) {
        pc.close(); state.broadcastPCs.delete(fromId);
      }
    };

    // Prefere H264 no Windows/Mac; VP8/VP9 no Linux (melhor suporte sem hardware)
    if (state.platform === 'linux') {
      preferVideoCodec(pc, 'video/VP9');
    } else {
      preferVideoCodec(pc, 'video/H264');
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Aplica limite de bitrate
    const preset = getActivePreset();
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = preset.bitrate;
        await sender.setParameters(params);
      } catch { /* ignore */ }
    }

    sendSignal(fromId, { kind: 'offer', sdp: offer });
    return;
  }

  // ── Espectador: recebeu offer ──────────────────────────────────────────────
  if (data.kind === 'offer') {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    state.watchPCs.set(fromId, pc);

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(fromId, { kind: 'candidate', candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      addVideoTile(fromId, e.streams[0]);
      document.getElementById('videoEmpty').hidden = true;
    };
    pc.onconnectionstatechange = () => {
      if (['failed','disconnected','closed'].includes(pc.connectionState)) {
        pc.close(); state.watchPCs.delete(fromId);
        removeVideoTile(fromId);
        if (!state.watchPCs.size) document.getElementById('videoEmpty').hidden = false;
        renderPeerList();
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal(fromId, { kind: 'answer', sdp: answer });
    renderPeerList();
    return;
  }

  // ── Transmissor: recebeu answer ────────────────────────────────────────────
  if (data.kind === 'answer') {
    const pc = state.broadcastPCs.get(fromId);
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    return;
  }

  // ── Candidato ICE ─────────────────────────────────────────────────────────
  if (data.kind === 'candidate') {
    const pc = state.broadcastPCs.get(fromId) || state.watchPCs.get(fromId);
    if (pc) {
      try { await pc.addIceCandidate(data.candidate); } catch { /* candidato atrasado */ }
    }
  }
}

// ═══════════════════════════ ASSISTIR ═════════════════════════════════════════════
function startWatching(peerId) { sendSignal(peerId, { kind: 'watch-request' }); }

function stopWatching(peerId) {
  const pc = state.watchPCs.get(peerId);
  if (pc) { pc.close(); state.watchPCs.delete(peerId); }
  removeVideoTile(peerId);
  if (!state.watchPCs.size) document.getElementById('videoEmpty').hidden = false;
  renderPeerList();
}

// ═══════════════════════════ TILES DE VÍDEO ═══════════════════════════════════════
function addVideoTile(peerId, stream) {
  removeVideoTile(peerId);
  const peer  = state.peers.find((p) => p.id === peerId);
  const label = peer ? escapeHtml(peer.name) : 'Alguém';

  const tile       = document.createElement('div');
  tile.className   = 'video-tile';
  tile.id          = 'tile-' + peerId;
  tile.innerHTML = `
    <video autoplay playsinline></video>
    <div class="tile-overlay">
      <span class="tile-label">${label}</span>
      <div class="tile-controls">
        <label class="tile-volume" title="Volume">
          🔊 <input type="range" min="0" max="1" step="0.05" value="1" />
        </label>
        <button class="tile-fs-btn" title="Tela cheia">⛶</button>
        <button class="tile-close-btn" title="Fechar">✕</button>
      </div>
    </div>
    <div class="tile-stats" id="stats-${peerId}"></div>
  `;

  const video = tile.querySelector('video');
  video.srcObject = stream;

  tile.querySelector('.tile-close-btn').addEventListener('click', () => stopWatching(peerId));
  tile.querySelector('.tile-fs-btn').addEventListener('click',    () => video.requestFullscreen?.());
  tile.querySelector('input[type="range"]').addEventListener('input', (e) => {
    video.volume = Number(e.target.value);
  });
  tile.addEventListener('dblclick', () => video.requestFullscreen?.());

  startStatsPolling(peerId);
  document.getElementById('videoGrid').appendChild(tile);
}

function removeVideoTile(peerId) {
  stopStatsPolling(peerId);
  document.getElementById('tile-' + peerId)?.remove();
}

// ─── Stats de conexão (fps + resolução) ───────────────────────────────────────
const statsTimers = new Map();
function startStatsPolling(peerId) {
  stopStatsPolling(peerId);
  const timer = setInterval(async () => {
    const pc = state.watchPCs.get(peerId);
    const el = document.getElementById('stats-' + peerId);
    if (!pc || !el) { stopStatsPolling(peerId); return; }
    try {
      const reports = await pc.getStats();
      let fps = 0, resolution = '';
      reports.forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'video') {
          fps        = Math.round(r.framesPerSecond || 0);
          resolution = r.frameWidth ? `${r.frameWidth}×${r.frameHeight}` : '';
        }
      });
      el.textContent = fps ? `${resolution} · ${fps}fps` : '';
    } catch { /* ignore */ }
  }, 3000);
  statsTimers.set(peerId, timer);
}
function stopStatsPolling(peerId) {
  if (statsTimers.has(peerId)) { clearInterval(statsTimers.get(peerId)); statsTimers.delete(peerId); }
}

// ═══════════════════════════ UTILITÁRIOS ═══════════════════════════════════════════
function setStatus(elId, message, kind) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = message;
  el.className   = 'status ' + (kind || '');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

// ═══════════════════════════ INICIALIZAÇÃO ══════════════════════════════════════════
(async function init() {
  // Roda em paralelo: versão e perfil são independentes
  const [ver] = await Promise.all([
    api.getVersion(),
    loadProfileIntoUI()
  ]);
  document.getElementById('appVersion').textContent = `v${ver}`;
})();
