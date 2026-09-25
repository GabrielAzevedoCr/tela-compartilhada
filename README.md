# Tela Compartilhada

Compartilhamento de tela P2P via **Radmin VPN** — sem servidor pago, até **1080p 60fps**.  
Funciona no **Windows** e no **Linux** (X11 e Wayland).

---

## Como funciona

- Quem quer compartilhar a tela **cria uma sala** (vira o servidor de sinalização WebSocket).
- Quem quer assistir **entra na sala** usando o IP da Radmin VPN do criador (`26.x.x.x:porta`).
- O vídeo vai **direto de PC para PC** via WebRTC — sem servidor intermediário.

---

## Instalar dependências

```bash
npm install
```

> Na primeira vez pode pedir aprovação do script do Electron:
> ```bash
> npm approve-scripts electron@33.4.0
> npm install
> ```

---

## Rodar em desenvolvimento

```bash
npm start
```

---

## Gerar executável

### Windows (.exe — instalador NSIS + portátil)

```bash
npm run dist:win
```

> **Atenção (Windows sem Developer Mode):**  
> Se o build travar com erro de `symlink`, rode o build diretamente com:
> ```bash
> set CSC_IDENTITY_AUTO_DISCOVERY=false && npx electron-builder --win portable --x64
> ```
> Ou ative o **Modo Desenvolvedor** em:  
> Configurações → Sistema → Para Desenvolvedores → Modo Desenvolvedor ✔

### Linux (.AppImage + .deb)

```bash
npm run dist:linux
```

Os arquivos gerados ficam na pasta `dist/`.

---

## Linux — captura de tela

| Ambiente | Comportamento |
|----------|--------------|
| **X11**  | Modal de seleção visual igual ao Windows |
| **Wayland** | Abre o seletor nativo do sistema (portal XDG) |

Se a captura não funcionar no Wayland, inicie assim:
```bash
./TelaCompartilhada-*.AppImage --enable-features=WebRTCPipeWireCapturer
```

---

## Windows Defender

O executável **não tem assinatura digital** (requer certificado pago).  
Para evitar alertas do Defender:

1. Use o **instalador NSIS** (`TelaCompartilhada-Setup-*.exe`) — menos suspeito que portátil.
2. Adicione uma exceção no Defender para a pasta de instalação.
3. Para distribuição pública, considere assinar com um certificado EV (~$300/ano).

---

## Tecnologias

- [Electron](https://electronjs.org) — shell desktop
- [WebRTC](https://webrtc.org) — transmissão P2P de vídeo
- [ws](https://github.com/websockets/ws) — servidor de sinalização WebSocket embutido
- [Radmin VPN](https://www.radmin-vpn.com) — rede virtual gratuita para conectar os PCs
