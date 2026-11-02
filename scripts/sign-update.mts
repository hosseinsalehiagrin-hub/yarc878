// Signs the macOS update zips that the app's self-updater installs (src/main/update-signature.ts).
//
//   node --experimental-strip-types scripts/sign-update.mts keygen <private-key-file>
//     Once: writes a new Ed25519 private key and prints its public key, which goes in UPDATE_PUBLIC_KEY.
//     The private key file's contents go in the MAC_UPDATE_SIGNING_KEY repository secret.
//
//   MAC_UPDATE_SIGNING_KEY=<pem> node --experimental-strip-types scripts/sign-update.mts <zip>...
//     Writes <zip>.sig next to each zip (the release workflow does this).
import { generateKeyPairSync } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { publicKeyOf, signUpdate, UPDATE_PUBLIC_KEY } from '../src/main/update-signature.ts'

const args = process.argv.slice(2)

if (args[0] === 'keygen') {
  const file = args[1]
  if (!file) throw new Error('Usage: sign-update.mts keygen <private-key-file>')
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  // "wx": never overwrite an existing key.
  writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 })
  console.log(`Private key written to ${file}. Public key:\n`)
  console.log(publicKey.export({ type: 'spki', format: 'pem' }))
} else {
  const key = process.env.MAC_UPDATE_SIGNING_KEY
  if (!key) throw new Error('MAC_UPDATE_SIGNING_KEY is not set: the repository secret is missing')
  // Installed apps only accept zips signed with the key matching the one they were built with.
  if (publicKeyOf(key).trim() !== UPDATE_PUBLIC_KEY.trim()) {
    throw new Error("MAC_UPDATE_SIGNING_KEY doesn't match UPDATE_PUBLIC_KEY in src/main/update-signature.ts")
  }
  if (args.length === 0) throw new Error('No zips to sign')
  for (const zip of args) {
    writeFileSync(`${zip}.sig`, `${signUpdate(basename(zip), readFileSync(zip), key)}\n`)
    console.log(`Signed ${zip}`)
  }
}
