const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  switchTo: (id) => ipcRenderer.send('switch', id),
  reorder: (order) => ipcRenderer.send('reorder', order),
  getConfig: () => ipcRenderer.invoke('config'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
});
