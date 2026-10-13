import { build } from 'esbuild'
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const root = new URL('.', import.meta.url)
await mkdir(new URL('dist', root), { recursive: true })
const script = await build({
  entryPoints: [new URL('src/shell.ts', root).pathname],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  minify: true,
  target: ['es2022'],
})
await writeFile(
  new URL('dist/shell-script.js', root),
  `export const shellScript = ${JSON.stringify(script.outputFiles[0].text)};\n`,
)
execFileSync(
  process.execPath,
  [
    require.resolve('typescript/bin/tsc'),
    '-p',
    new URL('tsconfig.json', root).pathname,
    '--emitDeclarationOnly',
  ],
  { stdio: 'inherit' },
)
const browserModules = new Map([
  ['zod/v4', 'sdk-zod.js'],
  ['@modelcontextprotocol/core', 'sdk-core.js'],
  ['@modelcontextprotocol/core/internal', 'sdk-core-internal.js'],
  ['@modelcontextprotocol/client', 'sdk-client.js'],
])
const dependencies = (entryName) => ({
  name: 'vendored-sdk',
  setup(builder) {
    builder.onResolve(
      { filter: /^(zod\/v4|@modelcontextprotocol\/(core|client)(\/internal)?)$/ },
      (args) => {
        if (args.importer.endsWith(`entry-${entryName}.ts`)) return
        const file = browserModules.get(args.path)
        return file ? { path: `./${file}`, external: true } : undefined
      },
    )
  },
})
for (const [module, file] of browserModules) {
  await build({
    stdin: {
      contents: `export * from '${module}'`,
      sourcefile: `entry-${file}.ts`,
      resolveDir: new URL('src', root).pathname,
    },
    outfile: new URL(`dist/${file}`, root).pathname,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    minify: true,
    target: ['es2022'],
    plugins: [dependencies(file)],
  })
}
for (const entry of ['client', 'browser', 'document']) {
  await build({
    entryPoints: [new URL(`src/${entry}.ts`, root).pathname],
    outfile: new URL(`dist/${entry}.js`, root).pathname,
    bundle: true,
    platform: 'neutral',
    conditions: ['browser'],
    format: 'esm',
    minify: true,
    target: ['es2022'],
    external: ['./shell-script.js'],
    plugins: entry === 'browser' ? [dependencies(entry)] : [],
  })
}
// Runtime packages need no SDK/peer dependencies. Preserve all bundled licenses.
const licensePaths = [
  '@modelcontextprotocol/ext-apps',
  '@modelcontextprotocol/core',
  '@modelcontextprotocol/client',
  'zod',
]
let notices = ''
for (const name of licensePaths) {
  let path = dirname(require.resolve(name))
  while (true) {
    try {
      if (JSON.parse(await readFile(join(path, 'package.json'), 'utf8')).name === name) break
    } catch {}
    const parent = dirname(path)
    if (path === parent) throw new Error(`Missing package ${name}`)
    path = parent
  }
  notices += `\n--- ${name} ---\n${await readFile(join(path, 'LICENSE'), 'utf8')}\n`
}
await writeFile(new URL('dist/THIRD-PARTY-NOTICES.txt', root), notices)
await copyFile(new URL('../../LICENSE', root), new URL('LICENSE', root)).catch(() =>
  writeFile(
    new URL('LICENSE', root),
    'MIT License\nCopyright (c) Digitale Projekte RF GmbH\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to including this notice.\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.\n',
  ),
)
