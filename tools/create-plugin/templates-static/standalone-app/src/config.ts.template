import { homedir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { IdentitySchema } from './domain.js'
import { APP_ID } from './bridge.js'

export function port(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value)) throw new Error('invalid_port')
  const result = Number(value)
  if (result < 1 || result > 65535) throw new Error('invalid_port')
  return result
}
export function configuration(rootDirectory: string, env: NodeJS.ProcessEnv = process.env) {
  const appPort = port(env.APP_PORT, 3671), bridgePort = port(env.APP_BRIDGE_PORT, 3670)
  if (appPort === bridgePort) throw new Error('app_and_bridge_ports_must_differ')
  const bridgeBind = env.APP_BRIDGE_BIND ?? '127.0.0.1'
  const bridgeEndpoint = env.APP_PUBLIC_BRIDGE_URL ?? 'http://127.0.0.1:' + bridgePort
  const endpoint = new URL(bridgeEndpoint)
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('invalid_bridge_endpoint')
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' && bridgeBind === '127.0.0.1'))
    throw new Error('public_bridge_requires_https')
  const platformDirectory = process.platform === 'darwin' ? resolve(homedir(), 'Library/Application Support')
    : process.platform === 'win32' ? (env.LOCALAPPDATA ?? resolve(homedir(), 'AppData/Local'))
    : (env.XDG_DATA_HOME ?? resolve(homedir(), '.local/share'))
  if (env.APP_DATA_DIR && !isAbsolute(env.APP_DATA_DIR)) throw new Error('app_data_dir_must_be_absolute')
  const dataDirectory = resolve(env.APP_DATA_DIR ?? resolve(platformDirectory, APP_ID))
  const dataRelative = relative(rootDirectory, dataDirectory)
  if (dataRelative !== '..' && !dataRelative.startsWith('..' + sep) && !isAbsolute(dataRelative)) throw new Error('app_data_dir_must_be_outside_installation')
  return {
    rootDirectory, appPort, bridgePort, bridgeBind, bridgeEndpoint,
    appOrigin: 'http://127.0.0.1:' + appPort,
    dataDirectory,
    localIdentity: IdentitySchema.parse({
      tenantId: env.APP_TENANT_ID ?? '00000000-0000-4000-8000-000000000001',
      userId: env.APP_USER_ID ?? '00000000-0000-4000-8000-000000000002',
    }),
  }
}
