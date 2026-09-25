# Tela Compartilhada

Compartilhamento de tela P2P via **Radmin VPN** — sem servidor pago, até **1080p 60fps**.

---

## ⬇️ Download

| Plataforma | Link |
|------------|------|
| **Windows** (portátil, sem instalar) | [TelaCompartilhada-Portable-1.2.0.exe](https://github.com/GabrielAzevedoCr/tela-compartilhada/releases/download/v1.2.0/TelaCompartilhada-Portable-1.2.0.exe) |
| **Linux** (AppImage) | [Gerar no Linux — veja abaixo ↓](#linux) |

> Todas as versões: [github.com/GabrielAzevedoCr/tela-compartilhada/releases](https://github.com/GabrielAzevedoCr/tela-compartilhada/releases)

---

## ⚠️ O .exe NÃO funciona no Linux

O arquivo `.exe` é um executável **Windows**. No Linux ele abre mas fica com **tela preta** porque o sistema não sabe como rodar um `.exe` nativamente.

Para usar no Linux você precisa gerar o **AppImage** — veja abaixo.

---

## Linux

O AppImage precisa ser gerado no próprio Linux. Abra o terminal e rode:

```bash
# 1. Baixe o código fonte
git clone https://github.com/GabrielAzevedoCr/tela-compartilhada.git
cd tela-compartilhada

# 2. Gere o AppImage (instala Node automaticamente se precisar)
bash build-linux.sh
```

Após finalizar, o arquivo estará em `dist/`. Execute assim:

```bash
chmod +x dist/*.AppImage
./dist/*.AppImage
```

### Wayland (GNOME, KDE moderno)
O seletor de tela abre automaticamente via portal do sistema.

### X11
Funciona igual ao Windows — abre um modal visual para escolher a tela/janela.

---

## Como funciona

- Quem compartilha a tela **cria uma sala** (vira o servidor WebSocket).
- Quem quer assistir **entra na sala** com o IP da Radmin VPN do criador (`26.x.x.x:porta`).
- O vídeo vai **direto de PC para PC** via WebRTC — sem servidor intermediário pago.

---

## Rodar em desenvolvimento

```bash
npm install
npm start
```

---

## Gerar o .exe (Windows)

```bash
node fix-cache.js
```

O `.exe` fica em `dist/TelaCompartilhada-Portable-*.exe`.

---

## Tecnologias

- [Electron](https://electronjs.org) — shell desktop
- [WebRTC](https://webrtc.org) — transmissão P2P de vídeo
- [ws](https://github.com/websockets/ws) — servidor de sinalização WebSocket embutido
- [Radmin VPN](https://www.radmin-vpn.com) — rede virtual gratuita para conectar os PCs
