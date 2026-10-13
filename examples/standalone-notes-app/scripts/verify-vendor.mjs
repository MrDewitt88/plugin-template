import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
export async function verifyVendor() {
  const manifest = JSON.parse(await readFile(new URL('../vendor/manifest.json', import.meta.url), 'utf8'))
  const bytes = await readFile(new URL('../vendor/' + manifest.file, import.meta.url))
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('vendored_foundation_checksum_mismatch')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyVendor()
  console.log('Pinned Foundation checksum verified.')
}
