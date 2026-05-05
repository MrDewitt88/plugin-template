// CLI-entry — runs argv-parse + scaffold + summary-print.
// Imported by bin/cli.js (compiled).

import { ArgsError, HELP_TEXT, parseArgs } from './args.js'
import { ScaffoldError, scaffold } from './scaffolders/scaffold.js'

export async function runCli(argv: string[]): Promise<number> {
  let parsed
  try {
    parsed = parseArgs(argv)
  } catch (err) {
    if (err instanceof ArgsError) {
      console.error(`error: ${err.message}\n`)
      console.error(HELP_TEXT)
      return 1
    }
    throw err
  }

  if (parsed.help) {
    console.log(HELP_TEXT)
    return 0
  }

  console.log(`scaffolding plugin '${parsed.pluginName}' →  ${parsed.target}`)
  console.log(`  hosts:    ${parsed.hosts.join(', ')}`)
  console.log(`  features: ${parsed.features.join(', ')}`)
  console.log('')

  let result
  try {
    result = scaffold({
      pluginName: parsed.pluginName,
      hosts: parsed.hosts,
      features: parsed.features,
      target: parsed.target,
    })
  } catch (err) {
    if (err instanceof ScaffoldError) {
      console.error(`error: ${err.message}`)
      return 1
    }
    throw err
  }

  console.log(`✓ wrote ${result.filesWritten.length} files`)
  for (const f of result.filesWritten) console.log(`  ${f}`)
  console.log('')
  console.log(`done. next:`)
  console.log(`  cd ${parsed.target}`)
  console.log(`  pnpm install`)
  console.log(`  pnpm test`)
  console.log('')
  console.log(`docs:  https://github.com/MrDewitt88/plugin-template/blob/main/docs/PLUGIN-PROVIDER-GUIDE.md`)
  return 0
}
