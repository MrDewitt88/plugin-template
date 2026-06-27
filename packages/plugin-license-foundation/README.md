# @nexus-mindgarden/plugin-license-foundation

NEXUS plugin-entitlement **LicenseGate** for the host's `PluginManager.activate` seam — offline-first, default-deny, last-known-good grace, plus the entitle-on-activation call.

## Model

NEXUS issues plugin entitlements as **signed claims on the agent-JWT** (`plugins: string[]`, `ent_ver: int`), verifiable **offline via JWKS**. The host already verifies this JWT for app-licensing; this package adds the per-plugin gate. Revocation = `ent_ver` bump + SSE → host reconcile. (Wire: chatbus `#plugin-licensing`, nexus #5374 / agent #5377.)

## Quick use

```ts
import {
  createLicenseClient,
  verifyEntitlementJwt,
  remoteJwks,
  entitlePlugin,
} from '@nexus-mindgarden/plugin-license-foundation'

// Cache the JWKS getter once (don't re-fetch per verify).
const jwks = remoteJwks('https://nexus.example/api/licenses/jwks.json')

const { gate } = createLicenseClient({
  // Yield the current entitlement — from the host's already-verified agent-JWT
  // claims, or by verifying the raw JWT here:
  resolveEntitlement: async () => {
    const jwt = await host.currentAgentJwt() // host-supplied
    if (!jwt) return null
    return verifyEntitlementJwt(jwt, {
      jwks,
      issuer: 'nexus.digitaleprojekte.at',
      audience: 'nexus',
    })
  },
  graceMs: 7 * 24 * 60 * 60 * 1000, // last-known-good offline window (host policy)
  // failOpen: true,                // ONLY for dev / enforce_entitlements=false
})

// Drops into PluginManager.activate's LicenseGate.check seam:
const result = await gate.check({ pluginId: 'apex-2d', userId })
// → { ok: true } | { ok: false, reason: 'not_entitled' | 'no_entitlement' | 'stale_entitlement' | … }
```

### Entitle on activation (free → grant, paid → 402)

```ts
const r = await entitlePlugin({
  endpoint: 'https://nexus.example/api/licenses/entitlements/plugin',
  slug: 'apex-2d',
  activationToken, // device credential (Bearer)
})
// free  → { ok: true }
// paid  → { ok: false, reason: 'purchase_required' }
```

## Security

- **Default-deny:** no resolvable entitlement and no usable cache → `{ ok: false }`. `failOpen` is opt-in (dev / issuance-before-enforcement).
- **Alg-pinned:** `verifyEntitlementJwt` accepts **only** `EdDSA` — never `HS*`/`none`. Any verify failure throws (no permissive path).
- **Offline grace** is bounded by the cached `exp` + `graceMs` (host policy); past it → `stale_entitlement`, not a silent allow. `verifyEntitlementJwt` **requires** `exp` (an exp-less token → `invalid_claims`), so a verified entitlement's grace is always anchored on a signed freshness boundary. (A custom `resolveEntitlement` that yields an `exp`-less object anchors grace on last-resolved-online instead.)

## License

MIT
