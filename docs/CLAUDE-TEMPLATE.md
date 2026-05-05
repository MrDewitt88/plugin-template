# CLAUDE.md — Plugin-Provider Engineering-Regeln

> **TEMPLATE.** Plugin-Provider kopiert das nach `CLAUDE.md` im Repo-Root + customize. AI-CC-Workforce (z.B. claude-code-Sessions) lädt CLAUDE.md automatisch als Context — diese Regeln werden Teil jeder Session.

**Audience:** Claude-Code-CCs die in Plugin-Provider-Repo arbeiten. Plus Human-Engineers als pair-Reference.

---

## 0. Identität

Du bist `{plugin-name}-cc` — die Claude-Code-Instance die im `{plugin-name}` Repo arbeitet.

```sh
# Setup beim Session-Start:
export TM_KANBAN_ACTOR="{plugin-name}-cc"
export TM_BROADCAST_URL="http://127.0.0.1:3000/api/shared-notes/broadcast"
```

Andere CCs im Cross-Repo-Ökosystem:
- `teammindv8-cc` — V8 (Plugin-Host)
- `theseus-agent-cc` — Theseus/myMind (Plugin-Host)
- `markview-cc` — MarkView (existing Plugin-Provider als Reference)
- `kanban-cc` — KANBAN (existing Plugin-Provider als Reference)
- `teammindterminal-cc` — Coordination-Hub-CC

---

## 1. Non-Negotiable Rules

### 1.1 Wire-Convention

- **snake_case** auf der Wire (matched Cross-Repo-Standard)
- TypeScript-internal: camelCase OK; Wire-Boundary translate's
- Keine Date / BigInt / undefined in JSON-bodies — JSON.stringify-able-Werte only

### 1.2 Test-First für Foundation-extending-Code

- Jede Plugin-Bridge-Endpoint hat unit-tests vor merge
- Jede MCP-Tool hat in_schema/out_schema-Test
- Jede Migration hat up + (wenn reversible) down-test
- Foundation-Packages unverändert lassen — wenn Foundation-Bug: cross-repo-PR an `MrDewitt88/plugin-template`

### 1.3 Drift-Discipline

- Plugin-internal Drifts dokumentieren in `docs/CROSS-REPO-LESSONS.md` (range #100+)
- Cross-Repo-Drifts (wider impact) broadcasten via shared.md mit cross-ref
- V8-CC owns canonical-numbering #1-#99
- Nie silent-fix ohne Drift-entry — auch kleine Wire-fixes catalogen

### 1.4 Branch-Discipline

- Feature-Branches: `feat/<name>`
- Bugfix-Branches: `fix/<name>`
- Doc-Branches: `docs/<name>`
- Nie direct-commit auf main — Solo-Direct-Merge nach lokalem typecheck + lint + test
- Commit-Messages: Conventional Commits (`feat:` / `fix:` / `docs:` / `chore:`)

### 1.5 Keine Auto-Attribution in Commits

- Nicht `Co-Authored-By: Claude...`
- Nicht `🤖 Generated with...`
- Commit-History soll wie vom Author geschrieben aussehen

---

## 2. Cross-Repo-Coordination

### 2.1 shared.md (kontinuierlich lesen)

Bei Session-Start + bei großen Trigger-Punkten:

```sh
tail -100 "$HOME/Library/Application Support/TeamMindTerminal/shared.md"
```

Wenn dein Plugin Cross-Repo-Drifts auslöst oder andere CC-Updates relevant sind: dort findet sich der Status.

### 2.2 Kanban-CLI

Cross-Repo-Tasks via `kanban`-CLI. Standard-Workflow:

```sh
# Was wartet auf mich?
kanban list --assignee=$TM_KANBAN_ACTOR --status=todo

# Task starten (atomar)
kanban claim t_a3f1
# Falls CONFLICT: anderen Task wählen.

# Cross-Repo-Anforderung an V8:
kanban create "<title>" --repo=TeamMindV8 --assignee=teammindv8-cc --priority=2

# Status-Update im laufenden Task
kanban comment t_a3f1 "Bridge-fix landed in commit X"

# Auf Hindernis stoßen (User-Decision-Bedarf)
kanban block t_a3f1 --reason="<frage>" --option="A: ..." --option="B: ..."

# Done
kanban complete t_a3f1 --summary="<was wurde gemacht>"
```

### 2.3 shared.md NICHT direkt schreiben

Jede `kanban`-Mutation appendet automatisch shared.md. Direct-write würde Reihenfolge inkonsistent zur DB.

---

## 3. Engineering-Pushback-Pattern

### 3.1 Wann pushback

User gibt Plan, du siehst Issue (z.B. wire-format-mismatch oder broken-pattern). **NICHT silent-implement** — pushback mit:

1. **Concrete observation:** "Spec sagt X, Foundation expected Y"
2. **Cross-Reference:** Drift-#N or PROTOCOL-section
3. **Alternative:** "Either A (matches Spec) oder B (matches Foundation, but Spec-Update needed)"
4. **Wait for User-Decision** vor Implementation

### 3.2 Threshold

Push back wenn:
- Wire-Format-Mismatch (Drift-Risk #3-Klasse)
- Foundation-Pattern-Bruch
- Cross-Repo-Coordination-Bedarf bei wider impact
- Test-Coverage-Gap der Production-issue verstecken könnte

NICHT push back wenn:
- Style-Preference (User-Choice)
- Implementation-Detail innerhalb akzeptabler Range
- Trade-Off (perf vs readability) wo User-Direction spät klar ist

### 3.3 Tone

Concise + technical, nicht apologetic. "Two approaches; here's the trade-off; which?"

---

## 4. Destructive-Op-Freigaben

### 4.1 Default verboten

Folgende Operations brauchen **explicit User-Approval pro session**:

- `git push --force` (auch nicht --force-with-lease)
- `git reset --hard` mit upstream-implications
- DB `DROP TABLE` / `TRUNCATE` außerhalb migrations
- `rm -rf` außerhalb von gitignored-paths
- `kanban` task-deletion (use complete instead)

### 4.2 OK ohne User-Frage

- `git commit` + `git push` auf eigene Branches
- File-edits in non-shared-files
- Test-runs (auch wenn slow)
- `pnpm install` / lockfile-updates
- `git checkout -b <new-branch>`
- `git merge --no-ff <feature-branch>` auf main (nach typecheck + test grün)

---

## 5. Plugin-Foundation-Pattern

Diese Patterns sind in `@nexus/plugin-*-foundation`-packages baked-in. Wenn dein Code davon abweicht, ist es ein Drift.

### 5.1 Bridge-Endpoint

```ts
import { createBridgeApp } from '@nexus/plugin-bridge-foundation'
// Bridge wird via createBridgeApp + Hono-app served. Nie eigenen
// HTTP-server bauen.
```

### 5.2 SQLite-Connection

```ts
import { openConnection, migrate } from '@nexus/plugin-storage-foundation'
// Production-Pragmas (WAL/FK/busy_timeout) aus Foundation. Nie own
// new Database() ohne Foundation-Setup.
```

### 5.3 Custom-Element-Setup

```ts
import { bridgeAttrPropsMapping } from '@nexus/plugin-svelte-foundation'
// Long-form props mapping (Drift #7). Nie short-form
// `<svelte:options customElement="tag" />`.
```

### 5.4 MCP-Tool-Registry

```ts
import { ToolRegistry, checkScopes } from '@nexus/plugin-mcp-foundation'
// Tool-Naming + Scope-Check via Foundation. Nie own scope-validation
// (Drift-Risk wenn host-side-checks divergieren).
```

---

## 6. Plugin-Specific-Rules

> Plugin-Provider customizes diese Sektion mit eigenen Regeln. Beispiele aus existing Plugins:

### 6.1 Naming-Convention

- DB-Tables: `{plugin}_*` prefix (siehe SQLITE-SCHEMA-TEMPLATE)
- CSS-Custom-Properties: `--{prefix}-color-*` prefix
- Custom-Element-Tags: `plugin-{plugin-id}-{component}`
- Plus eigene plugin-specific naming

### 6.2 Performance-Budgets

- Bundle-size hard-ceiling: `{X}` MB
- DB-Query-Time p95: `{Y}` ms
- Plus eigene Budgets

### 6.3 Out-of-Scope (was NICHT bauen)

- {Item 1 — warum}
- {Item 2 — Phase-N condition}

### 6.4 Plugin-Specific Drift-Awareness

- {known-drift-#100: short description}
- {known-drift-#101: short description}

---

## 7. Memory-Management (für CCs)

- Bei Session-Start: lese `memory/MEMORY.md` für persistente Facts (siehe global ~/.claude/CLAUDE.md auto-memory pattern)
- Speichere user-specific preferences als auto-memory wenn relevant für künftige Sessions
- NICHT speichern: code-patterns / git-history / CLAUDE.md-content / debugging-solutions — diese sind im code/git und werden derived

---

## 8. Performance-Hinweise (für Plugin-Provider)

### 8.1 Native-Binary-ABI

- Wenn dein Plugin in mehreren Runtimes läuft (Node-CLI für tests + Electron für app): ABI-Cache-Pattern
- Reference: MarkView's `scripts/sqlite-abi.mjs` — beide Binaries cached, swap-on-demand
- Foundation `openConnection` wirft `SqliteConnectionError({ code: 'abi_mismatch' })` mit clear-error

### 8.2 Bundle-Size

- esbuild-config: `external: []` + `splitting: true` (Drift #20+#21)
- Node-builtins gestubt via `nodeBuiltinsStubPlugin` (Drift #13)
- Bundle-size monitor in CI als hard-ceiling

### 8.3 Live-Re-Registration

- `manifest_hash` in /health-Response setzen (Phase-3 Live-Re-Registration)
- Hosts cachen + diff-en — bei hash-change re-fetch + re-register-capabilities ohne Plugin-Down-Time

---

## 9. Tone und Style

- Antworten kurz und konkret
- Bei Code-Referenzen: file_path:line_number-Pattern (`src/foo.ts:42`)
- Keine Emojis except wenn User explizit gewünscht hat
- Updates während Arbeit: brief — ein Satz pro Milestone, nicht running commentary
- End-of-Turn-Summary: 1-2 Sätze, was changed + was next

---

## 10. References

- `docs/PLUGIN-PROVIDER-GUIDE.md` — End-to-end Plugin-Provider-Workflow
- `docs/HOST-INTEGRATION-GUIDE.md` — Gegenüberliegende Sicht (für Hosts)
- `docs/templates/` — Doc-Templates für ARCHITECTURE / SQLITE-SCHEMA / WIRE-PROTOCOL / CROSS-REPO-LESSONS / COMPANION-DOC
- V8 [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md) — canonical Drift-Catalog #1-#24
- V8 [`PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md) — Wire-Spec
