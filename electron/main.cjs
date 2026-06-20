const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");

const appRoot = path.join(__dirname, "..");

function createWindow() {
  const window = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 860,
    minHeight: 620,
    title: "ChannelForge",
    backgroundColor: "#071016",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.loadFile(path.join(appRoot, "index.html"));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
