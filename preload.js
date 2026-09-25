const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // App
  getVersion:       ()     => ipcRenderer.invoke('app:version'),
  getPlatform:      ()     => ipcRenderer.invoke('app:platform'),

  // Perfil
  getProfile:       ()     => ipcRenderer.invoke('profile:get'),
  saveProfile:      (p)    => ipcRenderer.invoke('profile:save', p),
  pickAvatar:       ()     => ipcRenderer.invoke('profile:pick-avatar'),

  // Fontes de captura
  listSources:      ()     => ipcRenderer.invoke('sources:list'),

  // Presets de qualidade
  getQualityPresets: ()    => ipcRenderer.invoke('quality:presets'),

  // Rede
  listLocalIps:     ()     => ipcRenderer.invoke('network:list-ips'),

  // Servidor de sinalização
  startSignaling:   (opts) => ipcRenderer.invoke('signaling:start', opts),
  stopSignaling:    ()     => ipcRenderer.invoke('signaling:stop')
});
