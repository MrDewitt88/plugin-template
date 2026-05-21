// CLI Argument-Parser. Pure-function, testbar.
//
// Usage:
//   npx @nexus/create-plugin <plugin-name> [--hosts=<list>] [--features=<list>]
//                                          [--target=<dir>] [--help]
//
// Defaults:
//   --hosts=teammind,theseus
//   --features=mcp,bridge        (bridge always implied)
//   --target=./<plugin-name>
export class ArgsError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ArgsError';
    }
}
const VALID_HOSTS = ['teammind', 'theseus', 'familymind'];
const VALID_FEATURES = ['bridge', 'storage', 'svelte', 'mcp'];
const PLUGIN_NAME_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;
export function parseArgs(argv) {
    const args = argv.slice(2);
    const flags = {};
    const positional = [];
    let help = false;
    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            help = true;
            continue;
        }
        if (arg.startsWith('--')) {
            const eq = arg.indexOf('=');
            if (eq < 0) {
                flags[arg.slice(2)] = 'true';
            }
            else {
                flags[arg.slice(2, eq)] = arg.slice(eq + 1);
            }
        }
        else {
            positional.push(arg);
        }
    }
    if (help) {
        return {
            pluginName: '',
            hosts: [],
            features: [],
            target: '',
            help: true,
        };
    }
    const pluginName = positional[0];
    if (!pluginName) {
        throw new ArgsError('missing_name', 'plugin-name positional argument required');
    }
    if (!PLUGIN_NAME_RE.test(pluginName)) {
        throw new ArgsError('invalid_name', `plugin-name must be kebab-case (z.B. 'my-plugin'): ${pluginName}`);
    }
    const hostsRaw = flags.hosts ?? 'teammind,theseus';
    const hosts = hostsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    for (const h of hosts) {
        if (!VALID_HOSTS.includes(h)) {
            throw new ArgsError('invalid_hosts', `host '${h}' invalid — must be one of: ${VALID_HOSTS.join(', ')}`);
        }
    }
    const featuresRaw = flags.features ?? 'mcp';
    const featuresList = featuresRaw.split(',').map((s) => s.trim()).filter(Boolean);
    // bridge is always implied
    const featuresSet = new Set([...featuresList, 'bridge']);
    for (const f of featuresSet) {
        if (!VALID_FEATURES.includes(f)) {
            throw new ArgsError('invalid_features', `feature '${f}' invalid — must be one of: ${VALID_FEATURES.join(', ')}`);
        }
    }
    const features = Array.from(featuresSet);
    const target = flags.target ?? `./${pluginName}`;
    return { pluginName, hosts, features, target, help: false };
}
export const HELP_TEXT = `
@nexus/create-plugin — scaffold neues Plugin-Provider-Repo

Usage:
  npx @nexus/create-plugin <plugin-name> [options]

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
  npx @nexus/create-plugin my-plugin
  npx @nexus/create-plugin my-plugin --features=mcp,storage,svelte
  npx @nexus/create-plugin docs-plugin --hosts=teammind --features=mcp,storage
  npx @nexus/create-plugin my-plugin --target=/Users/me/Desktop/my-plugin

After scaffolding:
  cd <plugin-name>
  pnpm install
  pnpm test
`.trim();
//# sourceMappingURL=args.js.map