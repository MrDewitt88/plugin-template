// Shared types für Plugin-Bridge-Foundation. Spec-Reference:
// MrDewitt88/TeamMindV8 docs/PLUGIN-BRIDGE-PROTOCOL.md
//
// Wire-Convention: snake_case auf der Wire, camelCase TypeScript-internal.
// Translation passiert im Endpoint-Handler.

import { z } from 'zod'

// --- Manifest ---

export const PluginI18nStringSchema = z.object({
  de: z.string().optional(),
  en: z.string().optional(),
})
export type PluginI18nString = z.infer<typeof PluginI18nStringSchema>

export const PluginRouteSchema = z.object({
  path: z.string().min(1),
  component_type: z.enum(['web-component', 'iframe']),
  service_endpoint: z.string().min(1),
})
export type PluginRoute = z.infer<typeof PluginRouteSchema>

export const PluginMcpToolEntrySchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    input_schema: z.record(z.unknown()).optional(),
    output_schema: z.record(z.unknown()).optional(),
    scopes_required: z.array(z.string()).optional(),
  }),
])
export type PluginMcpToolEntry = z.infer<typeof PluginMcpToolEntrySchema>

export const PluginModuleExtensionSchema = z.object({
  module: z.string().min(1),
  capability: z.string().min(1),
  hook_endpoints: z.record(z.string()),
})
export type PluginModuleExtension = z.infer<typeof PluginModuleExtensionSchema>

export const PluginManifestSchema = z.object({
  id: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, 'kebab-case 3-64 chars'),
  name: PluginI18nStringSchema,
  description: PluginI18nStringSchema,
  version: z.string().min(1),
  distribution: z.object({
    // Angeglichen an das Host-Schema (Theseus `packages/plugin-system/src/schema.ts:38`).
    //
    // Vorher stand hier `embedded` — ein Wert, den KEIN Host kennt. Ein Autor, der
    // diesem Schema folgte, baute damit ein Manifest, das der Host bei der
    // Installation mit einem Schema-Fehler ABLEHNT. Die Abweichung fiel erst im
    // Rollout auf (agent #8474). Sie hier zu spiegeln verschiebt den Fehlschlag
    // vom Endkunden zurueck an den Build — dort gehoert er hin.
    //
    // Wirksam ist NUR `external-service`. `library` ist im Host-Schema als
    // "future" reserviert, nirgends implementiert und wird ausschliesslich als
    // Negativ-Zweig gelesen (`!== 'external-service'`) — ein Plugin, das es
    // deklariert, validiert und laedt dann nichts. Ob reservierter Name oder
    // Altlast, entscheidet der Gruender; bis dahin bleibt der Wert zulaessig,
    // damit unsere Schemata deckungsgleich sind.
    //
    // Die Betriebsart steuert dieses Feld ohnehin nicht — der Host entscheidet sie
    // an der Bundle-Praesenz (`plugin-service-manager.ts`, `bundleDir`). Siehe
    // PLUGIN-PROVIDER-GUIDE §4.9.0.
    // v0.16.0 — genau EIN zulaessiger Wert. Vorher standen hier nacheinander
    // `embedded` (kannte kein Host) und `library` (kennt der Host, tut nichts).
    // Beide raus, nachgemessen statt vermutet: agent hat alle 20 lokalen
    // Plugin-Manifeste geprueft — 19 tragen `external-service`, NULL tragen
    // `library` oder `embedded`. Der Host nimmt `library` am selben Tag raus.
    //
    // Ein Feld mit einem einzigen zulaessigen Wert ist Komplexitaet ohne
    // Gegenwert; es steht deshalb auf der Streichliste. Es bleibt vorerst, weil
    // eine dritte Schema-Aenderung mitten im Rollout mehr stoert als sie nuetzt
    // — und weil es der Ort waere, an dem ein zweiter Verteilweg andocken
    // wuerde, falls je einer kommt. Kommt keiner, faellt das Feld.
    type: z.enum(['external-service']),
    service_endpoint: z.string().optional(),
    // ⚠️ LEER LASSEN. Nexus konsumiert und emittiert dieses Feld derzeit weder
    // noch (bestaetigt #8488). Falls es bleibt, bezeichnet es ausschliesslich
    // eine MENSCHLICHE Kauf-/Detailseite — niemals einen Manifest-, Bundle-
    // oder Update-Endpunkt. Discovery und Update laufen ueber Nexus-Registry/
    // Entitlement (`plugin_details[]`) und direkte unveraenderliche URLs.
    //
    // Steht auf der Streichliste: ein optionales Feld, das kein Konsument
    // liest, ist dieselbe Konstruktion, die uns mit `embedded` eingeholt hat.
    // Nicht heute entfernt, weil mitten im Rollout eine brechende
    // Schema-Aenderung fuer ein ungelesenes Feld mehr stoert als nuetzt.
    marketplace_url: z.string().optional(),
  }),
  compatibility: z.object({
    apps: z.array(z.string()).min(1),
    min_app_version: z.string().min(1),
  }),
  provides: z.object({
    routes: z.array(PluginRouteSchema).default([]),
    mcp_tools: z.array(PluginMcpToolEntrySchema).default([]),
    module_extensions: z.array(PluginModuleExtensionSchema).default([]),
    // INCOMING-Floor: scopes ein Caller dieses Plugins haben MUSS (enforceScopes,
    // v0.8.0). NICHT der Grant fürs Plugin-Token — siehe `requires.scopes`.
    scopes_required: z.array(z.string()).default([]),
  }),
  /**
   * v0.11.0 (RFC requires-scopes, wiz-mind #5375) — OUTGOING-Grant: die Scopes,
   * die der Host in das Plugin-Bridge-Token mintet, damit das Plugin Reverse-
   * Calls machen darf (z.B. `family.audit.write`, `mcp.read.unifieddb`). Getrennt
   * vom INCOMING-Floor (`provides.scopes_required`), den enforceScopes prüft.
   *
   * OPTIONAL ohne Default (kein `{scopes:[]}`): so kann der Host beim Token-Minting
   * sauber zurückfallen. Es splittet NUR der plugin-wide Seed — der Per-Tool-Union
   * bleibt im Mint (oracle #5418), sonst 403'en granular-scoped Write-Tools (Kanban-
   * Drift 2026-05-11). Volle Mint-Formel beim Host:
   *   (manifest.requires?.scopes ?? manifest.provides.scopes_required)
   *     ∪ ⋃ provides.mcp_tools[].scopes_required
   * → alte Manifeste (ohne `requires`) minten byte-identisch wie heute (backward-compat).
   *
   * ✅ RATIFIED (oracle-Ruling #5418, 2026-06-27): Name `requires.scopes` (vs
   * `consumes_scopes`/`grant.scopes`) — die `provides`↔`requires`-Symmetrie. Ab
   * bridge-foundation v0.11.0 npm-publiziert. RFC: docs/RFC-REQUIRES-SCOPES.md.
   */
  /*
   * v0.15.0 — `scopes` ist INNERHALB von `requires` verpflichtend (vorher
   * `.default([])`). Damit sind drei Zustaende unterscheidbar statt zwei:
   *
   *   requires fehlt          → NICHT deklariert. Der Host laesst die Reichweite
   *                             wie sie ist. Kein bestehendes Plugin bricht.
   *   requires.scopes: []     → ausdrueckliche Aussage "ich brauche nichts".
   *                             Der Host schliesst das Rueckruf-Gate ganz.
   *   requires: {}            → FEHLER.
   *
   * Warum der Fehler: mit `.default([])` wurde `requires: {}` still zu
   * `{scopes: []}` — also zur schaerfsten aller Einstellungen. Ein Autor, der
   * das Feld halb hinschreibt, haette damit unbemerkt saemtliche Rueckrufe
   * verloren, und zwar erst beim Kunden. Dieselbe Logik wie bei E1 im
   * Conformance-Runner: ein leeres Schema ist eine Aussage, gar keins ist eine
   * Auslassung — und beides darf nicht dasselbe bedeuten.
   *
   * myMinds Rueckruf-Gate leitet sich pro Plugin hieraus ab (agent): fehlt
   * `requires`, bleibt die heutige Reichweite; ist es da, gilt genau das und
   * nichts darueber hinaus. Freiwillige Selbstbeschraenkung, kein Zwang.
   */
  requires: z
    .object({
      scopes: z.array(z.string()),
    })
    .optional(),
  ui: z
    .object({
      sidebar_entry: z
        .object({
          icon: z.string(),
          label_key: z.string(),
          sort_order: z.number().int().nonnegative().default(100),
        })
        .optional(),
    })
    .optional(),
  vendor: z.string().optional(),
  license: z.string().optional(),
  homepage: z.string().optional(),
})
export type PluginManifest = z.infer<typeof PluginManifestSchema>

// --- Bridge-Token (JWT) ---

export interface BridgeTokenClaims {
  iss: string
  sub: string // = pluginId (canonical activator)
  jti: string
  iat: number
  exp: number
  host_id: string
  tenant_id: string
  scopes: string[]
  /**
   * v0.10.0 (markview #5357): NICHT im kanonischen V8-Token. V8 trägt die
   * Plugin-ID nur als `sub`; `user_id` ist ein Body-Feld (live-caller), nicht im
   * Token. Daher OPTIONAL — `verifyBridgeToken` erzwingt sie nicht mehr (default
   * required-Set = iss/sub/jti/host_id/tenant_id). Foundation-geminte Tokens
   * tragen sie weiter (backward-compat); Handler lesen `pluginId` (= `sub`-Fallback)
   * + `userId` (= Body-Fallback) über den ctx.
   */
  plugin_id?: string
  user_id?: string
  /**
   * v0.9.0 — optionaler Audience-Claim. Wenn ein Host-Record ein
   * `expected_audience` trägt, erzwingt `verifyBridgeToken` Präsenz + Match
   * (per-Host iss/aud-Binding, markview #5345). Tokens ohne `aud` bleiben für
   * Hosts ohne `expected_audience` gültig (backward-compat).
   */
  aud?: string
  /**
   * v0.10.0 (wiz-mind / v8-fam): host-asserted Familien-Policy-Claim. Generisch
   * `unknown` — das Plugin validiert selbst (z.B. via Zod). Erreicht den Handler
   * über `ctx.claims`. Weitere host-asserted Extra-Claims sind zur Laufzeit
   * ebenfalls auf dem rohen `ctx.claims`-Objekt (cast lesen).
   */
  family_policy?: unknown
}

// --- Host-Keys-Registry ---

export type HostKeyStatus = 'pending' | 'active' | 'rejected'

export interface HostKeyRecord {
  host_id: string
  public_key_pem: string
  status: HostKeyStatus
  fingerprint: string
  registered_at: string
  approved_at: string | null
  /**
   * v0.9.0 — per-Host iss/aud-Binding (markview #5345). Wenn gesetzt, erzwingt
   * `verifyBridgeToken` sie an `jwtVerify` (Multi-Host: V8 vs Theseus vs
   * FamilyMind mit je eigenem Issuer/Audience). Fehlend → keine Erzwingung
   * (backward-compat).
   */
  expected_issuer?: string | null
  expected_audience?: string | null
  /** v0.9.0 — Reverse-Call / Pfad-C-Collab WebSocket (vom register-host übernommen). */
  relay_url?: string | null
  /**
   * v0.9.0 — ISO-Timestamp des letzten erfolgreichen Token-Verifies. Nur
   * gepflegt wenn `createBridgeApp({ trackHostLastUsed: true })` (opt-in,
   * vermeidet per-Request-Writes). Für Settings-UI „zuletzt aktiv".
   */
  last_used_at?: string | null
}

// --- Drift #206: Schema-Drift Signaling im Handshake ---
//
// Plugins evolve manifest/registration-schemas additively (z.B. neue optional
// fields wie host_metadata). Hosts die pre-Field-Addition registriert haben
// bleiben sonst dauerhaft stale. host_record_status signalisiert dem Host wo
// er steht und ob er re-registrieren sollte.
//
// Block ist ALWAYS-PRESENT — auch bei first-register und bei schon-current
// records — damit der Vertrag symmetrisch bleibt und Host nie zwischen
// 'kein Block' vs 'Block-mit-current' raten muss.
//
// Source-of-Truth Cross-Repo: oracle/plug-ea adopted symmetric contract
// (chatbus msg #246), plug-elec etmind-bridge auth/host-registry.ts:48-68.

export const PLUGIN_REGISTRATION_SCHEMA_VERSION = 1 as const

/**
 * Optional fields die ein Host bei register-host mitschicken KANN. Wenn ein
 * Plugin sie ERZWINGT (via BridgeAppOptions.optionalRegisterFields) und sie
 * fehlen → in missing_optional_fields[] und reregister_recommended=true.
 *
 * v0.2.0 baseline:
 *  - host_version: host's app-version (für Capability-gating)
 *  - relay_url: WebSocket-Endpoint für Pfad-C-Collab (markview) /
 *    Reverse-Call-Channel (plug-elec 'reverse_call_url'). Optional aber
 *    cross-repo-etabliert genug für baseline-Aufnahme (msg #237 markview,
 *    msg #242 plug-elec).
 *
 * ⚠️ v0.7.2 (Drift #105 / cluster-ruling oracle #4520 + agent #4515):
 * Dies ist KEIN Default mehr. Der Foundation-Default ist jetzt `[]` (opt-in) —
 * ein „optional" benanntes Feld darf durch seine Abwesenheit NICHT dauerhaft
 * `reregister_recommended=true` triggern (Selbstwiderspruch → reregister-Loop).
 * Diese Konstante bleibt als bequemes Opt-in für Plugins, die `host_version` +
 * `relay_url` wirklich erzwingen wollen:
 *   new HostKeyRegistry(repo, { optionalRegisterFields: BASELINE_OPTIONAL_REGISTER_FIELDS })
 */
export const BASELINE_OPTIONAL_REGISTER_FIELDS = ['host_version', 'relay_url'] as const

export const HostRecordStatusSchema = z.object({
  schema_version: z.number().int().min(1),
  plugin_current_schema: z.number().int().min(1),
  is_first_register: z.boolean(),
  reregister_recommended: z.boolean(),
  missing_optional_fields: z.array(z.string()).default([]),
  // v0.2.3 — Defensive Cross-Host guard. True wenn dieselbe
  // {host_id, missing_optional_fields}-Tuple in den letzten N Minuten
  // ≥M-mal re-registriert wurde ohne dass die fields populated wurden.
  // Plugin-handler kann entscheiden ob 429 zurück oder nur warn-log.
  // Source: plug-elec DM #350 (V8-Bug C.1 supply-without-skip endless loop).
  reregister_loop_detected: z.boolean().optional(),
})
export type HostRecordStatus = z.infer<typeof HostRecordStatusSchema>

// --- Bridge-Endpoint Request/Response Schemas ---

export const HandshakeRequestSchema = z.object({
  plugin_id: z.string().min(1),
  host_id: z.string().min(1),
  host_version: z.string().min(1),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
})
export type HandshakeRequest = z.infer<typeof HandshakeRequestSchema>

export const HandshakeResponseSchema = z.object({
  plugin_id: z.string(),
  version: z.string(),
  manifest: PluginManifestSchema,
  capabilities_acknowledged: z.array(z.enum(['routes', 'mcp_tools', 'module_extensions'])),
  health: z.enum(['ok', 'degraded', 'unhealthy']),
  // Drift #206 — symmetric, always-present
  host_record_status: HostRecordStatusSchema,
})
export type HandshakeResponse = z.infer<typeof HandshakeResponseSchema>

// --- register-host Request/Response ---
//
// Bootstrap-Endpoint — Host posted seinen Public-Key zur Plugin-Bridge bevor
// JWT-Auth funktional ist. Drift #12: idempotent — same key preserves status.

// v0.3.1 dual-read for ecosystem-wide drift-resolution (V8 msg #483 + markview msg #485):
// `public_key` is V8/Theseus/MarkView-canonical, `public_key_pem` is plug-tmpl-Foundation-canonical.
// Foundation accepts BOTH, prefers `public_key_pem` (deskriptiver Name) wenn beide present.
// Long-term Ecosystem konvergiert auf `public_key_pem` (markview msg #485 vote).
export const RegisterHostRequestSchema = z
  .object({
    host_id: z.string().min(1),
    public_key_pem: z.string().min(1).optional(),
    public_key: z.string().min(1).optional(),
    // Optional fields — wenn fehlend → in host_record_status.missing_optional_fields
    host_version: z.string().optional(),
    // v0.2.0 — Pfad-C-Collab / reverse-call-channel (markview, plug-elec)
    relay_url: z.string().url().optional(),
    // v0.9.0 — per-Host iss/aud-Binding (markview #5345). Auf dem Record gespeichert,
    // von verifyBridgeToken an jwtVerify erzwungen wenn vorhanden.
    expected_issuer: z.string().min(1).optional(),
    expected_audience: z.string().min(1).optional(),
  })
  // path: [] (Root) ist Absicht. Frueher hing der Fehler an ['public_key_pem'],
  // wodurch die Meldung als "public_key_pem: ... required" ausgeliefert wurde —
  // das liest sich wie "nur public_key_pem wird akzeptiert" und hat genau diesen
  // Irrtum in der Praxis erzeugt (plug-elec #8462: handgeschriebener Body-Reader
  // nahm nur eine Schreibweise an). BEIDE Namen sind gleichwertig; der Fehler
  // gehoert deshalb an keines der beiden Felder.
  .refine((data) => data.public_key_pem !== undefined || data.public_key !== undefined, {
    message:
      'host public key missing: send it as `public_key_pem` (preferred) OR `public_key` (legacy) — both are accepted, at least one is required',
    path: [],
  })
export type RegisterHostRequest = z.infer<typeof RegisterHostRequestSchema>

/**
 * Drift-resolution helper: prefer `public_key_pem` (canonical-target), fall back to
 * `public_key` (legacy Theseus/MarkView/V8). Returns the PEM string. Throws if both
 * missing (should never happen — schema enforces via .refine).
 */
export function extractPublicKeyPem(req: RegisterHostRequest): string {
  if (req.public_key_pem) return req.public_key_pem
  if (req.public_key) return req.public_key
  throw new Error('extractPublicKeyPem: neither public_key_pem nor public_key set (schema-bypass?)')
}

export const RegisterHostResponseSchema = z.object({
  host_id: z.string(),
  status: z.enum(['pending', 'active', 'rejected']),
  fingerprint: z.string(),
  registered_at: z.string(),
  // Drift #206 — symmetric, always-present
  host_record_status: HostRecordStatusSchema,
})
export type RegisterHostResponse = z.infer<typeof RegisterHostResponseSchema>

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unhealthy']),
  version: z.string().min(1),
  last_active: z.string().optional(),
  // Phase-3 V8/Theseus: Live-Re-Registration trigger via manifest_hash diff.
  // Optional — Plugin-Provider die kein hash senden → Host macht kein
  // automatisches Re-Register (backward-compat).
  manifest_hash: z.string().min(1).optional(),
  /**
   * v0.18.0 — der Nutzer-Kanal (agent). EINE Zeile, die der Host beim Plugin
   * in seiner Liste anzeigt. Für Plugins OHNE eigene Oberfläche ist das der
   * einzige Weg, den Nutzer überhaupt zu erreichen — Health-JSON und
   * `/readyz` erreichen niemanden.
   *
   * Warum auf der Health-Antwort und nicht als eigener Aufruf (agents
   * Entwurf, und er ist besser als meine Fassung): die Regel lautet „Zustand,
   * kein Ereignis". Hier ist sie **strukturell erzwungen** statt vereinbart —
   * das Plugin meldet die Zeile bei JEDER Sonde, solange die Bedingung gilt;
   * hört es auf, verschwindet sie ohne Rücknahme-Aufruf; und Wegklicken kann
   * sie nicht dauerhaft unterdrücken, weil die nächste Sonde sie erneut
   * liefert. Kein neuer Endpunkt, keine neue Auth, kein neuer Zustand.
   *
   * ⚠️ RECHNE SIE NICHT IN DER SONDE AUS. Das Health-Budget gilt unverändert
   * (§4.9.5). Ein Verwaisungs-Scan gehört EINMAL in den Boot; die Sonde gibt
   * nur das gespeicherte Ergebnis zurück. Wer hier scannt, macht aus einer
   * Meldung über verlorene Daten einen Grund für `unhealthy`.
   *
   * ⚠️ Und sie ist EINZAHL, mit Absicht. Wer zwei Dinge zu sagen hat, sagt
   * das wichtigere. Eine Liste wird ein Feed, und ein Feed wird ignoriert.
   *
   * Sprache: der Host reicht dem Plugin heute KEINE Locale durch (gemessen —
   * weder Handshake noch Manifest tragen eine). Das Plugin wählt die Sprache
   * also selbst; formuliere in der Sprache deiner Oberfläche. Das ist eine
   * bekannte Lücke, kein Versehen — sie wird geschlossen, wenn eine Locale
   * durchgereicht wird, und bis dahin ist eine verständliche Meldung in einer
   * Sprache besser als gar keine.
   *
   * `text` ist bewusst kurz gehalten: was der Nutzer in einer Zeile liest.
   * **Gezählt melden** („18 Einträge liegen noch am alten Ort"), nicht „da ist
   * etwas" — eine Warnung ohne Zahl ist nicht nachprüfbar.
   *
   * DER HOST NORMALISIERT DEN TEXT an seiner Grenze (`sanitizeHealthNotice`),
   * weil er direkt auf dem Bildschirm des Nutzers landet und von einem fremden
   * Autor stammt. Verlass dich nicht auf die Form:
   *   - Steuerzeichen inkl. Zeilenumbruch fliegen raus. Nicht wegen Skripten
   *     (die Oberfläche escaped ohnehin), sondern weil Umbrüche und
   *     Rücksetzzeichen EINE Meldung wie MEHRERE aussehen lassen. Die
   *     Einzahl-Regel oben trägt ohne diese Bereinigung nicht: eine
   *     Mengenbeschränkung lässt sich durch den INHALT eines einzelnen
   *     Elements umgehen, wenn dessen Form nicht mitbeschränkt ist.
   *   - über 200 Zeichen wird GEKÜRZT, nicht abgewiesen
   *   - eine unbekannte Stufe wird ABGEWIESEN, nicht auf 'info' abgerundet
   *
   * Die Asymmetrie der letzten beiden ist Absicht: weise ab, wo Stillschweigen
   * die Bedeutung verfälscht (ein 'error', das still zu 'info' würde, verlöre
   * die Dringlichkeit unbemerkt) — kürze, wo Abweisen die Nachricht ganz
   * verschwinden ließe und der Autor es nie erführe.
   */
  notice: z
    .object({
      level: z.enum(['info', 'warning']),
      text: z.string().min(1).max(200),
    })
    .optional(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const ExecuteToolRequestSchema = z.object({
  tool_name: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
  actor_class: z.enum(['user', 'kiara']).nullable().optional(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
})
export type ExecuteToolRequest = z.infer<typeof ExecuteToolRequestSchema>

export const ExecuteToolResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  }),
])
export type ExecuteToolResponse = z.infer<typeof ExecuteToolResponseSchema>

export const RenderUiRequestSchema = z.object({
  route_path: z.string().regex(/^\//, 'route_path must start with /'),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  context: z.record(z.unknown()).default({}),
})
export type RenderUiRequest = z.infer<typeof RenderUiRequestSchema>

export const RenderUiResponseSchema = z.object({
  html: z.string(),
  scripts: z.array(z.string().min(1)).default([]),
  styles: z.array(z.string().min(1)).default([]),
})
export type RenderUiResponse = z.infer<typeof RenderUiResponseSchema>

export const InvokeHookRequestSchema = z.object({
  module: z.string().min(1),
  capability: z.string().min(1),
  hook_name: z.string().min(1),
  payload: z.unknown(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
})
export type InvokeHookRequest = z.infer<typeof InvokeHookRequestSchema>

export const InvokeHookResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      // v0.2.0 — Parity mit ExecuteToolResponseSchema (Drift #103 canonical)
      details: z.unknown().optional(),
    }),
  }),
])
export type InvokeHookResponse = z.infer<typeof InvokeHookResponseSchema>

// --- Bridge-Auth-Context ---

export interface BridgeAuthContext {
  pluginId: string
  hostId: string
  tenantId: string
  userId: string
  scopes: string[]
  jti: string
  /**
   * v0.10.0 (wiz-mind #§7) — die rohen verifizierten JWT-Claims. Passthrough für
   * host-asserted Extra-Claims (z.B. `claims.family_policy`), die nicht als
   * dedizierte ctx-Felder modelliert sind. Immer present; das Plugin validiert
   * Extra-Claims selbst.
   */
  claims: BridgeTokenClaims
}

// --- Tool/Hook-Handler-Signatures ---

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: BridgeAuthContext & { actorClass: 'user' | 'kiara' | null },
) => Promise<unknown>

export type HookHandler = (
  payload: unknown,
  ctx: BridgeAuthContext & { module: string; capability: string; hookName: string },
) => Promise<unknown>

export type RenderUiHandler = (
  routePath: string,
  ctx: BridgeAuthContext & { context: Record<string, unknown> },
) => Promise<RenderUiResponse>
