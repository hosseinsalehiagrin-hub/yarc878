// Links a web page hands to another app (mailto:, msteams:, zoommtg:, …). Like Chrome, YARC asks
// before opening one; "Always allow" is remembered per site and scheme until YARC quits.
import { BrowserWindow, dialog, shell, type WebContents } from 'electron'
import { externalLinkInfo } from './external-link-info'

const alwaysAllowed = new Set<string>()

export async function openExternalLink(from: WebContents, url: string): Promise<void> {
  const info = externalLinkInfo(url, from.isDestroyed() ? '' : from.getURL())
  if (info.blocked) return console.warn('[external] refused', info.scheme)
  const key = `${info.origin}|${info.scheme}`
  if (!alwaysAllowed.has(key)) {
    const win = BrowserWindow.fromWebContents(from) ?? BrowserWindow.getFocusedWindow()
    const options = {
      type: 'question' as const,
      title: 'YARC',
      // Plain buttons; Windows would otherwise draw custom labels as big "command links".
      noLink: true,
      buttons: [`Open ${info.app}`, 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `Open ${info.app}?`,
      detail: `${info.site || 'This page'} wants to open this link in another app:\n${url.length > 160 ? `${url.slice(0, 160)}…` : url}`,
      checkboxLabel: info.site ? `Always allow ${info.site} to open ${info.scheme}: links` : undefined
    }
    const { response, checkboxChecked } = await (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
    if (response !== 0) return
    if (checkboxChecked) alwaysAllowed.add(key)
  }
  await shell.openExternal(url).catch((err: unknown) => console.warn('[external] no app for', info.scheme, err))
}
