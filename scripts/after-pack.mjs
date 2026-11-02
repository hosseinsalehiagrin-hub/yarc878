// electron-builder's afterPack hook (electron-builder.yml): flips Electron fuses in the packaged
// binary, before it's signed. Not with the `electronFuses` option because that applies to every
// platform, and cookie encryption must stay off on macOS (docs/electron-notes.md section 8).
import { FuseV1Options, FuseVersion } from '@electron/fuses'

export default async function afterPack(context) {
  // Encrypt cookies like Chrome: a DPAPI-protected key on Windows, the Secret Service/kwallet on
  // Linux. On macOS the key would sit in the login keychain, and without an Apple Developer ID
  // every update would ask for the login password before the browser can read its cookies.
  if (context.electronPlatformName === 'darwin') return
  await context.packager.addElectronFuses(context, {
    version: FuseVersion.V1,
    [FuseV1Options.EnableCookieEncryption]: true
  })
}
