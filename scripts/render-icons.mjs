// Renders the app icons from build/icon.svg and build/icon-small.svg with Electron's own Chromium,
// so they look exactly like the SVGs. Run it after changing either SVG, and commit the results:
//
//   pnpm exec electron scripts/render-icons.mjs
//
// Writes build/icon-mac.png (the artwork on a macOS app tile; macOS 26 boxes icons that aren't one),
// build/icon.png (Linux) and build/icon.ico (Windows: icon-small.svg up to 32px, icon.svg above).
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const build = join(import.meta.dirname, '..', 'build')
const svg = (name) => readFileSync(join(build, name), 'utf8')

/** The artwork on the macOS icon grid: an 824px rounded tile with a 100px margin. */
function onTile(source) {
  const art = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect x="100" y="100" width="824" height="824" rx="186" fill="#FFF8EC"/>
  <svg x="190" y="190" width="644" height="644" viewBox="0 0 160 160">${art}</svg>
</svg>`
}

async function render(win, source, size) {
  const src = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`
  await win.webContents.executeJavaScript(`(() => {
    const img = document.querySelector('img')
    img.width = img.height = ${size}
    img.src = ${JSON.stringify(src)}
    return img.decode()
  })()`)
  await new Promise((resolve) => setTimeout(resolve, 100)) // let the new frame paint
  let image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  if (image.getSize().width !== size) image = image.resize({ width: size, height: size, quality: 'best' })
  return image.toPNG()
}

/** A .ico with a PNG per size (Windows Vista and later read PNG entries). */
function ico(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  entries.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, at) // 0 means 256
    header.writeUInt8(size >= 256 ? 0 : size, at + 1)
    header.writeUInt16LE(1, at + 4) // color planes
    header.writeUInt16LE(32, at + 6) // bits per pixel
    header.writeUInt32LE(png.length, at + 8)
    header.writeUInt32LE(offset, at + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...entries.map((e) => e.png)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<style>html,body{margin:0;background:transparent}img{display:block}</style><img>')

  const full = svg('icon.svg')
  const small = svg('icon-small.svg')
  writeFileSync(join(build, 'icon-mac.png'), await render(win, onTile(full), 1024))
  writeFileSync(join(build, 'icon.png'), await render(win, full, 1024))
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
  const entries = []
  for (const size of sizes) entries.push({ size, png: await render(win, size <= 32 ? small : full, size) })
  writeFileSync(join(build, 'icon.ico'), ico(entries))
  console.log(`Wrote build/icon-mac.png, build/icon.png and build/icon.ico (${sizes.join(', ')} px)`)
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
