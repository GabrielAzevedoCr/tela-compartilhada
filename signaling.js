const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const MAX_PEERS      = 12;
const PING_INTERVAL  = 15_000;   // ms entre pings
const PING_TIMEOUT   = 8_000;    // ms para considerar peer morto

/**
 * Inicia o servidor de sinalização WebSocket.
 * @param {{ port: number, password: string }} opts
 * @returns {{ wss: WebSocketServer, peers: Map }}
 */
function startServer({ port, password }) {
  const wss   = new WebSocketServer({ port, host: '0.0.0.0' });
  const peers = new Map(); // id → { ws, name, color, status, avatarPath, broadcasting, alive }

  // ── Broadcast da lista de peers para todos ────────────────────────────────
  function broadcastPeerList() {
    const list = [...peers.entries()].map(([id, p]) => ({
      id,
      name:        p.name,
      color:       p.color,
      status:      p.status,
      avatarPath:  p.avatarPath,
      broadcasting: p.broadcasting
    }));
    const msg = JSON.stringify({ type: 'peers', peers: list });
    for (const p of peers.values()) {
      if (p.ws.readyState === 1) p.ws.send(msg);
    }
  }

  // ── Heartbeat: detecta peers mortos rapidamente ───────────────────────────
  const heartbeatInterval = setInterval(() => {
    for (const [id, p] of peers.entries()) {
      if (!p.alive) {
        // Não respondeu ao último ping: desconecta
        p.ws.terminate();
        peers.delete(id);
        broadcastPeerList();
        continue;
      }
      p.alive = false;
      try {
        p.ws.ping();
      } catch {
        /* ws já fechou */
      }
    }
  }, PING_INTERVAL);

  wss.on('close', () => clearInterval(heartbeatInterval));

  // ── Conexões ──────────────────────────────────────────────────────────────
  wss.on('connection', (ws) => {
    const id     = crypto.randomUUID();
    let joined   = false;
    let pingTimer = null;

    ws.on('pong', () => {
      const p = peers.get(id);
      if (p) p.alive = true;
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // ── join ─────────────────────────────────────────────────────────────
      if (msg.type === 'join') {
        if (password && msg.password !== password) {
          ws.send(JSON.stringify({ type: 'error', message: 'Senha incorreta.' }));
          ws.close();
          return;
        }
        if (peers.size >= MAX_PEERS) {
          ws.send(JSON.stringify({ type: 'error', message: `Sala cheia (máximo ${MAX_PEERS} pessoas).` }));
          ws.close();
          return;
        }
        peers.set(id, {
          ws,
          name:        String(msg.name       || 'Anônimo').slice(0, 24),
          color:       /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : '#4f8cff',
          status:      ['disponível','ocupado','ausente','invisível'].includes(msg.status)
                         ? msg.status : 'disponível',
          avatarPath:  '',      // avatares ficam locais, não trafegam no signaling
          broadcasting: false,
          alive:       true
        });
        joined = true;
        ws.send(JSON.stringify({ type: 'welcome', id }));
        broadcastPeerList();
        return;
      }

      if (!joined) return;

      // ── set-broadcasting ─────────────────────────────────────────────────
      if (msg.type === 'set-broadcasting') {
        const p = peers.get(id);
        if (p) p.broadcasting = !!msg.value;
        broadcastPeerList();
        return;
      }

      // ── update-profile (nome/cor/status durante a sessão) ─────────────────
      if (msg.type === 'update-profile') {
        const p = peers.get(id);
        if (!p) return;
        if (msg.name)  p.name  = String(msg.name).slice(0, 24);
        if (msg.color && /^#[0-9a-fA-F]{6}$/.test(msg.color)) p.color = msg.color;
        if (msg.status && ['disponível','ocupado','ausente','invisível'].includes(msg.status))
          p.status = msg.status;
        broadcastPeerList();
        return;
      }

      // ── relay de sinalização WebRTC ───────────────────────────────────────
      if (msg.type === 'signal' && msg.to) {
        const target = peers.get(msg.to);
        if (target && target.ws.readyState === 1) {
          target.ws.send(JSON.stringify({ type: 'signal', from: id, data: msg.data }));
        }
        return;
      }
    });

    ws.on('close', () => {
      clearTimeout(pingTimer);
      peers.delete(id);
      if (joined) broadcastPeerList();
    });

    ws.on('error', () => {});
  });

  return { wss, peers };
}

/**
 * Para o servidor e fecha todas as conexões abertas.
 * @param {{ wss: WebSocketServer, peers: Map }} handle
 */
function stopServer(handle) {
  if (!handle) return;
  for (const p of handle.peers.values()) {
    try { p.ws.close(); } catch { /* ignore */ }
  }
  try { handle.wss.close(); } catch { /* ignore */ }
}

module.exports = { startServer, stopServer };
