// Electron 22.x is the last release line that runs on Windows 7 / 8 / 8.1 (it also runs on 10 / 11).
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

const cfgPath = [path.join(__dirname, "app-config.json"), path.join(__dirname, "..", "app-config.json")].find(p => fs.existsSync(p));
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const APP_URL = process.env.BULLWISER_URL || cfg.appUrl;
const APP_HOST = new URL(APP_URL).host;
const TRUSTED = [APP_HOST, "checkout.razorpay.com", "api.razorpay.com"];

if (!app.requestSingleInstanceLock()) app.quit();

let win;
function create() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 360, minHeight: 600, backgroundColor: "#0f172a", title: cfg.appName,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  const load = () => win.loadURL(APP_URL);
  win.webContents.on("did-fail-load", (_e, code, _d, url, isMain) => {
    if (!isMain || code === -3) return;
    win.loadFile(path.join(__dirname, "offline.html"), { query: { retry: APP_URL } });
  });
  // Links to other sites open in the user's browser; Razorpay popups stay in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { if (TRUSTED.some(h => new URL(url).host.endsWith(h))) return { action: "allow" }; } catch {}
    shell.openExternal(url); return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    try { const u = new URL(url); if (u.protocol === "file:" || TRUSTED.some(h => u.host.endsWith(h))) return; } catch {}
    e.preventDefault(); shell.openExternal(url);
  });
  load();
}
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
