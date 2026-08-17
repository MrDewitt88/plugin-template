# Plugin-Bridge Wire-Spec (language-neutral)

> **Status:** NORMATIVE **for the wire** — the byte-level shapes, claims and error codes. For *what you owe as a plugin*, the binding document is **[`PLUGIN-VERTRAG.md`](PLUGIN-VERTRAG.md)** (one page). This spec and the contract cover different questions and do not overlap; where they touch, the contract wins.
>
> Verified line-by-line against `@nexus-mindgarden/plugin-bridge-foundation@0.13.0` (the reference implementation) on 2026-07-30, including empirical probes against the compiled artifact.
>
> ⚠️ **This spec is still unproven in a second language.** It claims a Python, Rust or Go service can speak the same bridge; nobody has built one yet. If you are that first implementer, **report where it fails you** — that is the gap we cannot close from this side.
> **Audience:** anyone implementing a plugin bridge **without** the TypeScript foundation — Python (Speak-Mind, Med-Mind), Rust, Go, Swift.
> *(Correction: an earlier revision also listed Edessa. That was wrong — EdessaV1 is a training pipeline whose contract with myMind is `mymind-tool-catalog/policy-contract-v1`, not the plugin bridge; its vision encoder is model-internal. Being written in Python does not make a repo a bridge consumer.)*
> **Owner:** plug-tmpl. **Origin:** Speak-Mind's Python port (`anon` #8064) surfaced that the only reference implementation was TS — this document closes that gap.
>
> **Authority order:** this document → the foundation code → everything else.
> ⚠️ `MrDewitt88/TeamMindV8 docs/PLUGIN-BRIDGE-PROTOCOL.md` (dated 2026-06-19) predates foundation 0.8.0–0.13.0 and is **stale in load-bearing places** — see [§10 Drift](#10-drift-vs-the-teammindv8-doc). Do not build from it.

---

## 1. Minimum viable bridge

For an `external-service` plugin with **empty `provides`** (no UI routes, no MCP tools), exactly **three** endpoints are required:

| Endpoint | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/plugin-bridge/v1/register-host` | POST | **none** (bootstrap) | host pushes its public key |
| `/plugin-bridge/v1/handshake` | POST | Bearer | activation round-trip |
| `/plugin-bridge/v1/health` | GET | Bearer | liveness + version |

Omittable: `/manifest` (**but see §6 caveat**), `/execute-tool`, `/render-ui`, `/invoke-hook` — those are only called when the manifest declares matching capabilities. `/plugin-bridge/v1/register-tenants` is **not** part of the foundation at all; hosts treat a 404 as "unsupported" and continue.

**Ordering is mandatory:** `register-host` **before** `handshake`. The handshake is auth-gated and cannot verify a token signed by a key it never received. Calling handshake first yields `401 host_not_registered`.

---

## 2. `POST /plugin-bridge/v1/register-host` — unauthenticated bootstrap

Absent from the old doc entirely. **Without it no host can ever authenticate.**

### Request

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `host_id` | string, min 1 | ✔ | not trimmed; whitespace-only passes |
| `public_key_pem` | string, min 1 | ⚠ one of | foundation-canonical name; **wins if both sent** |
| `public_key` | string, min 1 | ⚠ one of | legacy V8/Theseus/MarkView name |
| `host_version` | string | — | |
| `relay_url` | string, **URL-validated** | — | reverse-call channel; a bare `host:port` → `400` |
| `expected_issuer` | string, min 1 | — | enables per-host `iss` binding |
| `expected_audience` | string, min 1 | — | enables per-host `aud` binding |

**Dual-read both key field names.** V8 sends *both* with the same value on every call. Accepting only one name is the single most likely reason a hand-written bridge 400s in production.

The key is a **PEM-armored SPKI (X.509 SubjectPublicKeyInfo)** whose first characters are literally `-----BEGIN PUBLIC KEY-----`. `register-host` performs **no** cryptographic validation — garbage is stored and fingerprinted; the failure only surfaces at the first verify. Validating the key here is a legitimate improvement.

### Response — HTTP 200

```jsonc
{
  "host_id": "theseus",
  "status": "pending" | "active" | "rejected",
  "fingerprint": "a1b2:c3d4:…",     // SHA-256 hex of the TRIMMED PEM TEXT, in 4-char groups joined by ':'
  "registered_at": "2026-07-30T01:02:03.456Z",   // ISO-8601; preserved across key rotation
  "host_record_status": { … }        // ALWAYS present, see §5
}
```

The fingerprint hashes the **PEM string**, not the decoded DER. Do not base64-decode first.

### Idempotency (normative)

Store the PEM **trimmed**, and compare trimmed:

| Case | Result |
| --- | --- |
| new `host_id` | `pending` — or `active` if you auto-accept (§3) |
| same `host_id` + byte-identical trimmed PEM | **status preserved** — safe to call on every startup |
| same `host_id` + different PEM (rotation) | status **resets to `pending`** |

`relay_url` / `expected_issuer` / `expected_audience` use **overlay semantics**: written only when present in the request, otherwise **preserved** — including across a key rotation. Never null them out because a field was omitted.

---

## 3. ⚠️ The activation deadlock — decide your trust policy

A new host defaults to **`pending`** (privacy-by-default), and *every* authenticated call then fails `401 host_pending` — including `/health`. There is **no protocol path** for the host to recover on its own. This cost a production activation round (eamind 0.2.0) and is the single biggest trap in this spec.

Pick one, deliberately:

- **Host-spawned bundled plugins** — the host *is* the trust root: it spawned you on loopback and is your only caller. Auto-accept.

> ⚠️ **Do not detect this from `PLUGIN_BRIDGE_PORT`.** Earlier revisions of this spec — and the scaffold — derived the trust root from that variable being set. That no longer holds: env-first port resolution is now an obligation for *every* plugin, and a self-managed service sets the variable **itself** (via launchd/systemd). A standalone service that copies the heuristic ends up trusting its own launcher and will accept `register-host` from anyone on loopback. **Decide it explicitly, as a constant in your source.** You know whether a host is your only starter; the runtime cannot tell you.
- **Standalone services** (own app, own updater — Speak-Mind's case) — the trust-root argument is **weaker**, because `register-host` is unauthenticated and anyone on loopback can call it. Prefer a **configured allowlist** `{host_id → expected fingerprint}` over blanket auto-accept, and reject a rotation that does not match. If you genuinely have no approval UI, auto-accept is defensible — but make it an explicit, documented decision, not an accident.

Whatever you choose, a `pending` record must be **reachable to fix**. Never ship a bridge whose only escape is deleting a database file.

---

## 4. Token verification (Ed25519 / EdDSA)

The exact algorithm. Deviating in either direction (stricter or laxer) breaks interoperability.

```
1. Split the compact JWS on '.' — exactly 3 segments, else reject invalid_token.
2. base64url-decode the PAYLOAD *without verifying* and read `host_id`.
      → missing / non-string / empty  ⇒ 401 invalid_claims "host_id claim missing"
   Treat this value as UNTRUSTED until step 4 succeeds.
3. Look up that host's record.
      → no record       ⇒ 401 host_not_registered
      → status pending  ⇒ 401 host_pending
      → status rejected ⇒ 401 host_rejected
4. Verify the signature: Ed25519 (pure, RFC 8032, no pre-hash) over the
   signing input  ASCII(seg0) + "." + ASCII(seg1)  — the raw wire segments.
   Header `alg` MUST equal the byte-exact string "EdDSA" — check it BEFORE
   any signature work. Reject 'none', 'HS256', 'RS256', 'ES256', 'eddsa',
   'Ed25519', absent. Matching is case-sensitive.
5. Enforce claims (§4.1).
```

**Key selection is by the `host_id` claim, never by a JWT `kid` header.** Hosts *do* send `kid` (MarkView/Theseus convention) — ignore it, and do not reject it. Arbitrary extra header members are accepted; only an unrecognized `crit` extension is rejected.

**Curve:** the TS reference accepts Ed448 as well (a jose artifact). If you implement Ed25519 only, reject a non-Ed25519 SPKI with an **explicit error** rather than mis-verifying.

### 4.1 Claims — normative

**Mandatory** (each must be `typeof === 'string'`), missing ⇒ `401 invalid_claims "missing claim: <name>"`:

```
iss   sub   jti   host_id   tenant_id
```

**Plus:** `scopes` must be **present and an array** — a token without `scopes` is rejected, `[]` is fine. Array members are not type-checked. This is a separate typed gate with its own message, not "just another required claim".

**NOT mandatory:**

| Claim | Reality |
| --- | --- |
| `plugin_id`, `user_id` | **optional** since 0.10.0 — the canonical V8 token omits them. Derive: `plugin_id = claims.plugin_id ?? claims.sub`, `user_id = claims.user_id ?? body.user_id`. |
| `exp` | **not required** (measured). A token with no `exp` **never expires** here; only enforced when present. ⚠️ On a deprecation path — log it now, reject from a later cutoff. See the ruling below. |
| `iat`, `nbf` | not required; `nbf` only checked if present. |
| `aud` | optional — see §4.2. |

- **No clock tolerance** (0 s) and **no max-token-age**.
- **`exp` in the past** ⇒ `401 expired`. A future `nbf` has no dedicated code — it falls through to `invalid_token`.
- **No replay protection anywhere.** `jti` is required to be present and is passed through to handlers; there is **no** nonce store, seen-jti cache, or TTL bookkeeping. **Do not add a replay cache "for compatibility"** — V8 mints *one* long-lived per-activation token and reuses it for every call, so a cache would reject traffic the canonical implementation accepts.

> ⚠️ **If your JWT library requires `exp` by default** (PyJWT `require=['exp']`, python-jose defaults), you will reject canonical tokens. Configure it off, or accept that you are deliberately stricter than the reference.

> 🕐 **This is measured behaviour, and it is on a deprecation path. Operator ruling, 2026-08-15 — three phases:**
>
> 1. **Now — verifiers log, do not reject.** A token without `exp` is still accepted. Count it and record the `host_id`, somewhere a human will actually look. Silence here is what let this survive.
> 2. **Minters add `exp`.** That is where the work is (myMind, V8/Family, any host that mints). Pure verifiers — most plugins — have nothing to change.
> 3. **From a cutoff date — reject.** The date gets set once the minters report, **not before**. Nobody is locked out by a deadline they were never told about.
>
> **Independently of this, and available to you today:** enforce your own **maximum age via `iat`**. It needs no contract change and no coordination — a token with no `exp` but an `iat` from three months ago is one you may refuse right now. If `iat` is *also* absent, report it: that host is minting a credential with no temporal claim at all.
>
> Why the phased path rather than a flip: a verifier that hard-requires `exp` today locks out every host that mints without one, and the plugin gets blamed for the host's omission. Raised by markview, who found it as a verifier and explicitly declined to make it strict unilaterally.

### 4.2 `iss` / `aud` — per-host binding

Both are **off by default** and switched on per host record by `register-host`:

| | Presence | Value check |
| --- | --- | --- |
| `iss` | **always required** (in the mandatory set) | only when the record carries `expected_issuer` → mismatch `401 invalid_issuer` |
| `aud` | only when the record carries `expected_audience` | mismatch/missing → `401 invalid_audience` |

`undefined` and `null` both mean "no enforcement".

**V8 always sends both** `expected_issuer` and `expected_audience` on `register-host` (`expected_audience` = your plugin-id). So in practice binding **will** be active: persist both and enforce them on every verify. Ignoring them makes you strictly weaker than the reference; hardcoding `aud == manifest.id` breaks any host that binds differently.

### 4.3 `sub` is ambiguous in the wild — do not validate it

The foundation's own comment says `sub` is the plugin-id; **V8's real signer sets `sub` = user UUID** and carries the plugin id in `aud`/`plugin_id`. Treat `sub` as an **opaque string**, never validate it as a UUID, and only use it as the documented fallback. The live caller's user id is reliably only in `body.user_id`.

---

## 5. `host_record_status` — always present

Mandatory in **both** the `handshake` and `register-host` success responses — including first-register and already-current records. The symmetry is deliberate: a host must never have to distinguish "no block" from "block says current".

```jsonc
{
  "schema_version": 1,          // int ≥1 — hardcoded constant, NOT derived
  "plugin_current_schema": 1,   // int ≥1 — same constant
  "is_first_register": true,
  "reregister_recommended": false,
  "missing_optional_fields": [],
  "reregister_loop_detected": false   // optional; omit unless you implement detection
}
```

**Simplest correct implementation:** emit exactly the five fields above with `reregister_recommended: false` and `missing_optional_fields: []`.

> 🚨 **Never emit `reregister_recommended: true` for a field the host cannot supply.** That is the documented 119 000-call re-register loop (Drift #105): the host re-registers, the field is still absent, the next handshake asks again, forever. Only enforce optional fields you genuinely require.

---

## 6. `POST /plugin-bridge/v1/handshake`

### Request — 5 required fields, nothing else

| Field | Type |
| --- | --- |
| `plugin_id`, `host_id`, `host_version` | non-empty strings |
| `tenant_id`, `user_id` | **strict UUID**: dashed 8-4-4-4-12 hex only |

**UUID strictness:** do **not** validate with Python's `uuid.UUID()` — it accepts un-dashed and brace-wrapped forms the canonical schema **rejects**, making you more permissive than the contract. Use `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`.

**Unknown keys are stripped, never rejected.** Hosts still send `bridge_token` in the body (per the stale doc) — do **not** reject it, and do **not** trust it. Authenticate from the `Authorization: Bearer` header **only**.

`body.plugin_id != manifest.id` ⇒ **HTTP 400** `plugin_id_mismatch`.

### Response — six mandatory fields

```jsonc
{
  "plugin_id": "speak-mind",
  "version": "1.0.0",
  "manifest": { … },                                            // the full validated manifest
  "capabilities_acknowledged": ["routes","mcp_tools","module_extensions"],
  "health": "ok" | "degraded" | "unhealthy",
  "host_record_status": { … }                                   // §5
}
```

`capabilities_acknowledged` is a **hardcoded constant** in the reference — all three values, always, regardless of what the manifest declares. Copying the constant is the byte-compatible choice. The host validates this response against the same schema, so all six fields are load-bearing.

---

## 7. `GET /plugin-bridge/v1/health` — authenticated

| Field | Required |
| --- | --- |
| `status` | ✔ `ok` \| `degraded` \| `unhealthy` |
| `version` | ✔ non-empty string |
| `last_active` | — |
| `manifest_hash` | — (see caveat) |

> ⚠️ **`/health` is behind Bearer auth**, which surprises people expecting an open liveness probe. Hosts poll it *with* the token.
>
> ⚠️ **Returning `degraded`/`unhealthy` makes the host suspend the activation** on its next poll, and resume refuses while status ≠ `ok`. Only report non-`ok` when you mean it.

**`manifest_hash` caveat — the one coupling that voids the 3-endpoint minimum:** if you emit `manifest_hash`, the host re-fetches `GET /plugin-bridge/v1/manifest` on hash drift, so you must implement it (returning `{"manifest": {...}}` — note the wrapper). **Either omit `manifest_hash` entirely and never implement `/manifest`, or emit it and implement both.**

Hash algorithm, if you emit it: SHA-256 hex (lowercase) over a stable serialization of the **validated/normalized** manifest — keys sorted, array order preserved, no whitespace.

```python
h = hashlib.sha256(
    json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
).hexdigest()
```

`ensure_ascii=False` matters: JS `JSON.stringify` does not `\u`-escape non-ASCII. Hash the *normalized* object (schema defaults applied), never the raw YAML text.

---

## 8. Error contract

| Situation | HTTP | Body |
| --- | --- | --- |
| auth failure (all 8 codes) | **401** | `{"error":{"code","message"}}` |
| malformed JSON | 400 | `{"error":{"code":"invalid_request","message":"malformed JSON"}}` |
| schema violation | 400 | `{"error":{"code":"invalid_request","message":"<field>: <issue>; …"}}` |
| `plugin_id` ≠ `manifest.id` | 400 | `{"error":{"code":"plugin_id_mismatch",…}}` |
| **handler** error (execute-tool / invoke-hook) | **200** | `{"ok":false,"error":{"code","message","details"?}}` |
| tool not registered | **200** | `{"ok":false,"error":{"code":"tool_not_found",…}}` |
| insufficient scope (opt-in) | **403** | `{"ok":false,"error":{"code":"insufficient_scope",…}}` |
| render-ui error | 404 / 500 | `{"error":{"code","message"}}` — **not** the `ok:false` envelope |

Auth codes: `invalid_token` · `host_not_registered` · `host_pending` · `host_rejected` · `expired` · `invalid_claims` · `invalid_issuer` · `invalid_audience`.

- **403 is never used for auth** — even `host_rejected` is a 401. The only 403s in the whole foundation are `insufficient_scope` and a static-UI path guard.
- **Returning 500 for a handler error breaks the host**: it parses the success schema only for 2xx and turns anything else into a transport error. Handler failures are **200 + `ok:false`**.
- Bearer prefix matching is **case-insensitive** on the scheme, and the token is trimmed.
- **Echo `X-Request-Id`** on *every* response including errors: propagate `X-Request-Id`/`x-request-id` verbatim if present, else generate a UUIDv4.
- Content-Type `application/json`.

---

## 9. Manifest — required vs. silently stripped

### 9.1 Required / optional

**Required (7):** `id`, `name`, `description`, `version`, `distribution`, `compatibility`, `provides`.
**Optional (5):** `requires`, `ui`, `vendor`, `license`, `homepage`.

`provides` itself is **required**, but all four inner fields default to `[]` — so `provides: {}` is valid, while omitting `provides` entirely is a hard error.

| Field | Constraint |
| --- | --- |
| `id` | 3–64 chars, `^[a-z][a-z0-9-]*[a-z0-9]$` — `speak-mind` ✔, `speak_mind` ✘, `SpeakMind` ✘ |
| `name`, `description` | must be **objects**; `de`/`en` both optional (`{}` passes — no "at least one locale" rule) |
| `version`, `compatibility.min_app_version` | **not** semver-validated (`"1"` passes) |
| `compatibility.apps` | array, **≥1** entry, no allow-list of host names |
| `distribution.service_endpoint` | **fully optional**, no URL validation — set it anyway, the host needs it |
| `routes[].path` | no leading-slash constraint here, but `/render-ui` **requires** one → always author `/my-view` |
| `routes[].component_type` | enum `web-component` \| `iframe` |
| `ui.sidebar_entry` | `icon` + `label_key` required; `sort_order` non-negative **integer**, default 100 |

Use the literal **`127.0.0.1`**, never `localhost` (browser CSP treats them as different origins; hosts allow-list `127.0.0.1:*`). `localhost`/`[::1]` trigger a Drift #203 warning.

### 9.2 The strip trap

No manifest schema uses strict mode — **unknown keys are silently dropped, with no error and no warning.** Concretely lost:

| You write | Reality |
| --- | --- |
| `provides.description` | **stripped** — `provides` accepts only `routes`, `mcp_tools`, `module_extensions`, `scopes_required`. Prose belongs in top-level `description.{de,en}` or per-tool `description`. |
| `name.fr` / any locale ≠ `de`/`en` | stripped |
| `inputSchema` (camelCase) | **stripped** → tool ships with no JSON-Schema and the host guesses arguments |
| `required_scopes` (instead of `scopes_required`) | **stripped** → tool silently loses its scope gate |
| any camelCase spelling | stripped — **the wire is snake_case only**, there is no aliasing |

The two lethal-but-silent ones are `inputSchema` and `required_scopes`: both parse clean and degrade behaviour at runtime.

### 9.3 `mcp_tools`

Both forms are valid and may be mixed: bare `"documents.list"`, or `{name, description?, input_schema?, output_schema?, scopes_required?}` (only `name` required).

- **Tool names are bare `<module>.<verb>`** — never `<plugin-id>.<module>.<verb>`. The host synthesizes the prefix; a prefixed name yields a double prefix and a tool-lookup miss (surfacing as `200 {ok:false, tool_not_found}`, not a validation error).
- Tool `description` is a **plain string** — `{de,en}` there is a hard error (unlike the top-level `description`, which must be an object).
- `input_schema`/`output_schema` are opaque maps; the foundation neither validates them as JSON-Schema nor validates arguments against them.
- Malformed extended-form entries produce the **opaque** error `provides.mcp_tools.<i>: Invalid input` with no sub-path.
- The **string form carries no per-tool scopes**, and an *undeclared* tool contributes none either — so its required set collapses to the plugin-wide floor. Declare every registered handler in the manifest or you silently lose per-tool gating.

### 9.4 `requires` — never write it empty

`requires` **absent** ≠ `requires: {}`. `{}` parses to `{scopes: []}`, which **zeroes the host's plugin-wide mint seed** (the formula is `requires?.scopes ?? provides.scopes_required`). Omit the whole key unless you truly mean an empty outgoing grant. Per-tool scopes are unaffected.

### 9.5 Filename

Canonical: **`manifest.<plugin-id>.yaml`** — the suffix **must** equal `manifest.id` (anti-collision guard for the shared plugins directory). Bare `manifest.yaml` still loads with a deprecation warning. Speak-Mind ships `manifest.speak-mind.yaml`.

---

## 10. 🚨 You must implement the tenant check yourself

**The foundation does NOT enforce it.** There is no `body.tenant_id == claims.tenant_id` comparison anywhere in the bridge code — it sidesteps the issue by handing handlers the **claim** value. This is the one place where the old doc is *more* correct than the reference implementation, and it is a genuine cross-tenant IDOR if you skip it:

```python
if body.tenant_id != claims["tenant_id"]:
    return 403, {"error": {"code": "forbidden", "message": "tenant mismatch"}}
```

Compare **raw strings**. The claim-side `tenant_id` is an arbitrary non-empty-checked string (not UUID-validated), while the *body* `tenant_id` **is** UUID-validated — so normalizing one side would produce false mismatches. Key all your storage off the **claim**, never off the body.

---

## 11. Drift vs. the TeamMindV8 doc

If you already read `MrDewitt88/TeamMindV8 docs/PLUGIN-BRIDGE-PROTOCOL.md`, these parts are **wrong** as of 0.13.0:

| The doc says | Reality |
| --- | --- |
| *(no `register-host` section)* | **The endpoint exists and is mandatory.** Building from the doc's endpoint list ships a bridge that can never authenticate. |
| `sub` = user UUID | ambiguous; opaque string, never validate (§4.3) |
| claim table omits `jti` | **`jti` is mandatory** |
| claim table omits `scopes` | **`scopes` must be present and an array** |
| `iat`/`exp` are enforced, "TTL 24 h, rotates automatically" | `exp` **not required**; no rotation in the protocol; no clock tolerance |
| `aud` always present = plugin-id | optional; per-host opt-in binding |
| *(no per-host `iss`/`aud`)* | exists since 0.9.0, and V8 **always** sets it |
| `host_record_status` is optional, omitted for unknown hosts; `schema_version: 2` | **always present**; both versions hardcoded `1`; 6 fields, not 4 |
| handshake body carries `bridge_token` | ignored (stripped); header only — but don't reject it |
| `capabilities_acknowledged` is derived (`["routes","mcp_tools"]`) | hardcoded, all three |
| `403 forbidden` for auth failures | **auth is always 401**; 403 only for `insufficient_scope` |
| error codes are a closed 4-value set | open string set; `tool_not_found` is a **200** |
| "HTTP 200 even for handler errors — only auth/wire use status codes" | mostly true, **except** `403 insufficient_scope` ships `ok:false` with a non-200 |
| plugin gets the host key "via manifest distribution or ENV" | the host **pushes** it via `register-host` |
| `name` needs ≥1 locale; `homepage` is a URL; `version` is semver | none enforced |
| persisted as `manifest.yaml` | deprecated — `manifest.<id>.yaml` (§9.5) |
| plugin MUST check `body.tenant_id` vs `claims.tenant_id` | **still true and still your job** — §10 |

**Still trustworthy in the doc:** the overall activation narrative, the snake_case wire convention, the bare-tool-name rule, the incoming-scope floor/union semantics, and the request/response field *shapes* for `execute-tool` / `render-ui` / `invoke-hook`.

---

## 12. Python notes

- **Verify:** `cryptography`'s `Ed25519PublicKey.verify(sig, signing_input)`, or PyJWT with `algorithms=["EdDSA"]`. Load the key with `serialization.load_pem_public_key`. Signature is 64 raw bytes, base64url **without** padding.
- **Disable any default `exp` requirement** (§4.1).
- **Do not** use `uuid.UUID()` for the handshake UUID check (§6).
- `ensure_ascii=False` + `sort_keys=True` + `separators=(",",":")` for `manifest_hash` (§7).
- Store the PEM **trimmed** and compare trimmed (§2).
- Echo `X-Request-Id` (§8).

### Conformance checklist

- [ ] `register-host` dual-reads `public_key_pem` **and** `public_key`
- [ ] idempotent: same trimmed PEM preserves status; rotation resets it
- [ ] overlay semantics for `relay_url`/`expected_issuer`/`expected_audience`
- [ ] trust policy decided and reachable (§3) — not an accidental `pending` brick
- [ ] `alg == "EdDSA"` byte-exact, checked before verification
- [ ] key resolved from the `host_id` claim, `kid` ignored-not-rejected
- [ ] mandatory claims: `iss`,`sub`,`jti`,`host_id`,`tenant_id` + `scopes` is an array
- [ ] `exp` optional; no clock tolerance; **no** replay cache
- [ ] per-host `iss`/`aud` persisted and enforced
- [ ] `host_record_status` on every 2xx of `register-host` **and** `handshake`
- [ ] `reregister_recommended` never true for a field the host can't supply
- [ ] handshake: strict UUIDs, `bridge_token` in body tolerated-not-trusted, `plugin_id_mismatch` → 400
- [ ] handshake response: all six fields, `capabilities_acknowledged` all three
- [ ] `/health` authenticated; `manifest_hash` either omitted **or** `/manifest` implemented
- [ ] auth failures 401 + `{error:{code,message}}`; handler failures 200 + `{ok:false,…}`
- [ ] **tenant check implemented** (§10)
- [ ] manifest: snake_case, `manifest.<id>.yaml`, `127.0.0.1`, no `requires: {}`
