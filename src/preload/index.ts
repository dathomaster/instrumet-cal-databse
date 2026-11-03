import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  printToPDF: (suggestedName: string): Promise<{ ok: boolean; filePath?: string }> =>
    ipcRenderer.invoke('print-to-pdf', suggestedName)
})
