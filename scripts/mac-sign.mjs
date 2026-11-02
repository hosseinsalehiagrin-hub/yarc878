// electron-builder's mac.sign hook (electron-builder.yml). Release builds are signed with one
// self-signed certificate that CI keeps (MAC_CODESIGN_IDENTITY, set by release.yml), so every
// version has the same designated requirement and macOS keeps camera and microphone permissions
// across updates (docs/electron-notes.md section 9). Without the certificate: ad-hoc, as before.
//
// electron-builder only signs with certificates macOS trusts, which a self-signed one isn't, so
// it is handed "-" (mac.identity) and this hook swaps in the certificate. codesign finds the
// identity only in a keychain on the user's search list; release.yml puts it there.
import { signAsync } from '@electron/osx-sign'

export default async function sign(options) {
  const identity = process.env.MAC_CODESIGN_IDENTITY
  if (!identity) return signAsync(options)
  return signAsync({ ...options, identity, keychain: process.env.MAC_CODESIGN_KEYCHAIN })
}
