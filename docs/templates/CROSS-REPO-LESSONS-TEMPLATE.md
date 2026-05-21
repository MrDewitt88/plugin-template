# {Plugin-Name} — Cross-Repo Lessons

> **TEMPLATE.** Plugin-Provider sammelt eigene Drift-Catalog hier — analog V8s `CROSS-REPO-LESSONS.md`. Numbering-Convention: V8-CC owns canonical-numbering Cross-Repo. Plugin-spezifische Drifts beginnen ab `#100` um Kollisionen mit V8/Theseus/MarkView-Cross-Repo-Numbering zu vermeiden. Bei wider-impacting Cross-Repo-Drift: V8-CC anfunken via shared.md/Kanban + neue canonical-Number requesten.

---

## 1. Numbering-Range-Reservation

| Range | Owner |
|---|---|
| `#1-#99` | V8-CC canonical Cross-Repo (alle Repos) |
| `#100-#199` | {Plugin-Name} plugin-internal |

Wenn ein {Plugin-Name}-internal-Drift Cross-Repo-impact bekommt (z.B. neuer Pattern den V8/Theseus auch brauchen): bei nächstem Sync zu V8-numbered umnummerieren + supersede-note im plugin-internal-entry.

---

## 2. Plugin-Internal Drift-Catalog (#100+)

Format pro Eintrag:
- **Title** — kurz
- **Discovered-During** — Pre-Smoke / Cross-Repo-Live-Smoke / Browser-Live-Test / Production
- **Symptom** — was Tester sah
- **Root-Cause** — technisch
- **Resolution** — Code-Fix
- **Process-Lesson** — was Plugin-Team daraus lernt

### #100 {Title-Beispiel: erste plugin-internal Drift}

- **Discovered-During:** {phase}
- **Symptom:** {what user/tester saw}
- **Root-Cause:** {technical}
- **Resolution:** {code-fix}
- **Process-Lesson:** {what we learned}

### #101 {next}

...

---

## 3. Cross-Repo-Adopted Lessons

V8s 24 catalogued Drifts (#1-#24, see V8 [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md)) — Plugin-Provider adoptet die als Pre-Drift-Checklists.

**Plugin-relevante Drifts aus V8s Catalog:**

| # | Title | Plugin-Side-Mitigation |
|---|---|---|
| #3 | Wire-Format snake_case | All Plugin-Wire snake_case enforced |
| #4 | Wire-Schema vs Storage-Record Drift | Wire-Schemas validieren vs ECHTE-impl |
| #6 | Hook-Producer Wire-Schema | Accept `<module>s_id` plural / `source_id` / `id` mit fallback-chain |
| #7 | Svelte 5 customElement attribute lowercase | Long-form mit explicit `attribute:` mapping |
| #8 | CORS preflight handler | hono/cors middleware in plugin-bridge |
| #11 | Production-installer | dev-mode pnpm dev als proven-path |
| #13 | Browser-Bundle CommonJS-Require | esbuild stub-plugin für node-builtins |
| #14 | render-ui context default | Send explicit `{}` für Schema-default-quirk |
| #16 | CSP Plugin-Origin-Allowlist | (host-side concern, no plugin action) |
| #20+#21 | Bare-specifier dynamic-imports | esbuild external=[] + splitting=true |
| #22 | WASM-instantiate Blocked | (host-side `'wasm-unsafe-eval'`, no plugin action) |
| #24 | img-src Restrictive | (host-side `img-src http: https: blob:`) |

---

## 4. Process-Lessons (Plugin-Specific)

### {Lesson 1: kurz title}

**Lesson:** {what to do / what to avoid}

**Drift-Source:** {drift-numbers, e.g. #100 + #101}

**Pattern für Future-PRs:**
- {step}
- {step}

---

## 5. Pre-Drift-Checklists

### Vor neuem MCP-Tool

- [ ] Tool-Name snake_case + dot-namespace (siehe `@nexus-mindgarden/plugin-mcp-foundation/tools/naming`)
- [ ] input_schema definiert (Phase-3 Extended Form)
- [ ] scopes_required minimaler-Set (least-privilege)
- [ ] Wire-snake_case enforced
- [ ] Pre-Smoke + Cross-Repo-Live-Smoke geplant

### Vor neuer UI-Component

- [ ] customElement long-form mit explicit `attribute:` mapping (Drift #7)
- [ ] Standard 8 bridge-attrs via `bridgeAttrPropsMapping()` (Drift #7)
- [ ] Theme-Tokens via `buildThemeCss(prefix)` (Drift #18 superseded → theme-attribute)
- [ ] esbuild-bundle: `external: []` + `splitting: true` (Drift #20+#21)
- [ ] Node-builtins gestubt via `nodeBuiltinsStubPlugin` (Drift #13)
- [ ] Bundle-size-budget definiert + monitored

### Vor Production-Deployment

- [ ] Plugin-Bridge-Auth-Multi-Host-Registry funktional (Drift #12 idempotency)
- [ ] CSP-Allowlist in deployment docs für Host-Adoption
- [ ] manifest_hash-Field in /health implementiert (Live-Re-Registration support)
- [ ] Cross-Repo-Live-Smoke gegen Production-Build vor 1st-release

---

## 6. References

- V8 [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md) — canonical Cross-Repo Drift-Catalog #1-#24
- `@nexus-mindgarden/plugin-bridge-foundation` — bridge with Drift #6/#8/#12/#14 baked-in
- `@nexus-mindgarden/plugin-svelte-foundation` — UI with Drift #7/#13/#20+#21 baked-in
- `@nexus-mindgarden/plugin-storage-foundation` — Storage with Drift #11/#13/#20 ABI-mismatch detection
- `@nexus-mindgarden/plugin-mcp-foundation` — Tool-Registry with Phase-3 Extended Form support
