import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { configuration } from '../src/config.js'

describe('standalone process configuration', () => {
  it('requires an explicit HTTPS endpoint before exposing the bridge', () => {
    expect(() => configuration(resolve('.'), { APP_BRIDGE_BIND: '0.0.0.0' })).toThrow('public_bridge_requires_https')
    expect(() => configuration(resolve('.'), { APP_PUBLIC_BRIDGE_URL: 'https://token@example.eu' })).toThrow('invalid_bridge_endpoint')
    expect(configuration(resolve('.'), { APP_BRIDGE_BIND: '0.0.0.0', APP_PUBLIC_BRIDGE_URL: 'https://app.example.eu' }).bridgeEndpoint).toBe('https://app.example.eu')
  })
  it('keeps durable state outside the installation and rejects colliding listeners', () => {
    expect(() => configuration(resolve('.'), { APP_DATA_DIR: 'storage' })).toThrow('app_data_dir_must_be_absolute')
    expect(() => configuration(resolve('.'), { APP_DATA_DIR: resolve('.', '..storage') })).toThrow('app_data_dir_must_be_outside_installation')
    expect(() => configuration(resolve('.'), { APP_PORT: '3670', APP_BRIDGE_PORT: '3670' })).toThrow('app_and_bridge_ports_must_differ')
  })
})
