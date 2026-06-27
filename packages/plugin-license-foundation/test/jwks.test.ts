import { describe, expect, it } from 'vitest'
import {
  SignJWT,
  UnsecuredJWT,
  exportJWK,
  generateKeyPair,
  createLocalJWKSet,
  type JWTVerifyGetKey,
} from 'jose'
import { verifyEntitlementJwt } from '../src/jwks.js'

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true })
  const jwk = await exportJWK(publicKey)
  const jwks = createLocalJWKSet({ keys: [{ ...jwk, alg: 'EdDSA', kid: 'k1' }] })
  return { privateKey, jwks }
}

function sign(
  privateKey: Parameters<SignJWT['sign']>[0],
  claims: Record<string, unknown>,
  opts?: { iss?: string; aud?: string; exp?: string },
) {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setIssuedAt()
    .setExpirationTime(opts?.exp ?? '10m')
  if (opts?.iss) jwt.setIssuer(opts.iss)
  if (opts?.aud) jwt.setAudience(opts.aud)
  return jwt.sign(privateKey)
}

describe('verifyEntitlementJwt — offline JWKS verify (alg-pinned EdDSA)', () => {
  it('verifies a valid agent-JWT + extracts entitlement claims', async () => {
    const { privateKey, jwks } = await setup()
    const token = await sign(
      privateKey,
      { plugins: ['apex-2d', 'med-mind'], ent_ver: 5 },
      { iss: 'nexus', aud: 'nexus' },
    )
    const ent = await verifyEntitlementJwt(token, { jwks, issuer: 'nexus', audience: 'nexus' })
    expect(ent.plugins).toEqual(['apex-2d', 'med-mind'])
    expect(ent.ent_ver).toBe(5)
    expect(typeof ent.exp).toBe('number')
  })

  it('defaults plugins/ent_ver when absent (lenient on extra claims)', async () => {
    const { privateKey, jwks } = await setup()
    const token = await sign(privateKey, { some_other_claim: true })
    const ent = await verifyEntitlementJwt(token, { jwks })
    expect(ent.plugins).toEqual([])
    expect(ent.ent_ver).toBe(0)
  })

  it('rejects wrong issuer', async () => {
    const { privateKey, jwks } = await setup()
    const token = await sign(privateKey, { plugins: [], ent_ver: 1 }, { iss: 'evil', aud: 'nexus' })
    await expect(
      verifyEntitlementJwt(token, { jwks, issuer: 'nexus', audience: 'nexus' }),
    ).rejects.toMatchObject({ name: 'LicenseVerifyError' })
  })

  it('rejects a token signed by a different key (no matching JWKS key)', async () => {
    const { jwks } = await setup()
    const other = await generateKeyPair('EdDSA', { extractable: true })
    const token = await sign(other.privateKey, { plugins: ['x'], ent_ver: 1 })
    await expect(verifyEntitlementJwt(token, { jwks })).rejects.toMatchObject({
      name: 'LicenseVerifyError',
    })
  })

  it('rejects a tampered token', async () => {
    const { privateKey, jwks } = await setup()
    const token = await sign(privateKey, { plugins: ['apex-2d'], ent_ver: 1 })
    const tampered = token.slice(0, -3) + 'AAA'
    await expect(
      verifyEntitlementJwt(tampered, { jwks } as { jwks: JWTVerifyGetKey }),
    ).rejects.toMatchObject({ name: 'LicenseVerifyError' })
  })

  it('alg-confusion: rejects an HS256-signed token (the pin is enforced)', async () => {
    const { jwks } = await setup()
    // Classic confusion: sign HS256 with attacker-chosen secret. The EdDSA pin
    // must reject the algorithm regardless of the JWKS contents.
    const forged = await new SignJWT({ plugins: ['apex-2d', 'med-mind'], ent_ver: 99 })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('attacker-secret'))
    await expect(verifyEntitlementJwt(forged, { jwks })).rejects.toMatchObject({
      name: 'LicenseVerifyError',
    })
  })

  it('alg-confusion: rejects an unsecured (alg:none) token', async () => {
    const { jwks } = await setup()
    const none = new UnsecuredJWT({ plugins: ['apex-2d'], ent_ver: 1 }).encode()
    await expect(verifyEntitlementJwt(none, { jwks })).rejects.toMatchObject({
      name: 'LicenseVerifyError',
    })
  })

  it('rejects an already-expired token (code: expired)', async () => {
    const { privateKey, jwks } = await setup()
    const past = Math.floor(Date.now() / 1000) - 60
    const token = await new SignJWT({ plugins: ['apex-2d'], ent_ver: 1 })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setIssuedAt(past - 60)
      .setExpirationTime(past)
      .sign(privateKey)
    await expect(verifyEntitlementJwt(token, { jwks })).rejects.toMatchObject({
      name: 'LicenseVerifyError',
      code: 'expired',
    })
  })

  it('rejects wrong audience', async () => {
    const { privateKey, jwks } = await setup()
    const token = await sign(
      privateKey,
      { plugins: [], ent_ver: 1 },
      { iss: 'nexus', aud: 'other' },
    )
    await expect(
      verifyEntitlementJwt(token, { jwks, issuer: 'nexus', audience: 'nexus' }),
    ).rejects.toMatchObject({ name: 'LicenseVerifyError' })
  })

  it('rejects an exp-less token (exp is required → invalid_claims)', async () => {
    const { privateKey, jwks } = await setup()
    // No setExpirationTime → jose verifies, but EntitlementSchema requires exp.
    const token = await new SignJWT({ plugins: ['apex-2d'], ent_ver: 1 })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setIssuedAt()
      .sign(privateKey)
    await expect(verifyEntitlementJwt(token, { jwks })).rejects.toMatchObject({
      name: 'LicenseVerifyError',
      code: 'invalid_claims',
    })
  })
})
