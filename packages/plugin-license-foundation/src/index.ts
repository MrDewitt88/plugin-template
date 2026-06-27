// @nexus-mindgarden/plugin-license-foundation — NEXUS entitlement LicenseGate.
//
// Drops into the host's PluginManager.activate seam (`LicenseGate.check`). The
// host already verifies the NEXUS agent-JWT for app-licensing; this package adds
// the per-plugin gate (offline, default-deny, last-known-good grace) + the
// entitle-on-activation call. Wire-spec: chatbus #plugin-licensing (nexus #5374,
// agent #5377). The `checkLicense` stub in HOST-INTEGRATION-GUIDE §2.3 becomes real.

export {
  createLicenseClient,
  type CreateLicenseClientOptions,
  type LicenseClient,
} from './client.js'
export {
  verifyEntitlementJwt,
  remoteJwks,
  LicenseVerifyError,
  type VerifyEntitlementJwtOptions,
} from './jwks.js'
export { entitlePlugin, type EntitlePluginOptions } from './entitle.js'
export {
  EntitlementSchema,
  type Entitlement,
  type LicenseGate,
  type LicenseGateResult,
  type LicenseDenyReason,
} from './types.js'
