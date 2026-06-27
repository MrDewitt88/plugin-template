# RFC: `requires.scopes` — Outgoing-Grant ⟂ Incoming-Floor

> **Status:** PROPOSED (2026-06-27). Foundation-side implemented (manifest schema, unpublished). Awaiting: oracle naming-ruling + host minting-ack. Origin: wiz-mind #5374, plug-tmpl draft #5379.
> **Owner:** plug-tmpl (manifest contract). **Affected:** hosts (agent/v8-corp/v8-fam token-minting), oracle (naming).

## Problem

`manifest.provides.scopes_required` is **double-purposed** — two distinct, divergent concepts share one field:

1. **Incoming-Floor** — used by `enforceScopes` (bridge-foundation v0.8.0, `checkToolScopes`): every _caller_ invoking this plugin's tools must hold all of these scopes.
2. **Outgoing-Grant** — used at activation (`HOST-INTEGRATION-GUIDE §2.3`): the host mints `token.scopes = manifest.provides.scopes_required` into the plugin's bridge-token, i.e. the scopes the plugin's token carries to make **reverse-calls** back to host tools / other plugins (e.g. `family.audit.write`, `mcp.read.unifieddb`).

These diverge the moment a plugin needs outgoing scopes that incoming callers should **not** be required to have. Concrete case (wiz-mind): it wants the incoming floor `[]` (granular per-tool enforcement) but needs `family.audit.write` for its reverse-calls. Putting `family.audit.write` in `provides.scopes_required` would force every incoming caller to hold it — wrong.

Currently latent (enforceScopes is opt-in/default-off), but a hard incompatibility before any `enforceScopes` default-on flip.

## Proposal

Split the two into separate manifest fields:

```jsonc
// manifest.provides — INCOMING-Floor (semantics UNCHANGED)
provides: {
  ...,
  scopes_required: string[]   // caller-must-have, for enforceScopes
}

// manifest.requires — NEW: OUTGOING-Grant
requires: {
  scopes: string[]            // scopes the host mints into the plugin token (reverse-calls)
}
```

- `provides.scopes_required` stays = **incoming floor only**. `checkToolScopes` already reads only this → **zero change to enforceScopes**.
- `requires.scopes` = what the host mints into the plugin's token.

## Migration (backward-compatible — no break for anyone)

- **Host minting changes** from `manifest.provides.scopes_required` to:
  ```ts
  token.scopes = manifest.requires?.scopes ?? manifest.provides.scopes_required
  ```
  A one-line fallback. Old manifests (no `requires` block) mint **exactly as today**; new manifests separate the two.
- **Schema:** `requires` is **optional without a default** (deliberately not `{scopes:[]}`) so the `?? provides.scopes_required` fallback resolves correctly. When present, `requires.scopes` defaults to `[]`.
- **Per-plugin migration path:** reduce `provides.scopes_required` to the genuine incoming floor (often `[]`), move reverse-call scopes into `requires.scopes`.
- **enforceScopes stays opt-in/default-off** until this split is cluster-wide.

## Ownership / who changes what

| Repo                                 | Change                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **plug-tmpl**                        | Manifest schema `requires.scopes` (done, unpublished) + validation + `HOST-INTEGRATION-GUIDE §2.3` minting-source + Cookbook example. |
| **Hosts (agent / v8-corp / v8-fam)** | Activation token-minting source: `provides.scopes_required` → `requires?.scopes ?? provides.scopes_required`.                         |
| **oracle**                           | Naming ruling (see below).                                                                                                            |
| **Consumers (wiz-mind, plug-db, …)** | Declare reverse-call scopes in `requires.scopes` once hosts switch.                                                                   |

## Open: naming (oracle ruling)

- **`requires.scopes`** (plug-tmpl preference) — symmetry: `provides` (what the plugin offers + the incoming floor) ↔ `requires` (what it needs to call out). Mirrors npm `dependencies`/`peerDependencies` intuition.
- `consumes_scopes` — flat, parallels `scopes_required`.
- `grant.scopes` — names the host action (what the host grants).

plug-tmpl implements `requires.scopes` provisionally; renaming pre-publish is trivial. **No npm release until the name is ruled.**

## Example (wiz-mind)

```jsonc
{
  "id": "wiz-mind",
  // … name/version/distribution/compatibility …
  "provides": {
    "mcp_tools": [
      /* each tool declares its own per-tool scopes_required */
    ],
    "scopes_required": [], // INCOMING-Floor: granular per-tool, no plugin-wide floor
  },
  "requires": {
    "scopes": [
      // OUTGOING-Grant: minted into the plugin token
      "family.policy.read",
      "family.audit.write", // FamilyMind reverse-calls
      "mcp.read.unifieddb",
      "mcp.write.unifieddb", // plug-db reverse-calls
    ],
  },
}
```

Result: a caller invoking wiz-mind's tools is gated only by each tool's own
`scopes_required` (floor `[]`), while wiz-mind's _token_ carries
`family.audit.write` etc. for its reverse-calls — the two no longer collide.

Before this RFC, `family.audit.write` would have had to sit in
`provides.scopes_required`, forcing every incoming caller to hold it.

## Non-goals

- Not changing `enforceScopes` semantics or default (stays opt-in).
- Not introducing scope-mediation between plugins (that's the host's reverse-call gate).
