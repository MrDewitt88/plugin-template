// CLI Argument-Parser. Pure-function, testbar.
//
// Usage:
//   npx @nexus-mindgarden/create-plugin <plugin-name> [--hosts=<list>] [--features=<list>]
//                                          [--target=<dir>] [--help]
//
// Defaults:
//   --hosts=teammind,theseus
//   --features=mcp,bridge        (bridge always implied)
//   --target=./<plugin-name>

export interface ParsedArgs {
  /** `scaffold` (default) oder das `features-note`-Subcommand. */
  command: 'scaffold' | 'features-note'
  pluginName: string
  hosts: string[]
  features: ('bridge' | 'storage' | 'svelte' | 'mcp')[]
  target: string
  help: boolean
  /** features-note: Verzeichnis mit `manifest.<id>.yaml` (default: cwd). */
  dir: string
  /** features-note: Ausgabedatei, oder `-` für stdout (default: stdout). */
  out: string
}

export class ArgsError extends Error {
  constructor(
    public readonly code:
      | 'invalid_name'
      | 'missing_name'
      | 'invalid_features'
      | 'invalid_hosts'
      | 'missing_value',
    message: string,
  ) {
    super(message)
    this.name = 'ArgsError'
  }
}

// Flags, die einen Wert TRAGEN. Ohne diese Liste würde `--out datei.md`
// (Leerzeichen- statt `=`-Form) als Boolean `'true'` geparst und der Wert
// stillschweigend in positional[] verschwinden — die Datei landete dann
// wörtlich unter `./true`, mit exit 0.
const VALUE_FLAGS = new Set(['hosts', 'features', 'target', 'dir', 'out'])

const VALID_HOSTS = ['teammind', 'theseus', 'familymind'] as const
const VALID_FEATURES = ['bridge', 'storage', 'svelte', 'mcp'] as const
const PLUGIN_NAME_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  const flags: Record<string, string> = {}
  const positional: string[] = []
  let help = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--help' || arg === '-h') {
      help = true
      continue
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      if (eq >= 0) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1)
        continue
      }
      const name = arg.slice(2)
      if (VALUE_FLAGS.has(name)) {
        // Leerzeichen-Form: `--out datei.md` — nächstes Token ist der Wert.
        const next = args[i + 1]
        if (next === undefined || next.startsWith('--')) {
          throw new ArgsError(
            'missing_value',
            `--${name} braucht einen Wert (--${name}=<wert> oder --${name} <wert>)`,
          )
        }
        flags[name] = next
        i++
        continue
      }
      flags[name] = 'true'
      continue
    }
    positional.push(arg)
  }

  if (help) {
    return {
      command: 'scaffold',
      pluginName: '',
      hosts: [],
      features: [],
      target: '',
      help: true,
      dir: '.',
      out: '-',
    }
  }

  // Subcommand: manifest → Feature-Katalog (Markdown) für die Notes-Registry.
  // Kein plugin-name; liest das lokale Manifest, schreibt nach stdout.
  // NB: `features-note` ist damit als Plugin-Name reserviert (in HELP_TEXT dokumentiert).
  if (positional[0] === 'features-note') {
    for (const k of ['dir', 'out'] as const) {
      if (flags[k] !== undefined && flags[k] === '') {
        throw new ArgsError('missing_value', `--${k} darf nicht leer sein`)
      }
    }
    return {
      command: 'features-note',
      pluginName: '',
      hosts: [],
      features: [],
      target: '',
      help: false,
      dir: flags.dir ?? '.',
      out: flags.out ?? '-',
    }
  }

  const pluginName = positional[0]
  if (!pluginName) {
    throw new ArgsError('missing_name', 'plugin-name positional argument required')
  }
  if (!PLUGIN_NAME_RE.test(pluginName)) {
    throw new ArgsError(
      'invalid_name',
      `plugin-name must be kebab-case (z.B. 'my-plugin'): ${pluginName}`,
    )
  }

  const hostsRaw = flags.hosts ?? 'teammind,theseus'
  const hosts = hostsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  for (const h of hosts) {
    if (!VALID_HOSTS.includes(h as (typeof VALID_HOSTS)[number])) {
      throw new ArgsError(
        'invalid_hosts',
        `host '${h}' invalid — must be one of: ${VALID_HOSTS.join(', ')}`,
      )
    }
  }

  const featuresRaw = flags.features ?? 'mcp'
  const featuresList = featuresRaw.split(',').map((s) => s.trim()).filter(Boolean)
  // bridge is always implied
  const featuresSet = new Set<string>([...featuresList, 'bridge'])
  for (const f of featuresSet) {
    if (!VALID_FEATURES.includes(f as (typeof VALID_FEATURES)[number])) {
      throw new ArgsError(
        'invalid_features',
        `feature '${f}' invalid — must be one of: ${VALID_FEATURES.join(', ')}`,
      )
    }
  }
  const features = Array.from(featuresSet) as ParsedArgs['features']

  const target = flags.target ?? `./${pluginName}`

  return { command: 'scaffold', pluginName, hosts, features, target, help: false, dir: '.', out: '-' }
}

export const HELP_TEXT = `
@nexus-mindgarden/create-plugin — scaffold neues Plugin-Provider-Repo

Usage:
  npx @nexus-mindgarden/create-plugin <plugin-name> [options]

Options:
  --hosts=<list>      Welche Hosts targeten (comma-separated)
                      Valid: teammind, theseus, familymind
                      Default: teammind,theseus

  --features=<list>   Welche Foundation-Packages inkludieren
                      Valid: bridge, storage, svelte, mcp
                      Default: mcp (bridge always included)

  --target=<dir>      Output-Directory
                      Default: ./<plugin-name>

  --help, -h          Show this help

Examples:
  npx @nexus-mindgarden/create-plugin my-plugin
  npx @nexus-mindgarden/create-plugin my-plugin --features=mcp,storage,svelte
  npx @nexus-mindgarden/create-plugin docs-plugin --hosts=teammind --features=mcp,storage
  npx @nexus-mindgarden/create-plugin my-plugin --target=/Users/me/Desktop/my-plugin

After scaffolding:
  cd <plugin-name>
  pnpm install
  pnpm test

Subcommand — features-note (Chatbus-Notes-Registry, Contract #6):
  npx @nexus-mindgarden/create-plugin features-note [--dir=<pfad>] [--out=<datei>]

  Rendert aus dem lokalen manifest.<id>.yaml einen Markdown-Feature-Katalog
  (Tools + Descriptions, Routes, Scopes, Hosts) mit eingebettetem manifest_hash
  und schreibt ihn nach stdout. Offline, deterministisch — keine laufende Bridge
  nötig, gleiches Manifest ⇒ byte-identische Ausgabe.

  --dir=<pfad>   Verzeichnis mit manifest.<id>.yaml   (default: .)
  --out=<datei>  Ausgabedatei, '-' = stdout           (default: -)

  Beide Flag-Formen gehen: --out=datei.md und --out datei.md.
  Hinweis: 'features-note' ist dadurch als Plugin-Name reserviert.

  Diagnostik geht auf stderr, damit stdout pipebar bleibt:
    create-plugin features-note | <in append_note(topic="repo/<role>/features",
                                                  supersedes=[<vorgänger-id>])>
`.trim()
