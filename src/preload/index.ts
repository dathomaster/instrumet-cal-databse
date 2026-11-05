import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  printToPDF: (suggestedName: string): Promise<{ ok: boolean; filePath?: string }> =>
    ipcRenderer.invoke('print-to-pdf', suggestedName),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),
  saveTextFile: (suggestedName: string, content: string): Promise<{ ok: boolean; filePath?: string }> =>
    ipcRenderer.invoke('save-text-file', suggestedName, content),
  onUpdateReady: (cb: (version: string) => void): (() => void) => {
    const listener = (_e: unknown, v: string) => cb(v)
    ipcRenderer.on('update-ready', listener)
    return () => ipcRenderer.removeListener('update-ready', listener)
  }
})
