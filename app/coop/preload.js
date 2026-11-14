// Bridge for the two "play with a friend" windows (host.html, guest.html). Only these channels exist.
const { contextBridge, ipcRenderer } = require('electron');

const IN = new Set(['coop:init', 'coop:capture', 'coop:end', 'coop:pad']);
contextBridge.exposeInMainWorld('coop', {
  on: (ch, cb) => {
    if (IN.has(ch)) ipcRenderer.on(ch, (_e, d) => cb(d));
  },
  // host page
  ready: () => ipcRenderer.send('coop:ready'),
  error: kind => ipcRenderer.send('coop:error', String(kind)),
  joined: (slot, name) => ipcRenderer.send('coop:joined', slot, name),
  left: slot => ipcRenderer.send('coop:left', slot),
  pad: (slot, st) => ipcRenderer.send('coop:pad', slot, st),
  // guest page
  leave: () => ipcRenderer.send('coop:leave'),
});
