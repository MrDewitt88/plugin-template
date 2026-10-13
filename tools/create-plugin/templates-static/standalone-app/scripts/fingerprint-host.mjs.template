import { readFile } from 'node:fs/promises'
import { fingerprintPublicKey } from '@nexus-mindgarden/plugin-bridge-foundation'
if (!process.argv[2]) throw new Error('Usage: node scripts/fingerprint-host.mjs /path/to/host-public.pem')
console.log(fingerprintPublicKey(await readFile(process.argv[2], 'utf8')))
