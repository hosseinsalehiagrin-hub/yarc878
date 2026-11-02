#!/bin/bash
# Release workflow, macOS: puts the self-signed code-signing certificate from the
# MAC_CODESIGN_P12 (base64 .p12) and MAC_CODESIGN_P12_PASSWORD secrets in a keychain of its own,
# and tells scripts/mac-sign.mjs to use it (MAC_CODESIGN_IDENTITY, MAC_CODESIGN_KEYCHAIN via
# $GITHUB_ENV). Making the certificate: docs/electron-notes.md section 9.
set -euo pipefail

keychain="$RUNNER_TEMP/codesign.keychain-db"
keychain_password=$(openssl rand -hex 24)
p12="$RUNNER_TEMP/codesign.p12"

printf '%s' "$MAC_CODESIGN_P12" | base64 --decode > "$p12"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings "$keychain" # no auto-lock during the build
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$p12" -k "$keychain" -P "$MAC_CODESIGN_P12_PASSWORD" -T /usr/bin/codesign
rm -f "$p12"
# Lets codesign use the key without a "codesign wants to access key" prompt.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" > /dev/null
# codesign only finds identities in keychains on the search list (--keychain alone isn't enough).
existing=$(security list-keychains -d user | tr -d '"')
# shellcheck disable=SC2086 # one path per word
security list-keychains -d user -s "$keychain" $existing

# The certificate's SHA-1. Without -v: a self-signed certificate is listed, but as not trusted.
identity=$(security find-identity -p codesigning "$keychain" | awk '$1 == "1)" { print $2; exit }')
if [ -z "$identity" ]; then
  echo "::error::MAC_CODESIGN_P12 holds no code-signing identity"
  exit 1
fi
echo "Signing with certificate $identity"
echo "MAC_CODESIGN_IDENTITY=$identity" >> "$GITHUB_ENV"
echo "MAC_CODESIGN_KEYCHAIN=$keychain" >> "$GITHUB_ENV"
