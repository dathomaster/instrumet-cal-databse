/** Bridge exposed by the Electron preload script (absent in a plain browser). */
export interface DesktopBridge {
  isElectron: boolean
  platform: string
  printToPDF: (name: string) => Promise<{ ok: boolean; filePath?: string }>
  installUpdate: () => Promise<void>
  onUpdateReady: (cb: (version: string) => void) => () => void
}

declare global {
  interface Window { desktop?: DesktopBridge }
}

export const desktop = (): DesktopBridge | undefined => window.desktop
