import { generateKeyPair, exportSPKI, exportPKCS8, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import {
  HostKeyRegistry,
  InMemoryHostKeyRepo,
} from '../src/auth/host-keys.js'
import { BridgeTokenError, verifyBridgeToken } from '../src/auth/jwt.js'

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true })
  const publicPem = await exportSPKI(publicKey)
  // privateKey is for signing — we use it directly with SignJWT
  return { publicPem, privateKey }
}

async function signToken(privateKey: CryptoKey, claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

describe('verifyBridgeToken', () => {
  it('verifiziert valides Token + returns claims', async () => {
    const { publicPem, privateKey } = await setup()
    const repo = new InMemoryHostKeyRepo()
    const reg = new HostKeyRegistry(repo, { autoAccept: true })
    await reg.register({ host_id: 'teammind', public_key_pem: publicPem })

    const token = await signToken(privateKey, {
      iss: 'http://localhost:3100',
      sub: 'test-plugin',
      jti: 'jti-123',
      plugin_id: 'test-plugin',
      host_id: 'teammind',
      tenant_id: '00000000-0000-4000-8000-000000000001',
      user_id: '00000000-0000-4000-8000-000000000002',
      scopes: ['mcp.read.test'],
    })

    const claims = await verifyBridgeToken(token, reg)
    expect(claims.plugin_id).toBe('test-plugin')
    expect(claims.host_id).toBe('teammind')
    expect(claims.scopes).toEqual(['mcp.read.test'])
  })

  it('throws host_not_registered für unbekannten host_id', async () => {
    const { privateKey } = await setup()
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())

    const token = await signToken(privateKey, {
      iss: 'x',
      sub: 'x',
      jti: 'x',
      plugin_id: 'x',
      host_id: 'unknown-host',
      tenant_id: '00000000-0000-4000-8000-000000000001',
      user_id: '00000000-0000-4000-8000-000000000002',
      scopes: [],
    })

    await expect(verifyBridgeToken(token, reg)).rejects.toMatchObject({
      code: 'host_not_registered',
    })
  })

  it('throws host_pending wenn host noch nicht approved', async () => {
    const { publicPem, privateKey } = await setup()
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await reg.register({ host_id: 'teammind', public_key_pem: publicPem })
    // not approved → status='pending'

    const token = await signToken(privateKey, {
      iss: 'x',
      sub: 'x',
      jti: 'x',
      plugin_id: 'x',
      host_id: 'teammind',
      tenant_id: '00000000-0000-4000-8000-000000000001',
      user_id: '00000000-0000-4000-8000-000000000002',
      scopes: [],
    })

    await expect(verifyBridgeToken(token, reg)).rejects.toMatchObject({
      code: 'host_pending',
    })
  })

  it('throws invalid_token bei malformed JWT', async () => {
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())
    await expect(verifyBridgeToken('not.a.jwt', reg)).rejects.toBeInstanceOf(BridgeTokenError)
  })

  it('throws invalid_claims wenn host_id-claim fehlt', async () => {
    const { privateKey } = await setup()
    const reg = new HostKeyRegistry(new InMemoryHostKeyRepo())

    const token = await signToken(privateKey, {
      iss: 'x',
      sub: 'x',
      jti: 'x',
      plugin_id: 'x',
      // host_id missing
      tenant_id: '00000000-0000-4000-8000-000000000001',
      user_id: '00000000-0000-4000-8000-000000000002',
      scopes: [],
    })

    await expect(verifyBridgeToken(token, reg)).rejects.toMatchObject({
      code: 'invalid_claims',
    })
  })
})
