const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (ch, cb) => {
  const f = (_e, d) => cb(d);
  ipcRenderer.on(ch, f);
  return () => ipcRenderer.removeListener(ch, f);
};

contextBridge.exposeInMainWorld('hub', {
  getLibrary: () => ipcRenderer.invoke('lib:get'),
  addPaths: paths => ipcRenderer.invoke('lib:add', paths),
  pickArt: id => ipcRenderer.invoke('art:pick', id),
  pickProfilePic: () => ipcRenderer.invoke('profile:pick'),
  clearProfilePic: () => ipcRenderer.invoke('profile:clear'),
  setArtFile: (id, file) => ipcRenderer.invoke('art:file', id, file),
  resetArt: id => ipcRenderer.invoke('art:reset', id),
  pathForFile: file => webUtils.getPathForFile(file),
  update: (id, patch) => ipcRenderer.invoke('lib:update', id, patch),
  remove: id => ipcRenderer.invoke('lib:remove', id),
  launch: (id, resume) => ipcRenderer.invoke('game:launch', id, resume),
  setSettings: patch => ipcRenderer.invoke('settings:set', patch),
  toggleFullscreen: () => ipcRenderer.invoke('app:fullscreen'),
  open: which => ipcRenderer.invoke('app:open', which),
  switchStatus: () => ipcRenderer.invoke('switch:status'),
  openSwitchEmu: () => ipcRenderer.invoke('switch:openEmu'),
  pickSwitchEmu: () => ipcRenderer.invoke('switch:pick'),
  wiiuStatus: () => ipcRenderer.invoke('wiiu:status'),
  openWiiuEmu: () => ipcRenderer.invoke('wiiu:openEmu'),
  setControls: (sys, gid, data) => ipcRenderer.invoke('controls:set', sys, gid, data),
  raLogin: (u, p) => ipcRenderer.invoke('ra:login', u, p),
  raLogout: () => ipcRenderer.invoke('ra:logout'),
  raProgress: id => ipcRenderer.invoke('ra:progress', id),
  overlayAction: name => ipcRenderer.send('overlay:action', name),
  selftestInfo: () => ipcRenderer.invoke('selftest:info'),
  selftestDone: r => ipcRenderer.send('selftest:done', r),
  selftestShot: name => ipcRenderer.invoke('selftest:shot', name),
  on,
});
