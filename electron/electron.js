const path = require('path');
const { protocol, app, BrowserWindow, ipcMain, dialog } = require('electron');
const isDev = process.env.IS_DEV == "true" ? true : false;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

let win;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
      contextIsolation: true,
      webSecurity: false
    },
  });
  win = mainWindow;
  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../index.html')}`
  );
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle("openFileExplorer", (event, payload) => {
  let path = dialog.showOpenDialogSync(win, {
    properties: ['openFile'],
    message: "select torrent file"
  });
  if (path){
    return path[0];
  }
})

ipcMain.handle("openFolderExplorer", (event, payload) => {
  let path = dialog.showOpenDialogSync(win, {
    properties: ['openDirectory'],
    message:"select torrent folder"
  });
  if (path) {
    return path[0];
  }
})

ipcMain.handle("openSaveFileExplorer", (event, payload) => {
  let path = dialog.showSaveDialogSync(win, {
    filters: {
      name: "torrent",
      extensions: [".torrent"]
    }
  });
  if (path) {
    return path[0];
  }
})

if (isDev) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}
