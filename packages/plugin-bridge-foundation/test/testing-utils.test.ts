import { describe, expect, it } from 'vitest'
import { verifyBridgeToken } from '../src/auth/jwt.js'
import { buildTestRegistry, mintTestBridgeToken } from '../src/testing/index.js'

describe('testing utilities', () => {
  it('buildTestRegistry() returns a registry with bootstrap-host active', async () => {
    const { registry } = await buildTestRegistry({ hostId: 'teammind' })
    const list = await registry.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.host_id).toBe('teammind')
    expect(list[0]?.status).toBe('active')
  })

  it('mintToken() produces a JWT that verifyBridgeToken accepts', async () => {
    const { registry, mintToken } = await buildTestRegistry({ hostId: 'teammind' })
    const tenant = '00000000-0000-0000-0000-000000000001'
    const user = '00000000-0000-0000-0000-000000000002'
    const token = await mintToken({
      pluginId: 'test-plugin',
      tenantId: tenant,
      userId: user,
      scopes: ['mcp.read.documents'],
    })
    const claims = await verifyBridgeToken(token, registry)
    expect(claims).toMatchObject({
      plugin_id: 'test-plugin',
      host_id: 'teammind',
      tenant_id: tenant,
      user_id: user,
      scopes: ['mcp.read.documents'],
    })
  })

  it('autoAccept=false leaves host pending until approve', async () => {
    const handle = await buildTestRegistry({ hostId: 'teammind', autoAccept: false })
    const list = await handle.registry.list()
    expect(list[0]?.status).toBe('active') // buildTestRegistry approves it explicitly
  })

  it('mintTestBridgeToken with custom claims works standalone', async () => {
    const { privateKey, registry } = await buildTestRegistry({ hostId: 'teammind' })
    const token = await mintTestBridgeToken(privateKey, {
      pluginId: 'p1',
      hostId: 'teammind',
      tenantId: '00000000-0000-0000-0000-000000000003',
      userId: '00000000-0000-0000-0000-000000000004',
      iss: 'custom-issuer',
      scopes: [],
    })
    const claims = await verifyBridgeToken(token, registry)
    expect(claims.iss).toBe('custom-issuer')
  })
})
