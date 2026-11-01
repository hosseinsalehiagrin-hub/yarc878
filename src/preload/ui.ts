// Preload for Arc Shell's own UI (sidebar, overlay, Little Arc toolbar). Never used for web pages.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
import { IPC, type ArcApi } from '../shared/ipc'

function listen<T>(channel: string, cb: (value: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

const api: ArcApi = {
  platform: process.platform,
  getState: () => ipcRenderer.invoke(IPC.getState),
  getOverlay: () => ipcRenderer.invoke(IPC.getOverlay),
  onState: (cb) => listen(IPC.state, cb),
  onOverlay: (cb) => listen(IPC.overlay, cb),
  onToast: (cb) => listen(IPC.toast, cb),
  onFind: (cb) => listen(IPC.find, cb),
  onLittle: (cb) => listen(IPC.little, cb),
  onEdit: (cb) => listen(IPC.edit, cb),
  dispatch: (action) => ipcRenderer.invoke(IPC.action, action),
  search: (query) => ipcRenderer.invoke(IPC.search, query),
  suggest: (query) => ipcRenderer.invoke(IPC.suggest, query),
  history: (query, offset) => ipcRenderer.invoke(IPC.history, query, offset),
  deleteHistory: (url) => ipcRenderer.invoke(IPC.historyDelete, url),
  little: (op) => ipcRenderer.invoke(IPC.littleOp, op)
}

contextBridge.exposeInMainWorld('arc', api)

// Registers the <browser-action-list> element used to show extension buttons in the sidebar.
if (!location.pathname.endsWith('little.html')) {
  injectBrowserAction()
}
