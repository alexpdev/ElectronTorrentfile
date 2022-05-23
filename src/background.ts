"use strict";

const path = require("path");
const { protocol, app, BrowserWindow, ipcMain, dialog } = require('electron');
const {Torrent, TorrentV2, TorrentV3} = require("./torrentfilejs/torrent");
import { app, protocol, BrowserWindow } from "electron";
import { createProtocol } from "vue-cli-plugin-electron-builder/lib";
import installExtension, { VUEJS3_DEVTOOLS } from "electron-devtools-installer";

const isDev = process.env.IS_DEV == "true" ? true : false;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

let win;

async function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: process.env
      .ELECTRON_NODE_INTEGRATION as unknown as boolean,
      contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
  });

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL as string);
    if (!process.env.IS_TEST) win.webContents.openDevTools();
  } else {
    createProtocol("app");
    win.loadURL("app://./index.html");
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("ready", async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    try {
      await installExtension(VUEJS3_DEVTOOLS);
    } catch (e) {
      console.error("Vue Devtools failed to install:", e.toString());
    }
  }
  createWindow();
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

ipcMain.handle("createTorrent", (event, payload, version) => {
  let torrent;
  if (version == 1)
    torrent = new Torrent(...payload);
  else if (version == 2)
    torrent = new TorrentV2(...payload);
  else
    torrent = new TorrentV3(...payload);
  torrent.assemble();
  torrent.write();
  return torrent
})

ipcMain.handle("openSaveFileExplorer", (event, payload) => {
  let path = dialog.showSaveDialogSync(win, {filters :[
    {name: 'torrent', extensions: ['.torrent']}
  ]
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
