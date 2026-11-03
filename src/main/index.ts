import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from 'electron'
import { join, normalize, extname } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { autoUpdater } from 'electron-updater'

// The renderer is served from app://bundle/ in production. PowerSync's web
// SDK needs a secure, standard origin for IndexedDB/OPFS, SharedWorker and
// WebAssembly — file:// does not reliably provide those.
const SCHEME = 'app'
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']
const rendererDir = join(__dirname, '../renderer')

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
}

function registerAppProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url)
    let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
    if (!rel || rel.endsWith('/')) rel += 'index.html'
    const filePath = join(rendererDir, rel)
    if (!filePath.startsWith(rendererDir)) return new Response('Forbidden', { status: 403 })
    const res = await net.fetch(pathToFileURL(filePath).toString())
    if (!res.ok) return res
    const headers = new Headers(res.headers)
    headers.set('Content-Type', MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream')
    return new Response(res.body, { status: res.status, headers })
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    title: 'Instrumet Calibration',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win.show())

  // Open external links in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = isDev ? url.startsWith(process.env['ELECTRON_RENDERER_URL']!) : url.startsWith(`${SCHEME}://`)
    if (!allowed) e.preventDefault()
  })

  if (isDev) win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  else win.loadURL(`${SCHEME}://bundle/index.html`)
}

// Save the current page (e.g. a calibration certificate) as a PDF.
ipcMain.handle('print-to-pdf', async (event, suggestedName: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false }
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: suggestedName.replace(/[^\w.-]+/g, '_') + '.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (canceled || !filePath) return { ok: false }
  const pdf = await event.sender.printToPDF({ printBackground: true, pageSize: 'Letter' })
  await writeFile(filePath, pdf)
  shell.showItemInFolder(filePath)
  return { ok: true, filePath }
})

// ---- Auto-update from GitHub Releases (installed app only) ----------------
// Downloads quietly in the background; the renderer shows "Restart to update".
// If nobody clicks it, the update installs the next time the app is closed.
function setupAutoUpdates(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', (info) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update-ready', info.version)
  })
  autoUpdater.on('error', (e) => console.warn('Update check failed (offline?)', e?.message))
  const check = () => autoUpdater.checkForUpdates().catch(() => undefined)
  check()
  setInterval(check, 4 * 60 * 60 * 1000)
}
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall())

// Only one copy of the app may run: two processes writing the same local
// database could corrupt it. A second launch just focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return
  setupAutoUpdates()
  registerAppProtocol()
  if (!isDev) {
    // Content Security Policy for the packaged app
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      if (!details.url.startsWith(`${SCHEME}://`)) return cb({ responseHeaders: details.responseHeaders })
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; " +
              "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
              'connect-src \'self\' https://*.supabase.co wss://*.supabase.co https://*.powersync.journeyapps.com wss://*.powersync.journeyapps.com'
          ]
        }
      })
    })
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
