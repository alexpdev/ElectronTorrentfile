const { ipcRenderer, contextBridge } = require("electron");

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }
  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency])
  }
})

contextBridge.exposeInMainWorld('ipc', {
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  once: (channel, func) => {
    ipcRenderer.once(channel, (event, ...args) => {
      func(...args);
    })
  },
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args).then((result) => {
      return result;
    });
  },
  sendSync: (channel, ...args) => {
    return ipcRenderer.sendSync(channel, ...args);
  },
})
