const {
  app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, session,
} = require('electron');
const path = require('path');
const fs = require('fs');

const COUNT = 9;
const MAX_LOADED = 2;   // only this many accounts stay alive in RAM (logins stay saved either way)
const SIDEBAR = 72;
const TOPBAR = 12;      // thin strip above Discord that drags the window
const BG = '#0a0a0a';
const HOME = 'https://discord.com/app';

// ---- slots ----
// A slot id never changes and owns one saved login (its partition).
// The sidebar only changes the ORDER of ids, so an account can never swap logins.
const IDS = Array.from({ length: COUNT }, (_, k) => k);
const partitionOf = (id) => `persist:dc${id}`;

// Plain Chrome UA with the Chrome version Electron really runs
const CHROME_MAJOR = process.versions.chrome.split('.')[0];
const UA =
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;

// Popups for these stay in the app, everything else opens in your browser
const INAPP_HOSTS = ['discord.com', 'discordapp.com', 'hcaptcha.com'];
const hostMatches = (host, d) => host === d || host.endsWith('.' + d);

// ---- saved layout (order + last active slot) ----
const STATE_FILE = () => path.join(app.getPath('userData'), 'slots.json');
let order = [...IDS];
let active = 0;

const validOrder = (o) =>
  Array.isArray(o) && o.length === COUNT && IDS.every((id) => o.includes(id));

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
    if (validOrder(s.order)) order = s.order;
    if (IDS.includes(s.active)) active = s.active;
  } catch {}
}

function saveState() {
  try { fs.writeFileSync(STATE_FILE(), JSON.stringify({ order, active })); } catch {}
}

// ---- views ----
let win;
let sidebar;
const views = new Map(); // id -> { view, lastUsed }

function bounds() {
  const [w, h] = win.getContentSize();
  return { x: SIDEBAR, y: TOPBAR, width: w - SIDEBAR, height: h - TOPBAR };
}

function layout() {
  if (!win) return;
  for (const { view } of views.values()) view.setBounds(bounds());
}

function notify() {
  if (sidebar) sidebar.send('state', { order, active, loaded: [...views.keys()] });
}

function createView(id) {
  const view = new WebContentsView({ webPreferences: { partition: partitionOf(id) } });
  view.setBackgroundColor(BG);
  const wc = view.webContents;

  wc.session.setUserAgent(UA);
  wc.setUserAgent(UA);
  wc.setWindowOpenHandler(({ url }) => {
    let host = '';
    try { host = new URL(url).hostname; } catch {}
    if (INAPP_HOSTS.some((d) => hostMatches(host, d))) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.loadURL(HOME);

  view.setVisible(false);
  win.contentView.addChildView(view);
  view.setBounds(bounds());

  const entry = { view, lastUsed: Date.now() };
  views.set(id, entry);
  return entry;
}

function unload(id) {
  const entry = views.get(id);
  if (!entry) return;
  const ses = entry.view.webContents.session;
  win.contentView.removeChildView(entry.view);
  entry.view.webContents.close();
  views.delete(id);
  ses.flushStorageData(); // make sure the login is written to disk
}

function evict(keep) {
  while (views.size > MAX_LOADED) {
    const candidates = [...views.keys()].filter((id) => id !== keep);
    if (!candidates.length) break;
    const oldest = candidates.reduce((a, b) => (views.get(a).lastUsed <= views.get(b).lastUsed ? a : b));
    unload(oldest);
  }
}

function switchTo(id) {
  if (!IDS.includes(id)) return;
  if (views.has(active)) views.get(active).lastUsed = Date.now();

  const entry = views.get(id) || createView(id);
  entry.lastUsed = Date.now();
  evict(id);

  // views stay alive and just hide/show, so nothing is reset
  for (const [vid, v] of views) v.view.setVisible(vid === id);
  active = id;
  saveState();
  entry.view.webContents.focus();
  notify();
}

function reorder(next) {
  if (!validOrder(next)) return;
  order = next;
  saveState();
  buildMenu();
  notify();
}

// ---- menu (shortcuts follow position) ----
function buildMenu() {
  const items = order.map((id, pos) => ({
    label: `Account ${pos + 1}`,
    accelerator: `CmdOrCtrl+${pos + 1}`,
    click: () => switchTo(id),
  }));

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'Account',
        submenu: [
          ...items,
          { type: 'separator' },
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: () => views.get(active)?.view.webContents.reload(),
          },
        ],
      },
      { role: 'windowMenu' },
    ])
  );
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 520,
    title: 'Nine',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 14 },
    backgroundColor: BG,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });

  sidebar = win.webContents;
  win.loadFile('sidebar.html');
  win.on('resize', layout);

  sidebar.once('did-finish-load', () => switchTo(active));
}

// ---- IPC (only the sidebar has the preload, Discord pages have no access) ----
ipcMain.on('switch', (_e, id) => switchTo(id));
ipcMain.on('reorder', (_e, next) => reorder(next));
ipcMain.handle('config', () => ({ order, active, loaded: [...views.keys()] }));

app.whenReady().then(() => {
  loadState();
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// write every saved login to disk before quitting
app.on('before-quit', () => {
  for (const id of IDS) session.fromPartition(partitionOf(id)).flushStorageData();
  saveState();
});

app.on('window-all-closed', () => app.quit());
