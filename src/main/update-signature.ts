// Ed25519 signatures for the macOS self-update zips. The release workflow signs each zip
// (scripts/sign-update.mts) with the private key in the MAC_UPDATE_SIGNING_KEY secret, and the app only
// installs a zip whose signature matches UPDATE_PUBLIC_KEY. No Electron imports, so CI and unit tests use it.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'

export const UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGkPUNdZdczkp7AOd3w6v6VOBs06cqsF364n0uC954fM=
-----END PUBLIC KEY-----
`

/**
 * What gets signed: the zip's file name, which carries the version and arch (so an older or
 * other-arch zip can't pass for this one), and its SHA-512.
 */
function message(fileName: string, zip: Uint8Array): Buffer {
  const digest = createHash('sha512').update(zip).digest('hex')
  return Buffer.from(`arc-shell-update\n${fileName}\n${digest}\n`)
}

/** The base64 signature that goes in `<fileName>.sig`. */
export function signUpdate(fileName: string, zip: Uint8Array, privateKeyPem: string): string {
  return sign(null, message(fileName, zip), createPrivateKey(privateKeyPem)).toString('base64')
}

export function verifyUpdate(fileName: string, zip: Uint8Array, signature: string, publicKeyPem: string): boolean {
  try {
    return verify(null, message(fileName, zip), createPublicKey(publicKeyPem), Buffer.from(signature.trim(), 'base64'))
  } catch {
    return false
  }
}

export function publicKeyOf(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem)).export({ type: 'spki', format: 'pem' }).toString()
}
