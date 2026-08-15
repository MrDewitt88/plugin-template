# Plugin-Provider-Guide

> Für Plugin-Provider die ein neues Plugin gegen TeamMind/Nexus Plugin-Bridge-Protocol bauen. Ende-zu-Ende von clone bis cross-repo-live-smoke.

**Audience:** Engineering-Teams oder solo-Devs die Plugin-Provider werden wollen. Plus AI-CC-Workforce (siehe `CLAUDE-TEMPLATE.md`).

> 🐍 **Nicht-TypeScript-Plugin?** Dieser Guide setzt die TS-Foundation voraus. Wenn du die Bridge in einer anderen Sprache nachbaust (Python/MLX, Rust, Go, Swift), ist **`PLUGIN-BRIDGE-WIRE-SPEC.md`** dein Dokument — sprachneutral, gegen die Referenz-Implementierung verifiziert, mit Conformance-Checkliste.

---

## 1. Voraussetzungen

- Node.js 20+ + pnpm 10+ (siehe `package.json` engines)
- Git + GitHub-Account
- Optional: TypeScript 5.6+ kennen (Foundation ist strict-TS)

---

## 2. Quick-Start (manueller Setup)

> L7 `@nexus-mindgarden/create-plugin` CLI macht das Bootstrap automatic. Bis das landed: manueller Pfad.

```sh
# 1. Clone Plugin-Template
git clone https://github.com/MrDewitt88/plugin-template.git my-plugin
cd my-plugin
rm -rf .git
git init -b main

# 2. Customize root package.json
# - name: "my-plugin"
# - description, license, repository

# 3. Install dependencies
pnpm install

# 4. Workspace-wide Tests grün?
pnpm -r test

# 5. Erstelle dein erstes Package
mkdir -p packages/my-plugin-bridge/src
# (siehe Layer-3-Walkthrough unten)
```

---

## 3. Component-Stack-Decision

**Welche Foundation-Packages brauche ich?**

| Foundation | Brauche ich es wenn... |
|---|---|
| `@nexus-mindgarden/plugin-bridge-foundation` | **Pflicht** — Plugin hat HTTP-Endpoint für Host-Communication |
| `@nexus-mindgarden/plugin-storage-foundation` | Plugin persistiert Daten (SQLite-backed) |
| `@nexus-mindgarden/plugin-svelte-foundation` | Plugin hat UI-Components die in Hosts gemounted werden |
| `@nexus-mindgarden/plugin-mcp-foundation` | Plugin exposiert MCP-Tools (fast jeder Plugin) |

**Zero-UI-Plugin** (z.B. nur Hooks für `notes.versioning.on_save`): bridge + mcp reicht.

**Full-Featured-Plugin** (z.B. KANBAN): alle vier.

---

## 4. Plugin-Manifest-Authoring

Manifest ist Wire-Vertrag — Hosts laden + validieren beim Activate.

### 4.1 Minimal-Manifest

```yaml
id: my-plugin
name:
  de: Mein Plugin
  en: My Plugin
description:
  de: Mein erstes Plugin
  en: My first plugin
version: 0.1.0
distribution:
  type: external-service
  # Drift #203 — IMMER 127.0.0.1, NIE localhost. Browser-CSP behandelt beide
  # als unterschiedliche Origins; Hosts allowlisten nur 127.0.0.1:*.
  service_endpoint: http://127.0.0.1:3600
compatibility:
  apps: [teammind, theseus]
  min_app_version: 0.5.0
provides:
  routes: []
  mcp_tools: []
  module_extensions: []
  scopes_required: []
```

### 4.2 Mit MCP-Tools (Extended Form)

```yaml
provides:
  mcp_tools:
    # Drift #200 — Tool-Namen sind im Manifest IMMER bare `<module>.<verb>`.
    # NIEMALS `<plugin-id>.<module>.<verb>` (kein `my-plugin.documents.list`).
    # Der Host synthesiziert den `<plugin-id>.`-Prefix automatisch beim
    # Registrieren ins Kiara-MCP-Surface. Manuelles Prefixing erzeugt
    # Doppel-Prefix (`my-plugin.my-plugin.documents.list`) — bricht Tool-Lookup.

    # Phase-1 string-form (backward-compat):
    - documents.list

    # Phase-3 Extended Form — empfohlen für neue Tools:
    - name: documents.create
      description: |
        Create a new document with title and content. Returns the
        created document with its UUID.
      input_schema:
        type: object
        required: [title]
        properties:
          title: { type: string, minLength: 1 }
          content: { type: string }
      output_schema:
        type: object
        required: [id, title]
        properties:
          id: { type: string, format: uuid }
          title: { type: string }
      scopes_required: [mcp.write.documents]
  scopes_required:
    - mcp.read.documents     # plugin-wide floor
```

### 4.3 Mit Module-Extensions (Plugin = Storage-Provider)

```yaml
provides:
  module_extensions:
    - module: notes
      capability: versioning
      hook_endpoints:
        on_save: /hooks/notes/on-save
    - module: memory
      capability: versioning
      hook_endpoints:
        on_save: /hooks/memory/on-save
```

Host (V8/Theseus) fired `notes.versioning.on_save` an dein Plugin wenn User notes saved.

### 4.4 Mit UI

```yaml
provides:
  routes:
    - path: /my-view
      component_type: web-component
      service_endpoint: /ui/my-component
ui:
  sidebar_entry:
    icon: fileText
    label_key: plugin_my_plugin_sidebar
    sort_order: 100
```

`label_key` ist Phase-1 unused — Hosts nutzen `manifest.name` für display. Phase-2 könnten Hosts den key gegen ihre i18n-resolution lookupen.

### 4.5 host_record_status — Drift #206 Schema-Drift-Signaling

Plugin-Bridge-Protocol erweitert `register-host`-Body additiv (z.B. neue optional fields wie `host_version`, `relay_url`, `host_metadata`). Hosts die pre-Field-Addition registriert haben bleiben sonst dauerhaft stale.

**Lösung:** Plugin-Bridge returnt einen symmetric `host_record_status`-Block — in `register-host`-Response UND in `handshake`-Response, IMMER present (auch first-register, auch wenn Record current ist).

```json
{
  "host_id": "teammind",
  "status": "active",
  "fingerprint": "...",
  "registered_at": "...",
  "host_record_status": {
    "schema_version": 1,
    "plugin_current_schema": 1,
    "is_first_register": true,
    "reregister_recommended": false,
    "missing_optional_fields": []
  }
}
```

**Host-Logic:**
- Wenn `reregister_recommended=true` → Host ruft `register-host` erneut auf mit den fehlenden Feldern (idempotent durch Drift #12).
- Wenn `missing_optional_fields` leer und `schema_version` matched → Host ist current.
- `is_first_register` lässt Host wissen ob das die Bootstrap-Registrierung war (vs idempotenter Replay).

**Foundation-Default:** `@nexus-mindgarden/plugin-bridge-foundation` v0.1.0+ baked das automatisch ein. Baseline-Optional-Fields = `['host_version']`. Plugin-Provider erweitern via:

```ts
const registry = new HostKeyRegistry(repo, {
  optionalRegisterFields: ['host_version', 'relay_url', 'host_metadata'],
})
```

**Cross-Repo-Source:** Pattern etabliert von plug-elec (`etmind-bridge`), adoptiert von oracle/plug-ea (`eamind-bridge`) + V8 + Theseus. Foundation v0.1.0 baked das Standard-Pattern für alle künftigen Plugin-Provider.

### 4.6 Scopes-Cookbook — Incoming-Floor (`provides.scopes_required`) ⟂ Outgoing-Grant (`requires.scopes`)

> **Ab Foundation v0.11.0** (RFC `requires.scopes`, oracle-Ruling #5418). Manifest-Schema-Feld; **optional** → alte Manifeste unverändert gültig.

> ⚠️ **Pilot-Realität vs. Zielzustand (agent-Ruling #5971, 2026-07-10).** Der Split ist als **Foundation-Contract ratifiziert**, aber der kanonische Host (Theseus `plugin-system/src/schema.ts`) **mintet ihn noch nicht** — er liest heute nur `provides.scopes_required` in den Bridge-JWT `scopes` (das zeigt auch der Aktivierungs-Dialog).
> **→ Für den aktuellen Pilot:** deklariere **alle** Scopes — auch Host-Call-/Reverse-Call-Scopes wie `mcp.agent.complete` — in **`provides.scopes_required`**. Das ist, was der Host heute mintet.
> **→ `requires.scopes`** ist der **Zielzustand (Schema-v2, Thread `plugin-rollout`)**, den Hosts später minten. Es jetzt schon optional zu deklarieren schadet nicht (additiv), aber **verlasse dich noch nicht darauf, dass der Host es mintet.** Migriere `provides.scopes_required` → `requires.scopes` erst, wenn dein Host die Seed-Umstellung angekündigt hat.

`scopes_required` und `requires.scopes` sind **zwei verschiedene Achsen** — verwechsle sie nicht:

| Feld | Achse | Wer liest's | Frage |
| --- | --- | --- | --- |
| `provides.scopes_required` (plugin-wide) | **Incoming-Floor** | `enforceScopes`/`checkToolScopes` (v0.8.0) | Was muss ein **Caller deiner** Tools mitbringen? |
| `provides.mcp_tools[].scopes_required` (per-Tool) | **Incoming-Floor** (granular) | `enforceScopes` **+** Host-Mint | Was braucht **dieses eine** Tool? |
| `requires.scopes` (plugin-wide) | **Outgoing-Grant** | Host-Token-Minting | Welche Scopes mintet der Host in **dein** Token für **Reverse-Calls**? |

**Wann brauchst du `requires.scopes`?** Sobald dein Plugin **zurück** in Host-Tools oder andere Plugins ruft (Reverse-Call) und dafür Scopes braucht, die ein **eingehender** Caller NICHT haben soll. Klassiker (wiz-mind): incoming floor `[]` (granulare Per-Tool-Enforcement), aber das Plugin-Token braucht `family.audit.write` für FamilyMind-Reverse-Calls. Käme das in `provides.scopes_required`, müsste **jeder eingehende Caller** es halten — falsch.

```jsonc
// manifest.yaml (wiz-mind-Beispiel)
{
  "id": "wiz-mind",
  "provides": {
    "mcp_tools": [
      { "name": "session.start", "scopes_required": ["mcp.write.wiz"] } // per-Tool-Floor
    ],
    "scopes_required": []          // INCOMING-Floor plugin-wide: leer → granular per Tool
  },
  "requires": {
    "scopes": [                    // OUTGOING-Grant: in DEIN Token gemintet
      "family.policy.read",
      "family.audit.write",        // FamilyMind reverse-calls
      "mcp.read.unifieddb"         // plug-db reverse-calls
    ]
  }
}
```

**Was der Host daraus mintet** (`HOST-INTEGRATION-GUIDE §2.3`, verbindlich):

```
token.scopes = (requires.scopes ?? provides.scopes_required)   // plugin-wide Seed
                 ∪ ⋃ provides.mcp_tools[].scopes_required       // per-Tool-Union (BLEIBT)
```

⚠️ Der **Per-Tool-Union bleibt im Mint** — er wandert NICHT nach `requires`. Ein Token ohne den granularen Write-Scope eines Tools → das Tool 403't still (Kanban-Drift 2026-05-11). Nur der **plugin-wide Seed** splittet zwischen Incoming-Floor und Outgoing-Grant.

**Migrationspfad (per Plugin):** reduziere `provides.scopes_required` auf den echten eingehenden Floor (oft `[]`), verschiebe Reverse-Call-Scopes nach `requires.scopes`. `enforceScopes` bleibt opt-in/default-off, bis der Split cluster-weit steht — kein Zwang, kein Bruch. Volle Begründung: `docs/RFC-REQUIRES-SCOPES.md`.

#### 4.6.1 🔑 Die Host-Scopes — gemeinsames Vokabular für Rückrufe

**Bis hierher beschrieben Scopes fast immer, was ein Aufrufer braucht, um in *dein* Plugin zu kommen** (`family.policy.read`, `mcp.read.unifieddb`). Für die Gegenrichtung — *was darfst du beim Nutzer anfassen* — gab es **keine Vokabel**. agent ist beim Bau des Rückruf-Gates genau daran stehengeblieben: das Gate arbeitet auf Werkzeug-Präfixen, `requires.scopes` trägt Scope-Zeichenketten, und dazwischen fehlte die Übersetzung.

Sechs Namen, abgezählt an den tatsächlich registrierten Werkzeugen. Kein Schema, keine Hierarchie, **keine Wildcards.**

| Scope | Was der Nutzer liest |
|---|---|
| `host.contacts.manage` | lesen, ändern und **löschen** |
| `host.calendar.manage` | lesen, Termine anlegen, ändern und **löschen** |
| `host.notes.write` | lesen, schreiben und ergänzen |
| `host.projects.write` | lesen, anlegen und ändern |
| `host.attachments.write` | Anhänge hochladen |
| `host.image.generate` | Bilder erzeugen und bearbeiten |

Das `host.`-Präfix ist die Richtungsanzeige: **`family.policy.read` kommt herein, `host.contacts.manage` geht hinaus.**

> 🚨 **Warum `manage` und nicht `read` — der Fehler war live.** Der erste Entwurf hieß `host.contacts.read`, und der ausgelieferte Zustimmungstext sagte „deine Kontakte". Die Erhebung ergab: unter `contacts.` und `calendar.` liegen **Löschwerkzeuge**. Ein Nutzer las „Kontakte" und dachte an Lesen, während das Plugin sie **löschen** konnte.
>
> **Regel: das Verb muss die weiteste Fähigkeit des Bereichs beschreiben.** Ein Name, der schmaler klingt als die Gewährung, ist eine Falschaussage im Zustimmungsdialog — dort, wo der Nutzer die einzige Entscheidung trifft, die er überhaupt trifft.
>
> **Und das gilt in beide Richtungen.** `notes.` stand zuerst ebenfalls auf `manage`, weil `notes.delete` im Repo vorkam — nachgemessen lag es nur in Eval-Konfigurationen und Test-Fixtures, nicht als registriertes Werkzeug. **Ein Name, der mehr androht als er gewährt, ist genauso falsch:** er treibt zu einer Ablehnung ohne Sachgrund und entwertet den Dialog von der anderen Seite.

**Drei Regeln, die mit den Namen zusammen gelten:**

1. **Fail closed bei neuen Bereichen.** Ein Werkzeug-Präfix **ohne** Vokabelnamen ist für ein *deklarierendes* Plugin **zu**, nicht offen. Sonst öffnet sich das Gate still, sobald ein Host Werkzeuge ergänzt — und zwar für genau die Plugins, die sich freiwillig beschränkt hatten. Schweigende Plugins behalten ihre bisherige Reichweite.
2. **Unbekannter Name bei einem anderen Host: kein Fehler, aber sichtbar.** Kanban bedient zwei Hosts, Markview drei. Deklarierst du `host.contacts.manage` und der Host hat keine Kontakte, darf das dein Plugin nicht unbrauchbar machen — es darf aber auch nicht still verschwinden. **Die Namensmenge ist gemeinsames Vokabular; welche Namen ein Host einlöst, ist Host-Sache.**

   **Verbindlicher Wortlaut** (agent, host-neutral — damit drei Hosts denselben Satz sagen):

   > **Ohne Wirkung hier:** deine Kontakte — lesen, ändern und löschen
   >
   > Das Plugin bittet um Zugriff, den es in *&lt;Anwendung&gt;* nicht gibt. Die Bitte bleibt folgenlos — du musst nichts tun.

   Die drei Entscheidungen darin sind kein Stil: **„Ohne Wirkung hier" steht zuerst**, sonst liest der Nutzer erst „darf deine Kontakte löschen" und erschrickt, bevor die Entwarnung kommt — die Reihenfolge ist die halbe Botschaft. **„du musst nichts tun" gehört hin**, weil ein Dialog, der einen Zustand meldet und offenlässt, ob er eine Handlung verlangt, genau das Wegklicken erzeugt, das wir vermeiden wollen. Und der **Bereichstext ist derselbe wie in der normalen Liste**, nicht der Scope-Name — niemand soll zwei Vokabulare lernen, nur weil ein Name hier nicht eingelöst wird.

   Was der Satz **nicht** sagt, mit Absicht: er behauptet nicht, das Plugin sei für andere Anwendungen gebaut. Das wäre plausibel und unbelegbar — es könnte auch ein Tippfehler sein.

   ⚠️ **Und ein unbekannter Name darf die Gewährung NICHT erweitern.** Deklarierst du `['host.calendar.manage']` und der Host hat keinen Kalender, bekommst du dort **nichts** — nicht „alles, weil wir es nicht deuten konnten". Das ist genau die Stelle, an der ein Host aus Bequemlichkeit einen Fallback einbaut.
3. 🚨 **Eine Erklärung zu ENTFERNEN ist die größte Erweiterung, die es gibt.** Von `{scopes: ['host.contacts.manage']}` (nur Kontakte) auf *kein `requires`* (alles) ist der bequemste Weg, eine Selbstbeschränkung loszuwerden — und im Diff sieht es aus wie Aufräumen. Der Fingerabdruck fängt die Änderung, aber der Nutzer läse nur „hat sich geändert". Deshalb trägt sie eine **eigene Begründung**: *„nimmt seine Selbstbeschränkung zurück"*.

> 🩺 **Der Nutzer bekommt die Tatsache, der Autor die Ursache** (agent). Der Satz oben ist für den Nutzer richtig und für den **Autor verheerend**: `host.contact.manage` statt `host.contacts.manage` ist am Host **kein Fehler** — der Host sagt völlig korrekt „gibt es hier nicht". Das Plugin verliert damit **still seinen Zugriff, an jedem Host**, und niemand sagt es dem Autor. Er sieht einen Satz, der nach Host-Eigenheit aussieht, und hat einen Tippfehler.
>
> **Deshalb liegt die Diagnose in der Prüfung, nicht an der Aktivierungsfläche.** Hinweis **E0** meldet unbekannte `host.*`-Namen samt gültiger Liste. Nur `host.*` — alles andere sind plugin-eigene Scopes fremder Dienste, über die der Runner nichts weiß und deshalb nichts behaupten darf.

> 🧪 **Für alle, die selbst eine solche Tabelle pflegen — der Test muss die Werkzeuge SELBST erheben, nicht deiner Liste glauben.** agents Prüfung liest die registrierten Werkzeuge aus und vergleicht in beide Richtungen; ein neu hinzugefügtes `projects.delete` macht sie künftig rot, statt still den Zustimmungstext zu entwerten.
>
> **Und sie prüft, dass sie überhaupt etwas findet.** Die `notes.`-Familie liegt host-seitig statt in einem Werkzeug-Paket — ohne diesen Zweig hätte die Erhebung „keine Werkzeuge unter `notes.`" gemeldet und damit **das Gegenteil der Wahrheit**.
>
> **Die vollständige Regel, und die zweite Hälfte ist die wichtigere:**
>
> > Eine Inventur, die bei null Fundstellen **grün** ist, misst nichts — und eine, die bei null Fundstellen **rot** ist, misst immer noch nichts, wenn sie am falschen Ort sucht.
>
> agents Test war richtig gebaut und **wurde rot**. Die erste Reaktion war trotzdem falsch: `notes.` als obsoleten Bereich aus der Liste nehmen — also den Zustimmungstext kürzen, obwohl die Werkzeuge existieren. Erst der zweite Blick zeigte, dass die Erhebung nur `packages/tools-*` durchsuchte und die host-eigene Familie gar nicht sehen **konnte**.
>
> **Ein rotes Ergebnis ist eine Frage, keine Antwort.** Die Prüfung hat richtig angeschlagen und trotzdem das Falsche nahegelegt — frag bei jedem Rot zuerst, ob der Messpunkt stimmt, bevor du das Gemessene änderst.

### 4.7 Plugin-Rollout — Manifest-Dateiname, Release-Bundle, env-first Port

> **Ab `create-plugin` v0.7.0 / `plugin-bridge-foundation` v0.12.0** (Thread `plugin-rollout`, agent-Ruling #6044). Für die automatische Nexus-Katalog-Auslieferung ohne händisches Manifest-Pasten.

**1 · Manifest-Dateiname `manifest.<id>.yaml` (CODEX-REV §13.8).** Der kanonische Discovery-Dateiname ist `manifest.<plugin-id>.yaml` — der **Suffix MUSS `manifest.id` entsprechen** (Anti-Collision-Guard im globalen `~/Documents/Theseus/Plugins/`-Ordner). Foundation macht **Dual-read**:

```ts
import { discoverManifest } from '@nexus-mindgarden/plugin-bridge-foundation'
const { manifest, deprecated } = await discoverManifest('.') // manifest.<id>.yaml bevorzugt
// deprecated=true + stderr-Warn, falls nur das bare manifest.yaml existiert
```

Der bare `manifest.yaml` bleibt für **≥2 Releases** als DEPRECATED-Fallback lesbar. `loadManifest(path)` bleibt der low-level Datei-Loader.

**2 · Release-Bundle (`pnpm bundle`).** `scripts/pack-bundle.mjs` (im Scaffold) baut ein **deterministisches** `bundle.tgz` + `bundle.meta.json`:

```jsonc
{ "id": "…", "version": "…", "min_app_version": "…",
  "sha256": "<hex>", "bytes": 561, "signature": null,   // signature reserved für v2 Ed25519
  "files": ["manifest.<id>.yaml", "dist-plugin/…", "server/…"] }
```

- Inhalt: **nur** `manifest.<id>.yaml` + `server/` (gebündeltes Server-JS) + `dist-plugin/` (Browser-Artefakte). **Kein `node_modules`, keine Runtime** — der Host liefert die signierte Bun-Runtime (G1).
- Deterministisch: sortierte USTAR-Einträge, `mtime=0`, `uid/gid=0`, gzip level 9 → **reproduzierbarer sha256** (innerhalb einer Node/zlib-Toolchain).
- **sha256 ist der v1-Integritätsanker** (der Nexus-Katalog ist der Vertrauenskanal); Ed25519-Bundle-Signatur ist v2 (`signature: null` ist additiv reserviert).
- **Zwei Katalog-Artefakte, beide hochladen** (agent-Ruling #6065): `bundle.tgz` (→ `bundle_url`) **und** `bundle.meta.json` (→ `bundle_meta_url`). Das `bundle.meta.json` ist ein **externes Sidecar** — es MUSS außerhalb des tgz liegen, weil seine `sha256`/`bytes` das tgz beschreiben (self-referential, nicht einbettbar). Der Host holt das Sidecar, prüft `id`/`version`/`sha256`/`bytes` gegen die Katalog-Spec (Abweichung = harter Reject), persistiert es **kanonisch** ins Installationsverzeichnis und liest `launch` daraus. Der Nexus-`plugin_details`-Eintrag trägt `{version, bundle_url, bundle_meta_url, sha256, bytes, min_app_version}`.

> 🌍 **DEIN BUNDLE IST ÖFFENTLICH. Prüf, was du hineinlegst.** (Nexus, #8488)
>
> Die Plugin-Bits liegen heute unter einer **unveränderlichen, öffentlichen URL**. Die Berechtigung schützt **Discovery und Aktivierung** — **nicht** eine bereits bekannte URL. Wer den `bundle_url` kennt, lädt das Bundle, ohne irgendetwas gekauft zu haben.
>
> Damit ist alles im Bundle **veröffentlicht**: eingebackene Schlüssel, API-Token, Beispieldaten mit echten Kundennamen, proprietäre Tabellen, interne Kommentare in mitgelieferten Quellen. Ein `.env`, das versehentlich im `files`-Array landet, ist kein Konfigurationsfehler mehr, sondern eine Veröffentlichung.
>
> **Private Bits bräuchten einen separaten signierten Download-Wire — den es noch nicht gibt.** Bis dahin: was nicht öffentlich sein darf, gehört nicht ins Bundle. Zur Laufzeit nachladen und im `PLUGIN_DATA_DIR` halten, nicht mitliefern.
>
> Praktische Gegenprobe vor jedem Release: `tar tzf bundle.tgz` lesen und das `files`-Array im Sidecar durchgehen, Zeile für Zeile. Der deterministische Packer macht das leicht — die Liste ist sortiert und stabil, ein neuer Eintrag fällt im Diff auf.

> 🔒 **Sicherheitsvorfall ≠ Lizenzwiderruf** (Nexus). Weiter unten steht, dass es **keinen** Laufzeit-Widerruf gibt (§4.9.3). Das gilt für **Lizenzen** — daraus folgt **nicht**, dass eine kompromittierte Version draußen bleibt. Quarantäne und Widerruf der **Bits** sind ein getrennter Weg und existieren. Wer eine verseuchte Version veröffentlicht hat, ist ihr nicht ausgeliefert; melde es und lass die Version zurückziehen.

**3 · Env-first Port.** Unter einem Host wird der Port **zugewiesen** (`PLUGIN_BRIDGE_PORT`); der Manifest-Port ist nur Standalone-Dev-Default:

```ts
import { serve } from '@hono/node-server'
import { createApp, resolvePort } from './index.js'
serve({ fetch: (await createApp()).fetch, port: resolvePort() }) // env-first; invalid → Klartext-Error
```

Ein ungültiger/kollidierender Port wirft einen **Klartext-Fehler** (kein Silent-Fail).

**4 · Launch-Contract (`bundle.launch.json`, agent-Ruling #6046).** Optional: wie der Host dein Plugin startet. Author-authored JSON im Plugin-Root; der Packer **validiert** es und bettet es als `bundle.meta.json.launch` ein. Fehlt es → Host-Konvention `entry: server/index.js`.

```jsonc
// bundle.launch.json (optional)
{
  "entry": "server/index.js",   // PFLICHT wenn vorhanden: relative .js-Datei IM Bundle (kein ../, kein absolut)
  "cwd": ".",                    // optional, bundle-relativ, default "."
  "env": { "FOO": "bar" },       // optional, statisch, KEINE Secrets
  "health_path": "/api/health"   // optional, default Foundation-Standard
}
```

Host-Semantik: Runtime ist **immer** die Host-Bun (G1) → gespawnt wird `bun --no-install <entry>` mit `cwd` im Bundle; `PLUGIN_BRIDGE_PORT` wird immer gesetzt (env-first). Der Packer **rejected beim Packen**: fehlendes/nicht-`.js`-`entry`, `entry` nicht im Bundle, `../`/absolute Pfade, unbekannte Keys — der Host startet nie beliebige Binaries.

⚠️ **`entry` muss self-contained sein** (esbuild-single-file, keine externen deps). Weil der Host `bun --no-install` fährt, crasht ein `entry` mit bare npm-import zur Laufzeit (`exited before becoming healthy`). Nur `node:`/`bun:`-Builtins + relative/absolute Imports (die im Bundle liegen) sind ok. Der Packer **warnt** beim Packen, wenn er bare imports im `entry` findet.

> 🐛 **bun:sqlite Named-Param-Falle (Drift #118, plug-ea/eamind).** Wer für Self-Containment einen eigenen `better-sqlite3`↔`bun:sqlite`-Treiber-Shim baut (jedes SQLite-Plugin **ohne** `plugin-storage-foundation`) läuft in einen **stillen** Bug: `bun:sqlite` bindet einen Plain-Key `{ public_key: v }` **nicht** an einen `@public_key`-Named-Param — er landet als **NULL, ohne Throw** (better-sqlite3 bindet ihn korrekt). Ergebnis: `NOT NULL constraint failed` erst im Betrieb, nicht im Test.
> - **Fix:** **positionale Params** (`?`) bevorzugen, oder die bun:sqlite-Prefix-Key-Form (`{ '@public_key': v }`) verwenden — konsistent über alle Statements.
> - **Warum Node-Tests es nicht fangen:** better-sqlite3 (Node) beweist bun:sqlite-Verhalten **nicht**. Fahre mindestens **einen Smoke unter echtem Bun** (`bun --no-install` gegen das extrahierte Bundle, inkl. eines `register-host`-Roundtrips) — der Packer-Scan kann das nicht fangen (Laufzeit-Semantik, kein Import).
> - **Am einfachsten:** nimm `@nexus-mindgarden/plugin-storage-foundation` (runtime-agnostischer SQLite-Driver, node+bun getestet) statt einen eigenen Shim zu bauen.

### 4.8 Feature-Katalog für die Notes-Registry (`features-note`)

> **Ab `create-plugin` v0.9.0 / `plugin-bridge-foundation` v0.13.0** (Chatbus Contract #6, rust-chatbus #7557/#7592). Ersetzt handgepflegte `repo/<role>/features`-Notes.

Ein Befehl pro Release rendert dein Manifest zu einem Markdown-Feature-Katalog:

```sh
create-plugin features-note                 # → stdout (pipebar)
create-plugin features-note --dir=. --out=features.md
```

Enthalten: MCP-Tools (Name · Scopes · erste Description-Zeile), Routes, Module-Extensions, Incoming-Floor ⟂ Outgoing-Grant, Distribution — plus der eingebettete **`manifest_hash`**.

**Eigenschaften, die den Befehl release-tauglich machen:**

- **Offline** — liest das lokale `manifest.<id>.yaml` (via `discoverManifest`), **keine laufende Bridge nötig**. Läuft in CI und vor dem ersten Deploy.
- **Deterministisch** — kein Datum, stabile Sortierung. Gleiches Manifest ⇒ byte-identische Ausgabe ⇒ ein Re-Append lässt sich sparen.
- **Staleness über den Hash** — der eingebettete `manifest_hash` ist derselbe, den deine Bridge im `/health` meldet. Weicht er ab, ist die Note veraltet.
- **stdout ist sauber** — alle Diagnostik geht auf stderr, damit die Ausgabe direkt weiterverarbeitet werden kann.

**Der Bus-Append bleibt bewusst außerhalb des CLIs** (`append_note` braucht Session-Identität + die `supersedes`-Vorgänger-id — sonst hätte jedes Plugin eine Bus-Dependency im Release-Pfad). Release-Schritt:

```
create-plugin features-note   →   append_note(topic="repo/<role>/features", supersedes=[<vorgänger-id>])
```

Programmatisch geht es auch direkt: `renderFeaturesNote(manifest, { manifestHash })` aus `@nexus-mindgarden/plugin-bridge-foundation` (pure, zero-network).

---

## 4.9 ✅ Aktivierbar beim Endkunden — die vollständige Checkliste

> **Verbindlich.** Bestätigt von `agent` (myMind-Host, Vertrags-Owner) für rc.31, #8428/#8429/#8430. Jeder Punkt hier hat mindestens ein Plugin einen Kundentermin gekostet — cad-2d 1.2.2 ist an **drei** davon gleichzeitig gestorben.
>
> **Rollenverteilung:** der **Host** besitzt den Vertrag und seine ausführbare Fassung (den Conformance-Runner). **plug-tmpl** besitzt die Basis (Scaffold, Packer, Guides, Wire-Spec) und hält sie aktuell. Ändert sich der Vertrag, wird erst die Basis nachgezogen, dann die Plugins.

> ## 🧨 Die Fehlerklasse, die uns an einem Tag dreimal erwischt hat
>
> **Ein Feld, das validiert und nichts bewirkt, ist schlimmer als ein Feld, das fehlt** (agent). Fehlt es, merkt es der Autor sofort. Validiert es, hält er es für erledigt — und der Fehler taucht erst beim Kunden auf, wenn überhaupt.
>
> Die drei Fälle, alle am 2026-08-15, alle mit derselben Rückmeldung an den Autor („passt schon"):
>
> | | Was der Autor sah | Was tatsächlich geschah |
> |---|---|---|
> | `distribution.type: 'embedded'` | validierte gegen unsere Foundation | der Host **lehnte das Manifest ab** — er kannte den Wert gar nicht |
> | `distribution.type: 'library'` | validiert bei beiden | **lädt nichts.** Nur als Negativ-Zweig gelesen |
> | `requires.scopes` | Manifest **akzeptiert** | das Host-Schema kannte das Feld nicht, **Zod streifte es still ab** — `requires` war danach `undefined` |
>
> ⚠️ **Der Zusatz, der den dritten Fall überhaupt sichtbar gemacht hat:** es reicht nicht, zu prüfen, ob dein Schema ein Manifest **annimmt** — prüf, **was nach dem Parsen noch da ist.** `parseManifest` meldete `AKZEPTIERT` **und** lieferte `requires: undefined`, beides gleichzeitig. Ein Test, der nur auf „wirft nicht" prüft, ist an dieser Klasse blind.
>
> Praktisch für dich: nach jeder Manifest-Erweiterung einmal das **geparste Objekt** ansehen, nicht nur den Exit-Code. Und wenn du einen Wert deklarierst, von dem du annimmst, dass der Host ihn liest — **frag nach, ob er ihn liest.** Wir haben es dreimal nicht getan.

### 4.9.0 🧭 Zuerst: welche Betriebsart bist du?

**Ein Teil der Checkliste ist betriebsartabhängig — der größere Teil nicht.** Und die Betriebsart ist **kein Rang auf einer Skala**, sondern ein Kreuz aus zwei **unabhängigen** Achsen. Diese Seite hat das erst falsch beschrieben; ET-Mind und Markview sind genau in das Feld gelaufen, das die falsche Fassung nicht hatte.

**Achse 1 — Lebenszyklus: wer startet und stoppt deinen Prozess?**

| | **host-verwaltet** | **selbstverwaltet** |
|---|---|---|
| **Erkennungsmerkmal** | Bundle liegt im Slot/Katalog, der Host spawnt dich | Kein Bundle. launchd/systemd/Electron/dein Updater startet dich |
| **Lebenszyklus** | Host: spawn · health-poll · stop · Update-Swap · Rollback (§4.9.6) | **Du.** Eigener Start, eigener Updater |
| **Neustart nach Absturz** | Host versucht bis zu **dreimal**, dann gibt er auf und meldet es | **Niemand.** Das ist dein Supervisor, nicht der Host |
| **`PLUGIN_BRIDGE_PORT` setzt** | der **Host** (mit Instanz-Offset) | **dein** Dienst-Manager |
| **`PLUGIN_DATA_DIR` setzt** | der **Host** (nach `launch.env`, gewinnt immer) | in der Regel **niemand** — du brauchst einen definierten Fallback |
| **Bundle-Packer (§4.7)** | ja | nur wenn du zusätzlich über den Katalog verteilst |
| **stdout sparsam halten** | **ja** — der Host liest deine Pipe beim Spawn | irrelevant |

**Achse 2 — Oberfläche: bringst du UI in den Host?** (`routes` und/oder `ui.sidebar_entry`)

| | **ohne Oberfläche** | **mit Oberfläche** |
|---|---|---|
| **Consent-Fingerabdruck** | Endpunkt · Scopes · Werkzeug- und Skill-Namen | **zusätzlich Routen + Sidebar-Eintrag** — jede UI-Erweiterung ist ein Zustimmungs-Ereignis (§4.9.4) |
| **`render-ui`** | — | §5.5 gilt, Assets werden gegen `distribution.service_endpoint` aufgelöst |
| **Nutzer erreichen** | ⚠️ **du kannst es nicht.** Health-JSON und `/readyz` erreichen niemanden — für die Verwaisungs-Meldung (§4.9.3) fehlt dir die Fläche | über deine eigenen Routen |

**Die Achsen sind frei kombinierbar.** Alle vier Felder sind besetzt: host-verwaltete Bundles ohne UI, host-verwaltete Bundles mit Navbar-Eintrag, **selbstverwaltete Dienste mit voller Oberfläche** (ET-Mind: `external-service` per launchd, 29 Routen + Sidebar; Markview: signierte Electron-App mit Sidebar-Eintrag) und selbstverwaltete Dienste ohne UI.

⚠️ **`distribution.type` steuert nichts.** Der Host entscheidet den Lebenszyklus an der **Bundle-Präsenz** (`plugin-service-manager.ts`: `bundleDir` + `launch`), und die Oberfläche am **Manifest-Inhalt**. Das Feld beschreibt deine Absicht.

> 🚫 **Für Theseus ist `external-service` der einzige wirksame Wert. `embedded` wird abgelehnt, `library` validiert und lädt nichts.**
>
> Zur Herkunft, weil die Unterscheidung teuer war: diese Seite behauptete zuerst, `embedded` „validiert und tut dann nichts". **Falsch** — das Host-Schema ist `z.enum(['external-service', 'library'])` und kennt `embedded` überhaupt nicht, ein Manifest damit **fällt an A1 durch** (agent #8474). Meine Foundation hatte den Wert trotzdem, also baute ein Autor, der ihr folgte, ein Manifest, das der Host **ablehnt**. Seit `plugin-bridge-foundation@0.14.0` sind beide Schemata deckungsgleich — der Fehlschlag passiert jetzt beim Build statt beim Endkunden. Der Hinweis **A7** meldet dir jeden `type ≠ external-service`.
>
> Willst du UI im Host, ist das die **zweite Achse**: `routes`/`ui.sidebar_entry` — **mit oder ohne Bundle**, unabhängig von `distribution.type`.

---

**Was für ALLE gilt, in jedem Feld des Kreuzes.** Diese Liste ist nicht abschließend, aber nichts darin ist betriebsartabhängig:

- **Env-first Port** — `PLUGIN_BRIDGE_PORT` lesen, **niemals** den Manifest-Port hart verdrahten. Autorenpflicht für jedes Plugin ([[plugin-release-update]] #110). Nur *wer* die Variable setzt, hängt an Achse 1.
- **`PLUGIN_DATA_DIR` lesen** — auch selbstverwaltet. Setzt sie jemand, **gewinnt sie**; sonst greift dein Fallback (§4.9.3).
- **Die Datenpfad-Pflicht** (§4.9.3) — wer den Datenpfad ändert, **muss** Altbestände adoptieren oder sichtbar melden. Ein selbstverwalteter Dienst zieht sein Verzeichnis selbst um und ist damit **exponierter**, nicht geschützter.
- **Consent-Drift** (§4.9.4) und die Regel **Consent-Fehlschlag ⇒ kein Rollback** (§4.9.6) — auch wenn dich sonst nichts an §4.9.6 betrifft.
- **Health-Budget** (§4.9.5) — der Host pollt deine Bridge-Health identisch, egal wer dich gestartet hat.
- **`sub` nie validieren + `aud`-Bindung selbst erzwingen** (§4.9.10) · **`min_app_version` mit `-rc.1`** (§4.9.11) · **Werkzeugnamen** (§4.9.9) · **Tenant-Check und RBAC auf dem Tool-Pfad** (§4.9.13) · **Favicon** (§8) · **Conformance-Runner vor dem Kandidaten** (§4.9.2).

> 🔐 **`autoAccept` ist eine Autorenentscheidung, keine Detektion — und das ist eine Korrektur.**
> Diese Seite hat empfohlen, den Vertrauensanker aus `PLUGIN_BRIDGE_PORT` abzuleiten („die Variable ist da ⇒ der Host hat mich gestartet ⇒ er ist die Trust-Root"). **Das trägt nicht mehr.** Seit #110 liest *jedes* Plugin die Variable, und ein selbstverwalteter Dienst **darf sie sich selbst setzen** — ET-Minds launchd-Agent tut genau das. Wer die Heuristik dort kopiert, vertraut in Wahrheit seinem **eigenen Launcher** und akzeptiert `register-host` von **jedem auf Loopback** — genau die Bedrohung, vor der §10.3 warnt.
> **Du weißt, ob dich ausschließlich ein Host startet.** Entscheide es explizit und einmal, statt es zur Laufzeit zu raten. Sicherer Standard ist die Allowlist.

### 4.9.1 Die Reihenfolge

1. Scaffold ziehen, **Kennung UND Werkzeugnamen** produktspezifisch wählen (`mail-mind`, nicht `mail`) — **beides ist später faktisch eingefroren** (§4.9.9)
2. Port aus **`PLUGIN_BRIDGE_PORT`** lesen, niemals aus dem Manifest
3. Daten in **`PLUGIN_DATA_DIR`** ablegen, nirgendwo sonst
4. **`sub` niemals validieren** — Plugin-Bindung an `aud`/`plugin_id`, **und ab foundation@0.13.x prüfen** (§4.9.10)
5. **`min_app_version` immer mit `-rc.1`-Suffix**, egal welche Zahl (§4.9.11)
6. **Conformance-Runner lokal grün** — *dann erst* Kandidat melden

**Punkt 6 ist der wichtigste.** Ein Kandidat, der die Prüfung nicht bestanden hat, kostet einen Kundentermin.

> 📌 **Melde Hash und Bytes deines Bundles erst, wenn der Runner grün ist** (med-plug). Vorher ändert sich das Artefakt fast sicher noch — ein A4-Fix allein ist eine neue Version. Zwei überholte Hashes sind in dieser Rollout-Runde durch die Kette gelaufen, bevor jemand den Lauf fahren konnte.

> 📌 **Bestehendes Plugin statt Neubau?** Diese Checkliste ist für beide gedacht, aber zwei Dinge betreffen **nur** dich: der Umgang mit **bereits vorhandenen Nutzerdaten** beim Wechsel auf `PLUGIN_DATA_DIR` (§4.9.3) und die Tatsache, dass **Kennung und Werkzeugnamen nachträglich teuer sind** (§4.9.9). Du scaffoldest nicht neu — du liest dieses Dokument. Deshalb steht beides hier und nicht nur im Scaffold.

### 4.9.2 Der Conformance-Runner

**Das gebaute Artefakt liegt in dieser Basis:** `tools/conformance/plugin-conformance.mjs` (+ `.sha256` + README). Du brauchst **keinen** Zugriff auf das Host-Repo.

```bash
node tools/conformance/plugin-conformance.mjs <pfad/zu/manifest.<id>.yaml> [--endpoint URL]
```

Nur `node` nötig — kein Workspace, kein TypeScript, keine Installation. Er spricht **HTTP**, läuft also gegen ein Python-, Rust- oder Go-Plugin genauso wie gegen ein TypeScript-Plugin. **Exit 0**, wenn alle Pflicht-Prüfungen bestehen.

💡 **Ohne `--endpoint`** laufen die Manifest-Prüfungen (A1–A6) und die Hinweise trotzdem — das findet z.B. den A4-Blocker, **bevor** dein Dienst überhaupt läuft. Lohnt sich als erster Schritt.

Das Artefakt ist **gebaut vom Host, verteilt von plug-tmpl** — nicht kopiert. Eine Quellcode-Kopie wäre in zwei Wochen eine zweite Wahrheit; der Runner gehört dem Host, weil er den Host-Vertrag testet. `agent` meldet jede Änderung mit neuem Hash und Grund. Provenienz + Hash-Prüfung: `tools/conformance/README.md`.

| | Prüfung |
| --- | --- |
| **A1** | Manifest ist gültig |
| **A2** | Dateiname trägt die Plugin-Kennung (`manifest.<id>.yaml`) |
| **A3** | `compatibility.apps` enthält `theseus` |
| **A4** | `min_app_version` sperrt keine rc-Builds aus |
| **A5** | Version ist pfadsicher |
| **A6** | `service_endpoint` vorhanden |
| **B1** | Dienst antwortet |
| **C0** | nimmt den Host-Schlüssel entgegen (`register-host`) |
| **C1** | akzeptiert ein vertragskonformes Token — C0 lief vorher, wer jetzt noch „kennt den Host nicht" sagt, hat **quittiert und nicht gespeichert**. Ausnahme: meldete `register-host` ein `pending`, ist es ein Hinweis mit **„NICHT GEPRÜFT"** — nicht „bestanden" |
| **D1** | weist ein Token für ein **anderes Plugin** ab |
| **D2** | weist eine **fremde Signatur** ab |
| **D3** | weist ein **abgelaufenes Token** ab |
| **E1–E3** | Qualitätshinweise: `input_schema` vorhanden · Beschreibung vorhanden · Werkzeugnamen wiederholen die Kennung nicht |

**C0 läuft vor C1** — und das ist kein Detail: prüft man das positive Token, *bevor* der Host registriert ist, meldet der Lauf „Signaturprüfung fehlgeschlagen", obwohl in Wahrheit nur der Schlüssel fehlte. Unterscheide bei einem Fehlschlag immer zwischen **„kennt uns nicht"** (repariert der Host selbst) und **„lehnt gültiges Token ab"** (musst du fixen).

### 4.9.3 `PLUGIN_DATA_DIR` — host-autoritativ

**Alle** persistenten Daten dorthin: Datenbank, Host-Keys, Caches. Absolut, vom Host gesetzt, existiert garantiert, **pro Installation** (zwei myMind-Installationen = getrennte Daten), **überlebt Updates**. Es liegt bewusst **nicht** unter dem Bundle — ein Update ersetzt `<pluginsRoot>/<id>/app/<version>` komplett, dort abgelegte Daten sind weg.

**Der Host gewinnt:** die Variable wird **nach** `launch.env` gesetzt, ein eingebackener Pfad kann sie nicht überschreiben. Brauchst du einen eigenen Variablennamen, deklariere ihn als `distribution.storage_env` — der Host setzt dann beide.

Im Scaffold: `resolveDataDir()` neben `resolvePort()`.

**Drei Präzisierungen aus Gruppe 1** (mind-canva #8440, cad3d #8441):

- **Auch Binär-Assets und Uploads** gehören dorthin, nicht nur DB und Host-Keys. Wer nur die Datenbank umzieht, teilt sich die Assets zwischen zwei Installationen.
- **„Host gewinnt" heißt auch: deine eigenen Env-Overrides verlieren.** Wenn `PLUGIN_DATA_DIR` gesetzt ist, muss ein plugin-eigenes `MY_DB_PATH`/`CAD_DATA_DIR` **ignoriert** werden — sonst zeigen zwei Installationen wieder auf denselben Ort.
- **Host-Keys gehören ebenfalls hierhin** (§10.3) — `./data/host-keys.json` unter dem Bundle ist beim nächsten Update weg.

> 💳 **Und seit der Lizenz-Entscheidung ist das keine Hygienefrage mehr, sondern eine Lizenzfrage.** Operator-Ruling 2026-08-15: **es wird genau zweimal ins Netz gegriffen** — bei der Erstaktivierung des Hosts und beim Bezug eines Plugins. Danach nie wieder; myMind, TeamMind und FamilyMind laufen ohne Nexus, sobald die erste Abfrage durch ist. Es gibt **keine** Laufzeit-Lizenzprüfung.
>
> Wenn aber nur **einmal** geprüft wird, ist der Ort des Ergebnisses kritisch. **Liegt ein Lizenz- oder Berechtigungstoken unter dem Bundle-Pfad, ist er beim nächsten Update weg** — und aus „einmal aktivieren" wird still **„bei jedem Update neu aktivieren"**. Beim Kunden. Möglicherweise offline. Er erlebt es als *„nach dem Update war mein gekauftes Plugin weg."*
>
> **Jeder Berechtigungszustand gehört deshalb ins `PLUGIN_DATA_DIR`** — wie Datenbank und Host-Keys, aus demselben Grund und mit höherem Einsatz.
>
> Zwei Dinge, die daraus **nicht** folgen und die du deshalb **nicht bauen sollst**: kein vorsorgliches Ablaufdatum, keine Neuvalidierung „alle 30 Tage", kein stiller Degradierungspfad. Ablauf und Widerruf existieren im aktuellen Modell **nicht** — das ist eine bewusste Entscheidung, keine Lücke. Kommen Abo-Modelle, kommen sie mit eigenen Regeln. Halb gebaute Ablauflogik ist unsichtbar, bis sie beim Kunden zuschlägt.
>
> **Verlorener Token ist wiederherstellbar, aber teuer.** Eine Lizenz lässt sich in Nexus deaktivieren und neu aktivieren — ein Rechnerwechsel sperrt niemanden aus, und die Freigabe braucht die alte Maschine nicht. Es ist also **keine Einbahnstraße**. Es kostet aber **Netz** genau dann, wenn der Kunde vielleicht keins hat (Update im Zug ⇒ Plugin weg bis zum nächsten Empfang), und es kostet **eine zusätzliche menschliche Entscheidung**. Damit reißt es den Maßstab, an dem wir das Ganze messen: *zwischen „gekauft" und „nutzbar" liegt genau **eine** bewusste Entscheidung eines Menschen.* Ein verlorener Token macht daraus zwei — bei jedem Update, ohne dass jemand versteht, warum.

> 🧬 **„Überlebt Updates" und „wird beim Restore nicht mitkopiert" sind ZWEI Anforderungen — und für Identität willst du die zweite** (v8-fam).
>
> Meine Regel oben adressiert den Bundle-Pfad: was dort liegt, ist beim Update weg. v8-fam hat gemessen, dass das die Frage nur halb stellt. Bei ihnen liegt der Berechtigungs-Token in der **Datenbank** — Updates übersteht er mühelos. Aber `pg_dump` nimmt ihn vollständig mit, zusammen mit dem privaten Host-Schlüssel aus dem Key-Archiv. **Ein Restore auf einer zweiten Maschine reproduziert damit Berechtigung *und* Identität.** Der Sitzplatz-Zähler ist dann ein Vorschlag.
>
> Die Unterscheidung, die daraus folgt:
>
> | | soll Updates überleben | soll beim Restore mitkommen |
> |---|---|---|
> | **Nutzerdaten** (DB, Assets, Uploads) | ja | **ja** — genau dafür macht man Backups |
> | **Identität und Berechtigung** (Installations-Kennung, Lizenz-Nachweis, Host-Schlüssel) | ja | **nein** |
>
> **Daten willst du wiederhaben. Identität nicht.** Eine Installations-Kennung gehört deshalb **maschinen-abgeleitet und beim Restore neu berechnet**, nicht gespeichert. Das ist dieselbe Regel wie „**Host-Keys nicht adoptieren**" weiter oben, nur an einem anderen Artefakt: eine alte Freigabe in eine neue Installation zu tragen, re-approved einen Host, den der Nutzer dort nie freigegeben hat — und einen Lizenzplatz mitzukopieren, vervielfältigt ihn.
>
> Praktisch für dich: prüf nicht nur, was ein **Update** mit deinem Verzeichnis macht, sondern auch, was ein **Backup** davon mitnimmt. Wenn deine Sicherung Identitätsartefakte enthält, ist jede Wiederherstellung ein Klon.

> ℹ️ **Was „Lizenz deaktivieren" nicht tut — sag es deinen Nutzern so.** Deaktivieren in Nexus **gibt den Platz frei; es schaltet eine laufende Installation nicht ab.** Das folgt zwingend: ohne Laufzeitprüfung gibt es nichts, was auf der alten Maschine je davon erführe. Kein Defekt, sondern die Kehrseite des Offline-Betriebs — „läuft für immer ohne Netz" und „lässt sich aus der Ferne abschalten" schließen einander aus.
>
> Formuliere entsprechend: **„Lizenz freigeben"** trifft es, **„Zugriff entziehen"** wäre eine Zusage, die niemand einlöst. Sonst entsteht die Support-Erwartung *„ich habe die Lizenz des ausgeschiedenen Mitarbeiters deaktiviert, warum kann er es noch benutzen?"* — Deaktivieren ist eine **Buchhaltungs-Handlung**, keine Fernabschaltung.

> 🚨 **DER UMZUG SELBST IST DAS RISIKO — und kein Gate fängt ihn.** wiz-mind hat den Wechsel sauber gemacht, war **12/12 grün** — und hatte trotzdem **2 Charaktere, 10 Sessions, 35 Diary-Einträge verloren** (#8457). Nicht gelöscht: **verwaist**. Die Bridge zeigte auf eine frische DB, die alte lag unangetastet am alten Pfad. med-plug hat daraufhin nachgemessen: 1 Fall + 18 Audit-Einträge am Altpfad.
>
> **Kein Test, kein Health-Check und kein Conformance-Punkt schlägt hier an** — technisch ist alles grün, der Nutzer sieht eine leere Liste. Der Runner *kann* es nicht messen: er kennt deinen Altbestand nicht.
>
> **Deshalb als MUSS-Anforderung:** wer den Datenpfad ändert, **muss** beim Boot vorhandene Altdaten **adoptieren oder sichtbar melden** — bevor er einen Kandidaten meldet. Miss es nach, nimm es nicht an.

**Die Regel** (agent #8444, verschärft durch #8457):

1. **`PLUGIN_DATA_DIR` gewinnt**, deine eigene Variable bleibt **Fallback**.
2. **Keine automatische Migration** im Sinne von „ungefragt kopieren und den Altpfad verwerfen": sie müsste entscheiden, was passiert, wenn **zwei Installationen** auf dieselben Altdaten zeigen — das kann kein Plugin für den Nutzer entscheiden.
3. **Neue Daten nur nach `PLUGIN_DATA_DIR` schreiben**, und Altdaten **sichtbar machen**.

**Das Adoptionsmuster** (wiz-mind, `adoptLegacyData(target, [kandidaten])`, aufgerufen **vor** dem Öffnen der DB). Die Sicherheitseigenschaften sind der Punkt, nicht der Happy Path:

- **Nur in ein leeres/fehlendes Ziel adoptieren.** Ein Ziel mit Zeilen wird nie angefasst → neuere Daten schlagen ältere, kein stiller Overwrite.
- **Quelle read-only**, bleibt byte-identisch → eine falsche Vermutung ist **immer umkehrbar**.
- **SQLites `backup()`-API statt Dateikopie** — eine Dateikopie verliert ein nicht-gecheckpointetes **WAL**. Subtil und teuer.
- **Kandidatenliste in Reihenfolge** (alter Repo-Pfad, dann OS-Verzeichnis, …), das aktive Ziel wird übersprungen.
- **Wirft nie in den Boot.** Korrupte Alt-Datei → „starte leer", also exakt der Status quo ohne Adoption.
- **Host-Keys NICHT adoptieren.** Das sind Sicherheits-Grants: eine alte Freigabeliste in eine neue Installation zu tragen **re-approved einen Host, den der Nutzer hier nie freigegeben hat**. Der Host registriert sich neu — auch wenn das eine Freigabe kostet. *(Unabhängig bestätigt von wiz-mind und med-plug; bei letzterem hängt an dieser Freigabe der Zugriff auf Patientendaten.)*

> ⚠️ **„Sichtbar" heißt: beim Nutzer, nicht in JSON** (med-plug). Health, Status und eine Startzeile erreichen keine Ärztin — die sieht eine leere Fallliste und sonst nichts. **Gezählt** melden (`cases=1 audit=18`) statt „da ist was", und dort, wo der Nutzer hinschaut (Banner in der Oberfläche).

> 🕳️ **„Sichtbar machen" heißt zuerst: überhaupt suchen** (wiz-mind). Die naheliegende Implementierung steigt bei `target_not_empty` **sofort aus** — verständlich, denn sie soll ja nichts überschreiben. Genau dann **schaut sie die Kandidatenpfade nie an** und meldet folglich auch keine Verwaisung. Das ist der Zustand, in dem wiz-mind grün war und trotzdem 2 Charaktere fehlten: das Ziel war nicht leer (frische DB **mit Schema**), also lief die Adoption gar nicht erst los. **Scanne die Kandidaten immer, auch wenn du nicht adoptierst** — und melde, was du findest. „Nicht adoptieren" und „nicht nachsehen" sind zwei verschiedene Entscheidungen; nur die erste ist sicher.

> 🚨 **MUSS — wie du zählst, ohne den Altbestand zu zerstören.** Zweifach unabhängig nachgemessen (Mechanik von plug-elec, Messung im Prüflauf; Wahrheit im Test: **500** committete Zeilen):
>
> | Was du tust | Was du bekommst |
> |---|---|
> | `db` + `-wal` kopieren, Kopie read-only zählen | **500** ✅ |
> | nur `db` kopieren | **0** ⚠️ still |
> | `db` + `-shm` kopieren, `-wal` verloren | **0** ⚠️ still |
> | `immutable=1` statt Kopie | **0** ⚠️ still |
> | normale (read-write) Verbindung aufs Original | 500 — **aber `app.db` neu geschrieben und `app.db-wal` GELÖSCHT** |
>
> 1. **Erst kopieren, dann zählen.** Nie am Original. Diese Reihenfolge allein löst das gesamte Problem.
> 2. **Kopiermenge ist `app.db` + `app.db-wal`.** Beide, immer. Fehlt das `-wal`, meldet SQLite **0 Zeilen ohne jeden Fehler** — so werden 500 vorhandene Datensätze zu „nichts zu migrieren".
> 3. **`app.db-shm` NICHT mitkopieren**, aus der Wegwerfkopie löschen. Es trägt nichts bei und stiftet falsche Sicherheit.
> 4. **`immutable=1` ist in Migrations- und Prüfwerkzeugen verboten.** Es ignoriert das `-wal` vollständig und liefert den Stand des letzten Checkpoints — still, ohne Fehler. Tückisch: eine frisch gecheckpointete **Test**-DB verrät den Fehler nicht, beim Kunden schlägt er zu.
> 5. **Nie mit einer normalen Verbindung an den Altbestand.** SQLite checkpointet beim Schließen der letzten Verbindung — es schreibt `app.db` neu und **löscht `app.db-wal`**. Wer zum Zählen `new Database(altpfad)` schreibt, zerstört den Beweis, bevor er ihn gelesen hat.
> 6. **`cp` einer laufenden DB ist nicht atomar.** Läuft der Alt-Prozess noch, nimm `backup()` oder `VACUUM INTO` statt einer Dateikopie.
>
> **Muss es in place und ohne jeden Schreibzugriff sein:** Dateisystem-seitig read-only setzen (Dateien **und** Verzeichnis), dann fällt SQLite auf einen Heap-Wal-Index zurück — korrekt und ohne jede Änderung. Setzt ein vorhandenes `-shm` voraus, sonst `SQLITE_CANTOPEN(14)`. **Das ist richtig so — fail closed.** Fang den Fehler ab, aber weich **nicht** auf `immutable=1` aus. (`readonly_shm=1` funktioniert, ist aber undokumentiert und unix-only — nicht darauf bauen.)

> ℹ️ **Was hier NICHT das Problem ist, obwohl es alarmierend aussieht:** ein **Read-only**-Open schreibt das `-shm` neu (voller `walIndexRecover()` — 7 Bytes: `WalIndexHdr.iChange` + Prüfsummen in beiden Header-Kopien, plus `nBackfillAttempted`). Das `-shm` ist ein **rein abgeleiteter Cache**, beweisbar aus `db+wal` regenerierbar: mit `0xAB` zerstört, liefert das nächste Zählen trotzdem 500 und stellt denselben Hash wieder her.
> ➡️ **Nimm `-shm` aus jedem Hash-Manifest und Backup-Vergleich heraus** — es unterscheidet sich nach jedem Öffnen, by design, und lässt sonst deine Integritätsprüfung auf **gesunden** Installationen anschlagen. Randfall: auf einem Verzeichnis mit **nur** `app.db` **erzeugt** ein Read-only-Zählen zwei neue Dateien (`-wal` 0 Byte, `-shm` 32 KB).

> 🔑 **Prüf, ob zu deinen Daten ein Schlüssel oder ein anderes Nebenartefakt gehört — und nenn es dem Nutzer beim Namen** (med-plug). Bei Med-Mind liegt der **Verschlüsselungs-Key im Datenverzeichnis**: wer dem Rat „kopier den Ordner" folgt und nur die DB mitnimmt, hat **Chiffrat, das er nie wieder aufmacht** — die Daten *sehen* übernommen aus und sind es nicht. Bei einem RPG ist das nichts, bei personenbezogenen Daten der Unterschied zwischen Übernahme und Totalverlust.

**Und Punkt 3 „beide Orte lesen" ist kein pauschales Rezept — entscheide es bewusst** (med-plug). Bei **personenbezogenen Daten** heißt Dual-Read faktisch: dieselben Daten an zwei Stellen halten und im Zweifel duplizieren — eine **Betreiber**-Entscheidung, keine Plugin-Entscheidung. Med-Mind hat sich für Patientendaten bewusst **dagegen** entschieden und macht den Altpfad nur sichtbar, kopiert nichts. Für Plugins mit personenbezogenen Daten ist das in der Regel die richtige Wahl — für ein Spiel ist Adoption richtig.

### 4.9.4 Consent-Drift — breiter als „Scopes"

Der Host bildet einen **Fingerabdruck** über das Manifest. Ändert er sich, wird die Aktivierung **suspendiert, bis der Nutzer zustimmt**. Enthalten sind:

> Endpunkt · Scopes · **Routen** · **Werkzeugnamen** · **Skill-Namen** · `module_extensions` **inkl. der Hook-Endpunktnamen** · **Sidebar-Eintrag**

**Nicht** enthalten: Beschreibungen und Schemata — bessere Doku ist kein neues Recht.

Ein nachgeschobenes Werkzeug in Bare-String-Form trägt keine `scopes_required` und wäre trotzdem sofort für den Agenten aufrufbar — **genau deshalb zählt der Name mit**. Praktische Folge: **ein neues Werkzeug in einer Minor-Version ist ein Zustimmungs-Ereignis.** Erwartbar machen (Changelog), nicht überraschen.

### 4.9.5 Health — schnell, sonst Suspend

**Gemeint ist `GET /plugin-bridge/v1/health`** — der Bridge-Endpunkt, den der Host pollt. **Nicht** ein eigenes `/api/health` für deine Standalone-UI: das darf langsam sein, der Host schaut da nie hin. (cad3d hätte beinahe den falschen umgebaut.) Nutzt du `createBridgeApp`, liefert die Foundation den Bridge-Health selbst — dann ist das Budget über deinen Code gar nicht gefährdet.

Der Bridge-Health läuft durch **dieselbe Warteschlange wie Nutzerklicks**, Budget **~5 s**. **Nicht** im Health-Handler Modelle laden, Netz aufrufen oder auf Locks warten — ein hängendes Plugin blockierte früher jeden Klick. Ein ungetimeouteter Probe (LM Studio, Sidecar, Remote-API) ist der häufigste Weg, das Budget zu reißen.

Ein fehlgeschlagener Health-Pass **suspendiert** das Plugin; seit rc.31 mit Begründung, die einen App-Neustart überlebt. `degraded`/`unhealthy` nur melden, wenn es stimmt.

### 4.9.6 Update & Rollback — der Host führt ihn, du machst ihn möglich

Ablauf: alte Version stoppen → neues Bundle starten → Handshake. Scheitert Start oder Handshake, rollt der Host auf die vorherige Version zurück.

1. **Die alte Version muss startbar bleiben.** Migrationen im `PLUGIN_DATA_DIR` rückwärtskompatibel halten oder versioniert nebeneinander legen — sonst ist der Rollback wertlos.
2. **Sauberer `SIGTERM`-Abgang.** Wer nicht binnen weniger Sekunden geht, wird hart beendet.
3. **Handshake-Fehlschlag ⇒ Rollback. Consent-Fehlschlag ⇒ *kein* Rollback** — die neue Version bleibt installiert und wartet auf Zustimmung. Das ist der wahrscheinlichste Fall, sobald neue Werkzeuge den Fingerabdruck ändern (§4.9.4).

### 4.9.7 Dienstzustand & Logging

„Aktiviert" und „läuft gerade" sind seit rc.31 **getrennte Tatsachen**: ein abgestürzter Dienst wird nicht mehr als aktiv angezeigt und startet bis zu **dreimal** selbst neu; danach bleibt er gestoppt und meldet, dass aufgegeben wurde.

**Beim Start sparsam loggen.** Ein Dienst, der viel auf stdout schreibt, blockierte früher am vollen Pipe-Puffer und wurde nie bereit. Der Host greift die Ausgabe inzwischen sofort nach dem Spawn ab — sparsames Start-Logging bleibt trotzdem die bessere Bauweise.

### 4.9.8 Lizenz/Entitlement — heute nicht scharf

Das Gate (`createNexusLicenseGate`) existiert, steht aber **per Default aus**, weil NEXUS derzeit keine Plugin-Entitlements ausgibt — ein scharfes Gate würde jedes Plugin nach der Aktivierung aussperren.

**Du musst heute nichts tun.** Baue nur so, dass eine Ablehnung beim Aktivieren später **eine Meldung ist, kein Absturz**. Das Scharfschalten ist eine Host-Entscheidung und wird vorher angekündigt.

### 4.9.9 Kennung und Werkzeugnamen sind faktisch eingefroren

„Produktspezifisch wählen" ist richtig, aber unvollständig — **es gilt für die Werkzeugnamen genauso, und ein späterer Rename ist teuer** (cad3d #8441):

1. **Werkzeugnamen stehen im Consent-Fingerabdruck** (§4.9.4) → ein Rename ist ein **Zustimmungs-Ereignis für jeden bestehenden Nutzer**.
2. **Andere Plugins können darauf rufen.** cad3ds `cad3d.import` ist der vereinbarte Push-Endpunkt von cad2d („Send to 3D") — ein Rename bricht eine **Cross-Plugin-Integration**.

Und die Wiederholungsfalle: id `cad3d-mind` + Tools `cad3d.*` ergibt beim Host `cad3d-mind.cad3d.list` — die Kennung steckt zweimal drin (E3). **Wähle das erste Segment als Domäne, nicht als Produktnamen:** `documents.list`, `render.export`, `deidentify.run` — nicht `<produkt>.list`.

> **Offen:** ob E3 bei einer solchen Wiederholung **Fail oder Hinweis** ist, ist beim Host angefragt (cad3d + med-plug betroffen). Bis zur Antwort: bei Neubau sauber wählen, bei Bestand **nicht blind umbenennen** — erst klären, dann entscheiden.

### 4.9.10 🚨 Die `aud`-Bindung musst du SELBST erzwingen — in jeder Foundation-Version

**Bindung an `aud` ist eine Aufgabe, keine Feststellung.** Wer sie ausschließlich der Foundation überlässt, akzeptiert Tokens **fremder Plugins** — jedes andere Plugin kann sich als deines ausgeben (Runner-Prüfung **D1**; unabhängig gefunden von mind-canva #8440 und wiz-mind #8445).

**Ein Foundation-Upgrade allein behebt das NICHT.** cad3d hat das am laufenden Dienst gemessen (#8451):

| Zustand | D1 |
|---|---|
| foundation 0.7.2 | ✗ akzeptiert fremdes Token |
| foundation **0.13.1**, sonst nichts geändert | ✗ **akzeptiert weiterhin** |
| 0.13.1 **+ plugin-seitiger `aud`-Guard** | ✓ |

**Die Ursache ist nicht die Version, sondern der Host.** Nachgemessen im Foundation-Code: `expected_audience` landet nur dann auf dem Host-Record, wenn der Host es im `register-host` **mitschickt** (`server.ts:322`), und `jwtVerify` bekommt die `audience`-Option nur, wenn dieser Wert existiert (`jwt.ts:126,137`). **Kein host-gesendetes `expected_audience` ⇒ keine Prüfung** — in jeder Version.

Was das konkret heißt (ebenfalls nachgemessen, das ist der Teil, den cad3d nicht belegen konnte):

- **myMind sendet es** (`plugin-host.ts:819`, `expected_audience: pluginId`, nicht-optional) — gegen den echten Host **ist** die Bindung also aktiv.
- **Der Conformance-Runner sendet es bewusst nicht.** D1 prüft damit genau das Richtige: **ob dein Plugin sich selbst schützt**, wenn ein Host die Bindung nicht setzt.

**→ Die Regel: upgraden UND guarden.** Das Upgrade bringt die Möglichkeit, der Guard die Garantie. Verlass dich nicht darauf, dass jeder Host — heute und künftig — `expected_audience` mitschickt.

**Der Guard**, so gebaut, dass er nichts anderes kaputt macht:

```ts
// NUR den Claim lesen — die Signatur bleibt Sache der Foundation (D2 bleibt grün),
// `sub` bleibt ungeprüft (§4.9 Punkt 4). Beide Prüfungen müssen bestehen.
function audGuard(pluginId: string) {
  return async (c, next) => {
    const raw = (c.req.header('authorization') ?? '').replace(/^bearer /i, '').trim()
    const seg = raw.split('.')[1]
    if (seg) {
      try {
        const p = JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'))
        const bound = p.aud ?? p.plugin_id
        if (bound !== undefined && bound !== pluginId) {
          return c.json({ error: { code: 'invalid_audience', message: 'token is not for this plugin' } }, 401)
        }
      } catch { /* unlesbar → Foundation lehnt es ohnehin ab */ }
    }
    return next()
  }
}
```

> ⚠️ **Einhäng-Reihenfolge — kostet sonst garantiert einen Lauf** (cad3d): `createBridgeApp` hat seine Routen **bereits registriert**, und Hono führt in Registrierungsreihenfolge aus. Ein nachträgliches `app.use(guard)` läuft **nicht** davor. Du musst die App **umschließen**:
>
> ```ts
> const bridge = createBridgeApp({ manifest, registry, … })
> const app = new Hono()
> app.use(audGuard(manifest.id))
> app.route('/', bridge)     // ← der Guard läuft jetzt zuerst
> ```

**Alternative auf Registry-Ebene** (wiz-mind): im Resolver `expected_audience ?? manifest.id` als Default setzen — ein explizit registrierter Host-Wert gewinnt weiter. Ein Plugin kennt seine eigene Kennung immer; „an alles gebunden" ist nie richtig. *(Ob die Foundation das künftig selbst als Default tut, ist beim Host angefragt — es würde Tokens **ohne** `aud` ablehnen und ist deshalb keine einseitige Entscheidung.)*

> 🚨 **Prüf zuerst deine Foundation-Version — der Registry-Weg existiert erst ab 0.9.0** (med-plug #8455, von mir am Code verifiziert):
>
> | Deine Version | Was geht |
> |---|---|
> | **< 0.9.0** (0.7.x, 0.8.x) | `expected_audience` gibt es **gar nicht** — die Foundation hat **keinerlei** `aud`-Behandlung, und `plugin_id` wird nirgends gegen die Manifest-Id verglichen. Dein Plugin ist **komplett ungebunden**: ein Token, das derselbe registrierte Host für ein *anderes* Plugin ausstellt, wird akzeptiert. **Der Guard ist hier der einzige Weg.** |
> | **≥ 0.9.0** | Registry-Weg **oder** Guard möglich — aber beide nur wirksam, wenn du sie selbst setzt (siehe oben: ohne host-gesendetes `expected_audience` prüft die Foundation nichts). |
>
> Wer die Registry-Zeile aus diesem Guide auf einer 0.7.x einbaut, hakt **D1 fälschlich als erledigt ab** — sie läuft dort ins Leere. Genau deshalb steht die Versionsgrenze hier.

### 4.9.11 `min_app_version`: immer mit `-rc.1`-Suffix

Die Regel ist strenger als „nimm nicht `1.0.0`": **jede reine Release-Angabe sperrt ihre eigene rc-Serie aus**, weil Prerelease vor Release rangiert. `0.5.0` schließt `0.5.0-rc.x` aus und failt A4 genauso wie `1.0.0` (mind-canva #8440).

**Faustregel: schreib immer ein `-rc.1`-Suffix, egal welche Zahl** — `1.0.0-rc.1`, `0.5.0-rc.1`. Das schließt keine echten Releases aus (jedes Release ist größer als sein eigenes rc) und öffnet die rc-Serie.

⚠️ **Auch eine niedrige Zahl failt** — es geht um die **eigene** rc-Serie, nicht um fremde Releases. `0.5.0` sieht harmlos aus („ist ja kleiner als `1.0.0-rc.31`"), sperrt aber `0.5.0-rc.x` aus und failt A4. Zwei Plugins haben sich genau daran verrechnet, weil sie die Semver-Regel **hergeleitet statt gemessen** haben.

Und die zweite Fehlerrichtung, die seltener genannt wird (plug-inst): `min_app_version` ist eine **Untergrenze**, keine Obergrenzen-Korrektur. Ein zu niedriger Wert failt nichts — er lässt Hosts laden, die den aktuellen Vertrag gar nicht können. **Setz den echten Boden**, nicht den kleinsten, der durchgeht.

### 4.9.12 Manifest-Felder, die der Host derzeit nicht liest

Ehrlichkeitshalber (Runner-Hinweis F2, mind-canva #8440): **`routes[].service_endpoint`, `mcp_tools[].output_schema` und `ui.sidebar_entry.label_key` wertet der Host aktuell nicht aus.** Sie schaden nicht und bleiben schema-gültig — aber verlass dich nicht auf eine Wirkung, die es heute nicht gibt.

### 4.9.13 🚨 Zwei Pfade, eine Regel — der Tool-Pfad umgeht gern deine RBAC

**Die Prüffrage, die du dir stellen musst:** *jede Operation, die über `/api/*` (deine eigene UI/HTTP-Fläche) eine Berechtigungsprüfung durchläuft — durchläuft sie dieselbe Prüfung auch, wenn sie über `execute-tool` von der Bridge kommt?*

Bei Med-Mind war die Antwort **nein**, und das Ergebnis war ernst: `med.deidentify` hatte über die Bridge **keine** Sperre und gab das **PII-Mapping an jeden Aufrufer** heraus — den Agenten eingeschlossen — während dieselbe Operation über `/api/*` sauber geprüft war (med-plug #8455).

Das Muster ist allgemein: die HTTP-Fläche wächst mit Sessions, Rollen und Middleware; der Tool-Handler wird später drangebaut und bekommt die Prüfung nicht mit. **Der Bridge-Pfad ist aber der mächtigere** — dort ruft ein Agent an, nicht ein eingeloggter Mensch.

**Konkret prüfen:**
- Handler, die schreiben, löschen oder **de-anonymisieren**: hängt die Rollen-/Rechteprüfung am Handler oder nur an der HTTP-Route?
- Kommt die Rolle aus einem **Claim** (signiert) oder aus einem **Header** (vom Aufrufer setzbar)? Header sind auf dem Bridge-Pfad keine Autorisierung.
- Der Tenant-Check gehört ebenfalls hierher — die Foundation macht ihn **nicht** für dich (`PLUGIN-BRIDGE-WIRE-SPEC §10`).

---

## 5. Layer-3-Walkthrough — erste Bridge

```ts
// packages/my-plugin-bridge/src/server.ts
import {
  createBridgeApp,
  discoverManifest,
  HostKeyRegistry,
  InMemoryHostKeyRepo,
  type ToolHandler,
} from '@nexus-mindgarden/plugin-bridge-foundation'
import { serve } from '@hono/node-server'

// Dual-read manifest.<id>.yaml (Fallback: deprecated manifest.yaml) — §4.7
const { manifest } = await discoverManifest('.')

// ⚠️ NICHT an NODE_ENV koppeln. Ein host-gespawntes Bundle läuft beim Kunden in
// Produktion, landet damit auf `pending` — und danach 401't ALLES, auch /health,
// ohne Ausweg (Aktivierungs-Deadlock beim Endkunden).
//
// ⚠️ Und NICHT aus PLUGIN_BRIDGE_PORT ableiten. Seit #110 liest JEDES Plugin
// diese Variable, und ein selbstverwalteter Dienst setzt sie sich selbst
// (launchd/systemd). Als Trust-Signal beweist sie nichts — wer sie dafür nimmt,
// vertraut seinem eigenen Launcher und nimmt register-host von jedem auf
// Loopback entgegen. Entscheide es EXPLIZIT, einmal, hier:
const NUR_VOM_HOST_GESTARTET = true // ⇐ false, sobald dich auch etwas anderes startet

const registry = new HostKeyRegistry(new InMemoryHostKeyRepo(), {
  autoAccept: NUR_VOM_HOST_GESTARTET,
  // false? → dann brauchst du eine Allowlist `{host_id → Fingerprint}` (§10.3)
})

// Bootstrap V8s public-key wenn vorhanden
if (process.env.V8_PUBLIC_KEY_PEM) {
  await registry.register({
    host_id: 'teammind',
    public_key_pem: process.env.V8_PUBLIC_KEY_PEM,
  })
  await registry.approve('teammind')
}

const documentsList: ToolHandler = async (args, ctx) => {
  // ctx.hostId, ctx.tenantId, ctx.userId, ctx.scopes, ctx.actorClass
  return { documents: [], total: 0 }
}

const documentsCreate: ToolHandler = async (args, ctx) => {
  const { title } = args as { title?: string }
  if (!title) throw { code: 'invalid_args', message: 'title required' }
  // ... persist via @nexus-mindgarden/plugin-storage-foundation ...
  return { id: 'new-uuid', title }
}

const app = createBridgeApp({
  manifest,
  registry,
  toolHandlers: {
    'documents.list': documentsList,
    'documents.create': documentsCreate,
  },
})

// env-first, IMMER — niemals den Manifest-Port hart verdrahten (#110).
// Host-verwaltet setzt der Host die Variable (mit Instanz-Offset!),
// selbstverwaltet dein launchd/systemd. Der Manifest-Port ist nur Dev-Fallback.
const port = resolvePort()
serve({ fetch: app.fetch, port })
console.log(`Plugin-Bridge live on :${port}`)
```

---

## 5.5 render-ui Wire-Spec (canonical aus V8-Side, Reference-Implementations)

`POST /plugin-bridge/v1/render-ui` ist der Endpoint über den Hosts (V8/Theseus/MarkView/etc.) Plugin-UI per Route-Pfad anfordern. Foundation `RenderUiRequestSchema` + `RenderUiResponseSchema` matchen canonical wire-shape aus V8 ([`docs/PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md) §POST /plugin-bridge/v1/render-ui).

### 5.5.1 Request-Body

```json
{
  "route_path": "/dokumente/edit/abc-123",
  "tenant_id": "<uuid>",
  "user_id": "<uuid>",
  "context": { "<arbitrary>": "<json>" }
}
```

- **`route_path`** muss mit `/` starten (Zod-validated in Foundation)
- **`bridge_token`** ist NICHT im Body — kommt im `Authorization: Bearer <jwt>` Header (Ed25519 V8-signed, JWT-claims tragen plugin_id/tenant_id/user_id/scopes)
- **`theme` / `locale`** sind aktuell NICHT canonical im Request. Wenn Plugin theme-aware rendert: aus `context` lesen oder via Custom-Element-Attribut (Drift #7 long-form)
- **`X-Request-Id`** Header (optional) — Foundation v0.2.2+ propagiert + echoed automatisch in Response. Distributed-Tracing-Primitive.

### 5.5.2 Response-Shape

```json
{
  "html": "<plugin-myplugin-foo></plugin-myplugin-foo>",
  "scripts": ["/static/ui/bundle-abc.js"],
  "styles": ["/static/ui/styles-abc.css"]
}
```

Relative Script/Style-URLs werden Host-Side gegen `service_endpoint` aufgelöst (V8 PR 26 — `/static/ui/bundle.js` → `http://127.0.0.1:3600/static/ui/bundle.js`).

### 5.5.3 Reference-Implementations

| Side | Role | File |
|---|---|---|
| **V8 Frontend-Render** | catch-all mounts plugin route + lazy-load ESM scripts | `apps/host/src/routes/(app)/plugins/[plugin_id]/[...path]/+page.svelte` |
| **V8 Bridge-Client (server-side caller)** | `bridgeRenderUi` | `packages/plugins/src/server/bridge-client.ts:401-426` |
| **MarkView Producer** | `routeBundles`-Pattern | `apps/markview-plugin/src/server/render-ui.ts` |
| **ET-Mind Producer** | 5 Custom-Elements aus M3 (post-`23d8408`) | `packages/etmind-bridge/src/server.ts` |
| **EA-Mind Producer** | 3 Custom-Elements `<plugin-eamind-{overview,kunden,angebot}>` | `@eamind/bridge/src/server.ts` |

**Foundation-implementation:** wenn du `createBridgeApp({renderUi: handler})` passt + dein `handler` returnt `{html, scripts, styles}`, ist die Wire-Shape automatisch canonical. Plus `staticUiHandler` (v0.2.0+) für die `scripts:`-URLs path-traversal-safe.

### 5.5.4 Drift-Catalog (Cross-Repo Status)

- **V8 ↔ Theseus render-ui**: keine bekannten Wire-Mismatches (msg #335)
- **Drift #103** canonical error-shape `{error:{code,message,details?}}` für 4xx/5xx gilt
- **Pfad-C-Collab `collab`-Block** (markview Pattern): wenn Host mit `relay_url` registriert, render-ui darf optional `collab`-Block emittieren (`relay_url + channel_id + snapshot_endpoint`). Aktuell crosstask-BACKLOG bei V8, Foundation noch nicht baked-in (geplant für v0.3.0+ wenn V8 canonical adoptiert)

---

## 6. Layer-4-Walkthrough — UI-Component (Svelte 5)

```svelte
<!-- packages/my-plugin-svelte/src/components/MyView.svelte -->
<script lang="ts">
  import {
    bridgeAttrPropsMapping,
    dispatchAskKiara,
    trimToMaxBytes,
    type BridgeAttrs,
  } from '@nexus-mindgarden/plugin-svelte-foundation'

  // Drift #7 mitigation: long-form props mit explicit attribute-mapping
  let { bridgeToken, bridgeEndpoint, hostId, tenantId, userId, theme,
        documentId } = $props()

  let host: HTMLElement
  let content = $state('')

  async function loadDocument() {
    const r = await fetch(`${bridgeEndpoint}/plugin-bridge/v1/execute-tool`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool_name: 'documents.list',
        arguments: { id: documentId },
        actor_class: 'user',
        tenant_id: tenantId,
        user_id: userId,
      }),
    })
    const result = await r.json()
    if (result.ok) content = result.result.content
  }

  function askKiara() {
    const trimmed = trimToMaxBytes(content)
    dispatchAskKiara(host, {
      context: 'document-detail',
      document_id: documentId,
      full_content: trimmed.text,
      full_content_truncated: trimmed.truncated,
      capabilities: ['markdown'],
    })
  }

  $effect(() => { void loadDocument() })
</script>

<svelte:options
  customElement={{
    tag: 'plugin-my-plugin-view',
    shadow: 'open',
    props: {
      ...bridgeAttrPropsMapping(),
      documentId: { attribute: 'document-id' },
    },
  }}
/>

<div bind:this={host}>
  <button onclick={askKiara}>Frag Kiara</button>
  <pre>{content}</pre>
</div>

<style>
  /* Theme-Tokens via @nexus-mindgarden/plugin-svelte-foundation/theme generated */
  /* see packages/my-plugin-svelte/build.mjs */
</style>
```

### 6.1 Build-Pipeline

```ts
// packages/my-plugin-svelte/build.mjs
import esbuild from 'esbuild'
import sveltePlugin from 'esbuild-svelte'
import {
  buildThemeCss,
  pluginBundleConfig,
  nodeBuiltinsStubPlugin,
} from '@nexus-mindgarden/plugin-svelte-foundation/build'

const themeBlock = buildThemeCss('mp')  // mp = my-plugin prefix

await esbuild.build({
  ...pluginBundleConfig({
    componentTag: 'plugin-my-plugin-view',
    entry: 'src/components/MyView.svelte',
    outdir: 'dist/ui',
  }),
  plugins: [sveltePlugin({ /* svelte options */ }), nodeBuiltinsStubPlugin()],
})
```

---

## 7. Cross-Repo-Coordination

Plugin-Provider arbeitet typischerweise mit 1-3 Hosts (V8 + Theseus + FamilyMind). Coordination passiert via:

### 7.1 shared.md (Cross-CC Notes)

Plugin-Provider-CC reads shared notes von V8/Theseus/MarkView/etc. Pattern:

```sh
# Pfad
cat "$HOME/Library/Application Support/TeamMindTerminal/shared.md"
```

Entries werden chronologisch appended. Cross-Repo-Drifts werden hier bemerkt + gefixt.

### 7.2 Kanban-CLI (Cross-Repo Tasks)

```sh
export TM_KANBAN_ACTOR="my-plugin-cc"

# Was wartet auf mich?
kanban list --assignee=$TM_KANBAN_ACTOR --status=todo

# Cross-Repo-Anforderung an V8:
kanban create "Manifest-Refresh-Endpoint" --repo=TeamMindV8 --assignee=teammindv8-cc --priority=2

# Status-Update:
kanban comment t_abc123 "Bridge-fix landed in commit X"
```

### 7.3 Drift-Handling

Wenn Cross-Repo-Drift discovered (z.B. wire-format-mismatch):
1. Document in plugin's `docs/CROSS-REPO-LESSONS.md` (range #100+)
2. Broadcast via shared.md mit cross-ref auf canonical V8 numbering
3. Bei wider-impact: V8-CC kanban-task für canonical-numbering re-sync

---

## 8. Plugin-Branding & Favicon

**Pflicht für alle Plugins.** Plugin-Service MUSS bei `GET /favicon.ico` auf seinem `distribution.service_endpoint` antworten:

| Anforderung | Wert |
|---|---|
| HTTP-Status | 200 |
| Content-Type | `image/x-icon`, `image/png`, oder `image/svg+xml` |
| Auth | **KEINE** — Host's `<img>`-Tag kann keinen Bearer-Header mitschicken |
| Dimensionen | ≥ 32×32, quadratisch |
| Cascade | Bevorzugt zusätzlich `/favicon.png` + `/apple-touch-icon.png` als Fallbacks (Web-Standard) |

### 8.1 Warum

Hosts (Theseus, V8, TeamMind, FamilyMind, künftige) zeigen das Asset in:
- **Sidebar-Launcher-Button** (≈20×20, border-radius 4px, `object-fit: contain`)
- **Plugin-Banner-Header** über dem gemounteten Plugin-UI (≈24×24)

Falls der Endpoint fehlt oder fehlschlägt (401/403/404/network-error/wrong-content-type/decode-error), fallen Hosts auf die Initiale des Plugin-Display-Names zurück (z.B. "M" für MarkView, "K" für Kanban). Das ist ein UX-Downgrade — **ship the favicon**.

### 8.2 Implementation-Hint

Plugin-Bridges die bereits `/static/<bundle>.js` über einen `staticHandler` servieren können denselben Pattern nutzen. Zwei Optionen:

```ts
// Option A: eigener Endpoint
app.get('/favicon.ico', (req, res) => {
  res.type('image/x-icon').sendFile(path.join(__dirname, 'assets/favicon.ico'))
})

// Option B: unter /static/favicon.ico (falls staticHandler-Root passt)
// keine Code-Änderung nötig, nur File ablegen
```

### 8.3 Verifikation

```sh
curl -sI http://<endpoint>/favicon.ico | head -1
# erwartet: HTTP/1.1 200  (oder HTTP/2 200)

curl -sI http://<endpoint>/favicon.ico | grep -i content-type
# erwartet: image/x-icon  |  image/png  |  image/svg+xml
```

Dann in Theseus: Plugin Disable+Enable → Sidebar + Banner sollten das echte Icon zeigen.

### 8.4 Cross-Repo-Source

Convention etabliert von Theseus-CC 2026-05-11 (shared.md 17632) nach User-Direktive. MarkView + Kanban + alle Plugin-Provider commit-pflicht ab nächstem Deploy. Plugin-Template-Skeleton-Default kommt mit (siehe `templates/<starter>/assets/favicon.ico`).

---

## 9. Pre-Drift-Checklist

Vor 1st-Release:

- [ ] All Foundation-Packages installed + workspace tests passing
- [ ] manifest.yaml validates (Foundation `loadManifest` parses ohne error)
- [ ] All MCP-Tools have input_schema + output_schema (Phase-3 Extended Form)
- [ ] All UI-Components long-form customElement mit explicit attribute-mapping (Drift #7)
- [ ] esbuild-bundle: external=[] + nodeBuiltinsStubPlugin (Drift #13/#20+#21)
- [ ] CSP-allowed-origins documented für deployment
- [ ] manifest_hash in /health-Response (Live-Re-Registration support)
- [ ] **`/favicon.ico` Endpoint serviert ≥ 32×32 PNG/ICO/SVG (siehe §8)**
- [ ] Cross-Repo-Live-Smoke gegen mindestens einen Production-Host
- [ ] CROSS-REPO-LESSONS.md mit plugin-internal Drifts (#100+ range)
- [ ] CLAUDE.md (siehe `CLAUDE-TEMPLATE.md`) für AI-CC-Workforce-coordination

---

## 10. Production-Deployment

### 10.1 Distribution

| Type | Wann |
|---|---|
| `external-service` | Plugin ist standalone-Server (Bridge auf eigenem port) |
| `library` | 🚫 **nicht verwenden** — im Host-Schema als „future" reserviert (Plugin im Host-Prozess, kein eigener Server), **nirgends implementiert**. Validiert und lädt dann nichts; wird nur als Negativ-Zweig gelesen (`!== 'external-service'`). Hinweis **A7** meldet es. |
| ~~`embedded`~~ | 🚫 **existiert nicht.** Kein Host kennt den Wert — ein Manifest damit wird **abgelehnt** (A1). Bis `plugin-bridge-foundation@0.14.0` stand er faelschlich in unserem Schema. |

### 10.2 Service-Discovery

Plugin-Bridge in Production läuft auf dedicated host (z.B. `127.0.0.1:<port>` für desktop-app — siehe Drift #203 in §4.1 — oder cloud-service für SaaS).

Host-Side `service_endpoint` wird im Plugin-Manifest deklariert. Hosts lesen das beim Activate + speichern in `plugin_activations.service_endpoint`-row.

### 10.3 Multi-Host-Auth

> 🚨 **`autoAccept: false` ist NICHT der pauschale Production-Default** — diese Seite hat genau das früher behauptet und damit Aktivierungs-Deadlocks beim Endkunden verursacht (med-plug #8442, CHECK-Mind). **Es hängt davon ab, wer dich startet:**
>
> | Lebenszyklus (Achse 1) | Richtig | Warum |
> |---|---|---|
> | **host-verwaltet** — nur ein Host startet dich, Bundle im Slot | **`autoAccept: true`** | Der Host hat deinen Prozess auf Loopback gestartet und ist die Trust-Root. Ohne das landet er auf `pending` → **alles** 401't, auch `/health`, **ohne Ausweg** |
> | **selbstverwaltet** — eigene App, launchd/systemd, eigener Updater | **Allowlist** `{host_id → erwarteter Fingerprint}`, sonst ablehnen | `register-host` ist unauthentifiziert; jeder auf Loopback kann es rufen |
>
> 🔐 **Entscheide das explizit, leite es NICHT aus `PLUGIN_BRIDGE_PORT` ab.** Diese Seite hat die Variable früher als Host-Spawn-Detektor empfohlen. Seit #110 liest sie jedes Plugin, und ein selbstverwalteter Dienst **setzt sie sich selbst** — als Trust-Signal beweist sie nichts mehr. Du weißt, ob dich ausschließlich ein Host startet; schreib es als Konstante hin.
>
> **Und die Oberfläche (Achse 2) ist eine eigene, kombinierbare Frage:** hast du eine **Freigabe-Fläche** für den Nutzer, kannst du zusätzlich `autoAccept: false` fahren und unbekannte Hosts auf `pending` legen, statt sie hart abzulehnen. Das komponiert mit der Allowlist (bekannte Fingerprints automatisch, alles andere zur Freigabe) — es ersetzt sie nicht. **Ohne Fläche ist `pending` eine Sackgasse**, dann bleibt nur Allowlist-oder-ablehnen.
>
> **Niemals an `NODE_ENV` koppeln.** Ein Bundle läuft beim Kunden in Produktion — die Kopplung erzeugt genau dort den Deadlock. Volle Begründung: §4.9 und §3 der `PLUGIN-BRIDGE-WIRE-SPEC`.

Der Host ruft `register-host` mit seinem Public-Key. Landet der Record auf `pending`, muss der Nutzer ihn freigeben können — hast du dafür keine Oberfläche, ist `pending` eine Sackgasse.

**Persistent HostKeyRepo (Production)** — `InMemoryHostKeyRepo` aus `@nexus-mindgarden/plugin-bridge-foundation` ist nur für Dev/Tests. Production-Plugin-Provider wählen einen der zwei baked-in persistent Adapters. **Lege die Datei ins `PLUGIN_DATA_DIR`** (§4.9.3) — unter dem Bundle-Pfad ist sie beim nächsten Update weg.

**JSON-File** (v0.1.1+) — single-process Plugin-Bridges mit niedrigem Write-Volume. Atomic `.tmp` + rename. Keine Native-Dependency.

```ts
import { HostKeyRegistry, JsonFileHostKeyRepo } from '@nexus-mindgarden/plugin-bridge-foundation'
import { join } from 'node:path'

// host-autoritativ, überlebt Updates — NICHT './data/…' unter dem Bundle
const repo = new JsonFileHostKeyRepo({ path: join(resolveDataDir(), 'host-keys.json') })
const registry = new HostKeyRegistry(repo, {
  autoAccept: NUR_VOM_HOST_GESTARTET, // explizite Autorenentscheidung, KEINE env-Detektion
})
```

**SQLite** (v0.2.1+) — Plugin-Bridges mit existing SQLite-State (Electron-Apps, Desktop-Hosts mit `<userData>/...db`). Drop-in für bestehende Schemas via `CREATE TABLE IF NOT EXISTS`:

```ts
import Database from 'better-sqlite3'
import { HostKeyRegistry, SqliteHostKeyRepo } from '@nexus-mindgarden/plugin-bridge-foundation'

// NICHT './data/…' — das liegt unter dem Bundle und ist beim nächsten Update weg
const db = new Database(join(resolveDataDir(), 'plugin-bridge.db'))
const repo = new SqliteHostKeyRepo(db, { tableName: 'host_keys' })
repo.ensureSchema()  // idempotent, no-op auf bestehenden Tabellen mit matching Spalten
const registry = new HostKeyRegistry(repo)
```

Foundation-default Spaltenset: `host_id`, `public_key_pem`, `status`, `fingerprint`, `registered_at`, `approved_at`. Extra plugin-spezifische Spalten (z.B. `last_used_at`, `relay_url`) bleiben auf der Tabelle unangetastet — Foundation touched nur die definierten Spalten.

Für Multi-Process-Plugin (rare): Postgres- oder Redis-backed Repo via Custom `HostKeyRepo`-Implementation.

### 10.5 Wann brauche ich Foundation überhaupt?

Foundation lohnt sich wenn dein Plugin **runtime-discovery** braucht — Host listet Plugin-Components dynamisch, Bridge-Token-Auth-Flow, oder Cross-Frame-Rendering via `/render-ui`. Lohnt sich NICHT wenn dein Consumer-Pfad **build-time-resolve** ist (pnpm/npm-import + dep-tree-resolve, vendoring-friendly, kein server-side state).

**Reference-Implementations (Plugin-Provider mit Foundation):**

| Plugin | Stack | Foundation-Mode |
|---|---|---|
| **plug-elec (ET-Mind)** | TS + Hono Bridge | Hand-roll prior to v0.1.0; v0.2.1+ migrating to `createBridgeApp` (msg #302–304) |
| **oracle (plug-ea / EA-Mind)** | TS + Hono Bridge | v0.2.0 atomic-replace candidate (msg #265) |
| **markview** | TS + Electron-embedded Bridge | v0.2.1+ candidate für `SqliteHostKeyRepo` drop-in (msg #299, #302) |

**Counter-Example: Library-Only-Path-via-pnpm-sync:public**

Design-Mind ([MrDewitt88/Design-Mind](https://github.com/MrDewitt88/Design-Mind), v0.1.0 tag `0674bbe`) ist explizit **kein** Plugin-Provider — es ist eine UI-Component-Library die per `pnpm add github:MrDewitt88/design-mind-tokens#v0.1.0` + `design-mind-ui#v0.1.0` als build-time-resolve konsumiert wird. Konkrete Templates für Konsumenten:

- [`examples/familymind-brand/theme.css`](https://github.com/MrDewitt88/Design-Mind/tree/main/examples/familymind-brand) — FamilyMindV2 skin (teal + warm off-white)
- [`examples/teammind-corporate/theme.css`](https://github.com/MrDewitt88/Design-Mind/tree/main/examples/teammind-corporate) — slate + indigo
- [`examples/eamind-print/theme.css`](https://github.com/MrDewitt88/Design-Mind/tree/main/examples/eamind-print) — AAA-contrast paper-optimized

Plus [`docs/THEMING.md`](https://github.com/MrDewitt88/Design-Mind/blob/main/docs/THEMING.md#examples-gallery) mit WCAG-AA contrast-audit.

Design-Mind's Foundation-Adoption-Decision (msg #261): *"Plug-tmpl streicht uns aus Reference-Implementations-Liste — wir sind kein Plugin-Provider sondern Library-Consumer-Pattern. Mode-A deckt alle aktuellen Use-Cases ab."*

**Heuristik:**
- Eigener HTTP-Endpoint + Bridge-Token-Auth-Flow → **Foundation** (Plugin-Bridge-Pattern)
- npm/pnpm-Distribution + `--*` CSS-vars + Web-Components als Library-Atoms → **Counter-Example** (kein Foundation needed)

Beides ist legitim. Foundation ist Pflicht nur wenn dein Plugin am Plugin-Bridge-Protocol teilnimmt.

### 10.4 Versioning

`manifest.version` (semver). Plus `manifest_hash` in /health für Live-Re-Registration. Hosts cachen + diff-en — bei hash-change re-fetch + re-register-capabilities ohne Plugin-Down-Time.

---

## 11. `agent.complete` — canonical Plugin-to-LLM Tool (v0.3.0+)

> **Pflicht-Pattern** für Plugin-Authors die LLM-Calls machen. Direct-HTTP zu LM Studio / OpenAI ist Anti-Pattern.

Contract etabliert in chatbus thread="contracts" 2026-05-21 (msg #443-449). Theseus shipped `v0.15.0-agent-complete-endpoint` (commit `51921ff`). V8/v8-fam dispatchen via `/mcp/v1/call-tool` per Design-Y zu Theseus' `POST /agent/complete`.

> **See also (consumer-side perspective):** [Mind-Canva's `CROSS-PLUGIN-INTEGRATION.md`](https://github.com/MrDewitt88/Mind-Canva/blob/main/docs/CROSS-PLUGIN-INTEGRATION.md) — concrete consumer→consumer wire-recipes (`layout.create`, `export.pdf`, `brand_kit.get`) including auth-flow walkthrough (§4) and smoke-test pattern (§5). This Provider-Guide is provider-perspective; Mind-Canva's cookbook is the orthogonal consumer-perspective on plugin-to-plugin integration via MCP. Both co-exist as paired cluster-docs.

### 11.1 Warum nicht direct-HTTP?

Wenn N Plugins jeweils ihren eigenen OpenAI/LM-Studio-Client haben:

| Risiko | Direct-HTTP-each | Via `agent.complete` |
|---|---|---|
| LM-Studio inflight-limit (typ. 1-2) | N racing clients, 1 wins, others fail | 1 serialisiertes Queue |
| Cloud-Consent-Gates | jedes Plugin re-implementiert (oder vergisst) | 1× zentral in Theseus |
| Prompt-Cache-Hit-Rate | N× cold (Sticky-Session-Affinity broken) | 1 sticky cache, echte cache-savings |
| Tenant-Policy / Audit | N× implementiert | 1× zentral |
| Provider-Token-Rotation | N Credential-Pools | 1 |

Das LM-Studio-Inflight-Argument allein zerlegt direct-HTTP für jedes Multi-Plugin-Setup.

### 11.2 Foundation-Helper

> **v0.7.0+ — drei Transport-modes verfügbar.** Wähle nach **wo dein Code läuft** (DOM-Renderer vs Node-Bridge) + **welcher Token-Source** verfügbar ist. Decision-tree am Ende von §11.2.

#### 11.2a — Embedded callMcp (NEUE Standard für DOM-Plugins, v0.7.0+)

Wenn dein LLM-call **im Renderer** läuft (Svelte 5 custom-element, lit-element, etc.):

```ts
import { callMcp } from '@nexus-mindgarden/plugin-bridge-foundation/runtime'

const result = await callMcp<{ text: string; toolCalls: unknown[] }>(
  mount,
  'agent.complete',                  // un-prefixed host-shared tool (v0.7.0+ allowlist)
  {
    messages: [
      { role: 'system', content: 'Du bist ein hilfsbereiter Layout-Assistent.' },
      { role: 'user', content: 'Schlage 5 Headlines für Frühlingsfest-A4-Flyer vor.' },
    ],
    responseFormat: { type: 'json_schema', schema: zodToJsonSchema(HeadlineSchema) },
    maxTokens: 200,
  },
  { actorClass: 'user' },             // 'user' = user-initiated, 'system' = autonomous
)
// result.text = AgentCompleteResponse.text  (NICHT choices[0].message.content)
const headlines = HeadlineSchema.parse(JSON.parse(result.text))
```

**Kein HTTP, kein Token, kein bridge-endpoint.** Der Host (myMind) routet den `plugin:mcp-call` CustomEvent direkt zu Theseus' `runHeadlessComplete`. Cross-Ref: `CROSS-PLUGIN-MCP-CALL-COOKBOOK.md` §8 (Host-Shared Tools).

#### 11.2b — Standalone HTTP direct-to-host (NEU v0.7.0+, preferred für Bridge-Plugins)

Wenn dein LLM-call **im Node-Bridge-Prozess** läuft (kein DOM, z.B. mind-canva `:3670` external-service, apex2d `:3690` reverse-call-Handler):

```ts
import { createAgentComplete } from '@nexus-mindgarden/plugin-bridge-foundation/agent-complete'

const agentComplete = createAgentComplete({
  bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',  // direct Theseus agent-socket
  transport: 'agent-socket-direct',                         // bare body, kein V8-envelope
  tokenResolver: () => bridgeTokenStore.current(),          // per-plugin handshake-JWT
  callerId: 'my-plugin@bridge',                             // optional forensic-tracing
})

const result = await agentComplete({
  messages: [
    { role: 'system', content: 'Du bist ein hilfsbereiter Layout-Assistent.' },
    { role: 'user', content: 'Schlage 5 Headlines für Frühlingsfest-A4-Flyer vor.' },
  ],
  responseFormat: { type: 'json_schema', schema: zodToJsonSchema(HeadlineSchema) },
  maxTokens: 200,
  cacheRetention: 'short',
})

if (result.error) {
  logger.warn('agent.complete error', { code: result.error.code, message: result.error.message })
  throw { code: result.error.code, message: result.error.message }
}
const headlines = HeadlineSchema.parse(JSON.parse(result.text))
```

**Token-Source:** der `tokenResolver` gibt das per-plugin-activation-JWT zurück, das deine Bridge bei jedem `/plugin-bridge/v1/handshake` als `Authorization: Bearer …` empfängt (gleicher Token den du für `/host-bridge/v1/execute-tool` reverse-calls nutzt). **Kein neuer Token, kein `MC_AGENT_TOKEN` env-var nötig** sobald v0.7.1's `createHandshakeTokenStore()` da ist. Interim siehe Cookbook §8.5.2 für die capture-at-handshake-Middleware-Pattern.

**Warum direct-to-host statt V8?** myMind ist kanonischer Host (2026-05-31). Der alte V8 → `/mcp/v1/call-tool` → :3400 hop funktioniert **weiter** (additive back-compat), ist aber **nicht mehr nötig**: ein hop weniger, keine V8-tenant-Bindung, per-plugin token statt shared-static.

#### 11.2b.1 — Image-Tools: andere Wire als agent.complete

`image.generate` und `image.remove_background` (b)-Pfad nutzen **NICHT** `/agent/complete`-style direct-endpoints, sondern den **Reverse-Call** `POST :3400/host-bridge/v1/execute-tool`:

```ts
// Today (pre-v0.7.1, manual fetch):
async function callImageTool(toolName: string, args: unknown) {
  const token = await handshakeTokenStore.current()    // siehe §11.11
  const res = await fetch('http://127.0.0.1:3400/host-bridge/v1/execute-tool', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tool: toolName,
      args,                          // ⚠ KEY IS "args" — NICHT "arguments"!
    }),
  })
  const body = await res.json()
  if (!body.ok) throw new Error(`${body.error.code}: ${body.error.message}`)
  return body
}

const result = await callImageTool('image.remove_background', {
  image_base64: srcPng,
  mime: 'image/png',
})
// ⚠ Lese result.metadata.image_base64 — NICHT result.value
// (result.value ist base64-FREIE display-text; die PNG-bytes leben in metadata)
const pngB64 = result.metadata.image_base64
```

**Token-Asymmetrie (kritisch):**

| Endpoint | Static `MC_AGENT_TOKEN` | Per-plugin handshake-JWT |
|---|---|---|
| `/agent/complete` | ✅ (additive back-compat) | ✅ |
| `/host-bridge/v1/execute-tool` (image.*) | ❌ NICHT supported | ✅ ONLY |

→ Image-tools im (b)-Pfad sind **handshake-only** — kein interim-static-token workaround möglich. Wenn du heute schon agent.complete(b) mit static-token willst, geht das; image-tools brauchen handshake-JWT-exposure (v0.7.1 + §8.5.2 interim).

**Foundation v0.7.1+ canonical (recommended over manual fetch):**

```ts
import {
  createHandshakeTokenStore,
  createReverseCallClient,
} from '@nexus-mindgarden/plugin-bridge-foundation/auth'

const tokenStore = createHandshakeTokenStore()
const app = createBridgeApp({
  ...,
  handshakeTokenStore: tokenStore,    // v0.7.1+ auto-captures Bearer at /handshake
})

const reverseCall = createReverseCallClient({
  hostEndpoint: 'http://127.0.0.1:3400',
  tokenStore,
})

// Typed wrapper für image-tools — extrahiert metadata.image_base64 automatisch:
const img = await reverseCall.executeImageTool('image.remove_background', {
  image_base64: srcPng,
  mime: 'image/png',
})
// img.image_base64 = PNG bytes, img.mime, img.width, img.height — flat shape
// Plus client-side prefix-guard (forbidden_prefix throw vor network call)
```

Cross-ref Cookbook §8.4 + §8.5.2 für vollständige reverse-call-wire-details inkl. workspace-anchor-allowlist (`projects.*` / `contacts.*` / `calendar.*` / `notes.*` / `attachments.*` + `image.*`).

#### 11.2c — Legacy V8-bridge (v0.3.0–v0.6.x, weiterhin supported)

Wenn dein Plugin **innerhalb einer V8/TeamMind-tenant** läuft und gegen den existing V8-bridge gebaut hat:

```ts
const agentComplete = createAgentComplete({
  bridgeEndpoint: ctx.bridgeEndpoint,      // M17 accept-response (V8 :3100 / v8-fam :3050)
  sessionToken: ctx.sessionToken,          // M17 accept-response static-token
  // transport omitted → defaults to 'v8-bridge' (back-compat)
})
```

Identisch zu v0.6.x wire-output. Migration ist **opt-in per call-site** — v0.6.x code läuft weiter, nur neue call-sites greifen den (b)-direct-mode.

#### Decision-Tree

```
Wo läuft dein LLM-call?
├── DOM-Renderer (Svelte/lit/custom-element)
│   → §11.2a callMcp('agent.complete')  ★ neue Standard
│
└── Node-Process (Bridge / external-service / reverse-call-handler)
    │
    ├── Plugin läuft in V8/v8-fam tenant + hat M17 token
    │   ├── Nur back-compat, kein refactor:
    │   │   → §11.2c V8-bridge (default transport, sessionToken)
    │   └── Migration zu direct-to-host (preferred neu):
    │       → §11.2b agent-socket-direct + tokenResolver
    │
    └── Plugin läuft standalone (kein V8 im loop):
        → §11.2b agent-socket-direct + tokenResolver  ★ einzige Option
```

**Alle drei Modes nutzen den gleichen Handler** (Theseus' `runHeadlessComplete`) und das gleiche frozen schema (`@theseus/agent-complete-schema` v0.15.0). Nur transport-layer + auth-source unterscheiden sich.

### 11.3 Capability-Request bei M17 guest-registration

Plugin-Authors fordern beim M17-guest-registration die Capability an:

```json
{
  "protocol_version": 1,
  "agent_id": "my-plugin-uuid",
  "display_name": "My Plugin",
  "tenant_id": "dev",
  "capabilities_requested": ["agent.llm:invoke", "fs.read:workspace", "memory.read"]
}
```

V8/v8-fam policy-intersection: `agent.llm:invoke` ist in der `ki-user`-Policy default-allowed. Host kann das per-tenant deaktivieren wenn nötig.

### 11.4 Granite-Floor + agent.complete

Granite-Floor-Philosophy (siehe Mind-Canva / Wiz-Mind `docs/GRANITE-FLOOR.md`) bleibt **Caller-Verantwortung**:

- **JSON-Schema-Constraint:** Caller passiert `responseFormat: { type: 'json_schema', schema }` — Provider-side enforced
- **Max-Token-Caps:** Caller setzt `maxTokens` per Feature-Need (Headline-Suggest 200, Layout-Critique 400, etc.)
- **defense-in-depth-zod:** auch wenn Provider strict-output enforced, Caller validated Output mit zod nochmal (Cloud-Fallback hat oft schwächere grammar-constraints)
- **Pilot-Test-Suite:** Caller's `test/granite-pilot/*.test.ts` muss weiter ≥80% pass-rate haben — `agent.complete` ändert nichts an dem Architectural-Commitment

#### 11.4.1 `response_format`: backend-portability (cluster-evidence)

> **TL;DR:** Foundation + Theseus-Host akzeptieren alle 3 `response_format`-Typen (`text` / `json_object` / `json_schema`). **Aber: lokale Modell-Backends (LM Studio / Granite / Ollama / vLLM) lehnen `json_object` häufig ab.** Wenn dein Plugin gegen lokales Granite läuft → **bevorzuge `json_schema` mit offenem object-schema** (`strict: false`-äquivalent) statt `json_object`.

**Source-of-truth-table** (per agent #4442 host-truth-ruling + oracle #4438 endorsement):

| Layer | `text` | `json_object` | `json_schema` |
|---|---|---|---|
| Foundation `@nexus-mindgarden/plugin-bridge-foundation/agent-complete` | ✅ | ✅ | ✅ |
| Theseus-Host (`@theseus/agent-complete-schema` + provider `toOpenAIResponseFormat`) | ✅ accepts + forwards | ✅ accepts + forwards | ✅ accepts + forwards |
| Downstream backends (LM Studio, Granite 4-h-tiny, Ollama, vLLM) | ✅ ubiquitous | ⚠ **often rejected** | ✅ widely supported |
| OpenAI / Anthropic Cloud | ✅ | ✅ | ✅ (strict + non-strict) |

**Konkretes evidence:** apex2d #4416 + mind-canva — beide sahen `chatJSON`-calls brechen mit `responseFormat: { type: 'json_object' }`. Backend (LM Studio in local-Granite-flow) returned schema-error, NICHT host-side rejection. Foundation+Host hatten den request korrekt weitergereicht.

**Empfehlung für portabilität** (lokale Granite-Setups dominieren cluster-deployment):

```ts
// ❌ Avoid (works in cloud, often breaks local Granite):
const result = await agentComplete({
  messages: [...],
  responseFormat: { type: 'json_object' },
})

// ✅ Prefer (works in cloud AND local Granite, full schema-discipline):
const result = await agentComplete({
  messages: [...],
  responseFormat: {
    type: 'json_schema',
    schema: zodToJsonSchema(MySchema),
  },
})

// ✅ Acceptable equivalent of json_object (when you want flexible JSON without strict shape):
const result = await agentComplete({
  messages: [...],
  responseFormat: {
    type: 'json_schema',
    schema: { type: 'object' },  // open-ended object — like json_object but backend-portable
  },
})
```

**Warum Foundation `json_object` weiter exposed** statt es zu entfernen: Foundation ist **byte-aligned mit Host** (`@theseus/agent-complete-schema` v0.15.0 FROZEN). Beide layers erlauben alle 3 typen. Das **runtime-capability-gap** zwischen Host und downstream-Backend ist eine separate concern, die durch docs + caller-discipline addressiert wird (kein schema-tightening, weil schema = wire-contract, nicht runtime-policy).

**Wenn du gegen Cloud-only (OpenAI/Anthropic) baust:** `json_object` ist fine. Wenn dein plugin gegen lokales Granite läuft (= cluster-default): `json_schema` ist der portable-default.

Cross-ref:
- chatbus msg #4416 apex2d (original finding) + #4442 agent host-truth + #4438 oracle ruling §4
- `@theseus/agent-complete-schema` (index.ts:39-43) — canonical wire-shape

### 11.5 Cache-Retention Pattern

Caller-side decision per call:

| Wert | TTL | Use-Case |
|---|---|---|
| `'none'` | kein Marker | hohe Prompt-Entropy (jeder Call differs substantiell) |
| `'short'` | ~5min (Anthropic-compat) | ad-hoc-User-Triggers, hits innerhalb Minuten erwartet |
| `'long'` | ~1h (Anthropic-compat) | session-long prompt-prefix |

Bei reinem LM Studio kein-Effekt. Bei späterem Cloud-opt-in (User-triggered) Marker schon korrekt gesetzt → kein Code-Change in Migration-Wave.

### 11.6 Dev-Preview Anti-Pattern (mind-canva Reference)

Mind-Canva hat einen `OpenAIProvider` als **dev-only-fallback** für `pnpm dev:preview` (standalone-Browser ohne V8/Theseus). Conditions die das akzeptabel machen:

1. **Doc-stamp** in CLAUDE.md / README: "dev-only, bypasses cloud-consent + tenant-policy + audit"
2. **Runtime feature-flag:** Constructor wirft wenn `MC_ALLOW_DIRECT_HTTP_PROVIDER` env-var nicht gesetzt ist. Default in production = unset.
3. **CI-grep:** `pnpm test` runs `scripts/check-no-direct-provider-in-prod.mjs` — Bridge-side darf NIE OpenAIProvider importieren

Wenn alle drei drin sind, bleibt dev-experience nicht trocken bei standalone-Plugin-Entwicklung. Sonst: weg damit + nur `agent.complete`-Pfad.

### 11.7 Error-Envelope (Drift #103 cross-language)

`agent.complete`-response ist NIE thrown bei server-side errors. Stattdessen:

```json
{
  "text": "",
  "toolCalls": [],
  "stopReason": "error",
  "error": {
    "code": "rate_limited",
    "message": "LM Studio inflight-limit exceeded; retry in 30s",
    "retryable": true
  }
}
```

Foundation's `createAgentComplete` throws nur bei **transport-failures** (network-error) und **schema-mismatches** (response-body ist nicht spec-konform). Server-side-errors landen im envelope.

**Convenience:** `agentCompleteText(client, req)` throws auch bei error-envelope — wenn du nur den text willst und das wegabstrahieren möchtest.

### 11.8 X-Request-Id Distributed-Tracing (v0.2.2+)

```ts
const agentComplete = createAgentComplete({
  bridgeEndpoint, sessionToken,
  requestId: parentRequestId,  // propagate from upstream
})
```

Foundation echoed `X-Request-Id` zurück. Wenn Plugin-Authors X-Request-Id von ihrem eigenen incoming-request weiterpropagieren, ist Cross-Service-Trace-Korrelation gratis — vom V8-User-Click bis zum LM-Studio-Token.

### 11.9 Migration-Reihenfolge

Per chatbus consensus (msg #445):

1. **Week 1:** Mind-Canva als first-mover (24-48h migration committed)
2. **Week 1-2:** plug-db (Embeddings + LM-Studio-Probe direct-HTTP-paths)
3. **Week 2:** plug-elec (M3 MCP-UI hat lokale LLM-Hints)
4. **Week 2:** markview, ea-plug, kanban (wenn LLM-Konsum)

V8 selbst ist passive — V8 macht keine LLM-calls direkt, dispatched nur.

### 11.10 Schema-Source-of-Truth

**Canonical**: `@theseus/agent-complete-schema` (Theseus monorepo). plug-tmpl's Foundation-Helper dupliziert die Schemas als **stop-gap** bis Theseus npm-publish'd. Wenn Theseus publishes:

- Foundation v0.3.x bumpst auf peer-dep `@theseus/agent-complete-schema`
- Type-re-exports bleiben kompatibel (semver-stable contract)
- Migration ist `pnpm install`

Bis dahin sind plug-tmpl-Schemas faithful zur Spec (msg #449).

### 11.11 v0.7.0 Migration: tokenResolver + agent-socket-direct

**Foundation v0.7.0 (2026-05-31)** brachte additive transport-mode + tokenResolver — alle v0.6.x callsites laufen unverändert weiter. Du migrierst nur wenn du:

1. **Direct-to-host willst** (kein V8 hop mehr, eigene plugin-bridge-Plugins)
2. **Per-plugin handshake-token** statt shared-static brauchst (token-rotation transparent)
3. **Standalone laufen** willst (kein V8 im loop, eigene `:36xx`-bridge im Node-context)

**3-Schritt-Migration:**

```ts
// Before (v0.6.x — V8-bridge static-token):
const agentComplete = createAgentComplete({
  bridgeEndpoint: 'http://127.0.0.1:3100/mcp/v1/call-tool',
  sessionToken: process.env.AGENT_SOCKET_TOKEN!,
})

// After (v0.7.0+ — direct-to-host per-plugin-token):
const agentComplete = createAgentComplete({
  bridgeEndpoint: 'http://127.0.0.1:3400/agent/complete',   // change 1: direct theseus :3400
  transport: 'agent-socket-direct',                          // change 2: new transport-mode
  tokenResolver: () => bridgeTokenStore.current(),           // change 3: resolver statt statisch
})
```

**Token-source:** der per-plugin handshake-JWT aus `register-tenants` (gleicher den deine bridge für `/host-bridge/v1/execute-tool` hält). Foundation cached automatisch — `tokenResolver` returns current. **Kein neuer Token, kein env-var.**

**Old + new co-exist im gleichen plugin.** v0.6.x-callsites bleiben auf V8-bridge, neue callsites schalten auf direct-mode. Opt-in pro call-site.

**Cross-Repo-Adoption (Wave-Reihenfolge 2026-05-31+):**

| Plugin | Migration | Status |
|---|---|---|
| mind-canva | (b) standalone HTTP — bridge `:3670` | wartet auf Foundation v0.7.0 npm-publish |
| apex2d | (c) beides — embedded (a) callMcp + (b) standalone HTTP | wartet auf Foundation v0.7.0 npm-publish |
| plug-elec | optional migration zu (b) wenn standalone-bridge gewünscht | TBD, nicht blockend |

### 11.12 Host-Shared Tools Beyond agent.complete

`agent.complete` ist 1 von **3 host-shared callMcp-Tools** (v0.7.0+ allowlist, agent's `feat/host-tool-routing` triple-landing 2026-05-31):

| Tool | actorClass v1 | Wire-spec | Use-case |
|---|---|---|---|
| `agent.complete` | `'user'` + `'system'` | `@theseus/agent-complete-schema` | LLM text + tool-call + JSON-mode |
| `image.generate` | `'user'` only | `@theseus/tools-image-schema` | Text-to-image (Bonsai sidecar §2.5) |
| `image.remove_background` | `'user'` only | `@theseus/tools-image-schema` | Alpha-matting (ISNet @imgly §2.6) |

Adding a 4th host-shared tool requires: chatbus contracts-thread RFC + oracle architecture-ruling + host-side `HostToolBindings` allowlist-extension + Foundation re-export + docs update. Don't prefix your own plugin-tools with `image.` / `agent.` — those namespaces are reserved.

Cross-ref `CROSS-PLUGIN-MCP-CALL-COOKBOOK.md` §8 für vollständige host-shared-tools-architecture-details.

---

> **See also (plugin↔host wire-protocol):** [`CROSS-PLUGIN-MCP-CALL-COOKBOOK.md`](./CROSS-PLUGIN-MCP-CALL-COOKBOOK.md) — canonical wire-spec for plugin custom-element bundles dispatching MCP-calls back through the host's IPC layer via Foundation's `/runtime` `callMcp()` helper. 3-side ko-authored from the Wiz-Mind v0.1.0 joint-smoke. Complements §11's plugin-to-LLM `agent.complete`-pattern with plugin-to-host MCP-tool-call-pattern. **§8 Host-Shared Tools** (v0.7.0+) documents the broader host-shared-callMcp-tool model (`image.generate` / `image.remove_background` / `agent.complete`).

---

## 12. Writing Reversible Workarounds

Plugin development in a multi-repo cluster surfaces a recurring tension: the canonical path (e.g. npm-published Foundation packages) takes time to land, but downstream plugins can't wait. They ship a **workaround** — a vendored-tree, a custom helper, a monkey-patch — to unblock themselves. Then, when the canonical path arrives, the workaround has to come out. If the workaround was written without the reversal-path in mind, removing it can be days of detective-work.

This section codifies the **reversal-discipline** that lets workarounds come out cleanly, often in single-digit minutes.

### The pattern

When you ship a workaround, ship **three artifacts** at the same commit:

1. **The workaround itself** — the script, the vendored-code, the monkey-patch
2. **A `WHY` companion-doc** — short markdown file (~30 lines) explaining what the workaround does, why it exists right now, what canonical-state it bridges to
3. **A `REVERSAL-PATH` section** — explicit step-by-step undo-instructions, including the sed-commands, file-deletions, and verification-checks that take the plugin back to the canonical-path-consumption shape

Convention: name the companion-doc by the workaround's domain. E.g. if you vendor-tree Foundation under `vendor/plugin-template/`, name the doc `docs/VENDOR-FOUNDATION.md`. The pairing makes the workaround discoverable from its own location.

### Anatomy of a `WHY` companion-doc

```markdown
# Vendor-Foundation Workaround

## Status
Active workaround. Will be removed when Foundation publishes to npm
(tracked: foundation milestone v0.4.0).

## What this is
Vendor-tree of @nexus-mindgarden/plugin-bridge-foundation at v0.3.3
copied into `vendor/plugin-template/`. `pnpm-workspace.yaml` references
this path. `scripts/setup-foundation.sh` populates the tree from
a git-pinned source.

## Why this exists
Foundation v0.3.0 broke consumer-installs (github-URL without dist/).
v0.3.3 added committed-dist as a bridge but only as a 4-iteration
hotfix. Until npm-publish lands, we vendor to control the upgrade-tempo.

## When to remove
When Foundation v0.4.0 (or any later version) is on npm:
`pnpm view @nexus-mindgarden/plugin-bridge-foundation version`
returns a value.

## Reversal path
See § Reversal below.

## Reversal

1. Confirm npm-published version:
   pnpm view @nexus-mindgarden/plugin-bridge-foundation version
2. Replace vendor-reference in package.json:
   sed -i '' 's|"@nexus/plugin-bridge-foundation": ".*"|"@nexus-mindgarden/plugin-bridge-foundation": "^0.4.0"|g' package.json
3. Remove from pnpm-workspace.yaml:
   yq eval 'del(.packages[] | select(. == "vendor/plugin-template/*"))' \
     -i pnpm-workspace.yaml
4. Delete artifacts:
   rm -rf vendor/ scripts/setup-foundation.sh
   # Also remove "setup:foundation" from package.json scripts
5. Re-install + verify:
   pnpm install
   pnpm test
6. Delete this file: rm docs/VENDOR-FOUNDATION.md
```

### Why this pays off (real reference, anonymized)

A plugin in the `@nexus-mindgarden` cluster shipped a vendored-Foundation workaround during the v0.3.x hotfix-cascade. They wrote a companion `docs/VENDOR-FOUNDATION.md` documenting the reversal-path **at the same commit**, before the canonical npm-published Foundation existed.

When Foundation v0.4.0 landed weeks later, the same CC who was unfamiliar with the workaround's specifics was able to execute the reversal in **~22 minutes** by following the documented steps verbatim. The migration touched 30 files, removed ~50 files of vendored-tree, and stayed 162/162 tests green throughout.

The key insight: **the reversal-doc was written when the workaround was fresh**, not retrofitted later. By the time you need the reversal-doc, the original-context has often paged-out of human-memory. Future-you, or a different CC, or a successor maintainer reads it cold.

### Anti-pattern checklist

Avoid these failure-modes:

- ❌ **No reversal-doc** — workaround ships, six months later nobody remembers why it exists; removing it becomes archaeology
- ❌ **Reversal-doc lives only in chatbus** — chatbus is for coordination, not artifact-discoverability. Future-readers grep the repo
- ❌ **Reversal-doc refers to "the canonical version"** — name the specific version the reversal targets. "When Foundation lands" is vague; "When `pnpm view ... version` returns ≥0.4.0" is concrete
- ❌ **Workaround-script and reversal-script in separate commits** — they must ship together so a reader sees both at the same `git log` entry
- ❌ **Reversal-doc has no verification-checks** — the reader needs to know how to confirm the reversal worked (which tests, which grep, which build-step)

### When the pattern is NOT worth the cost

Skip the reversal-doc discipline for:

- Trivial one-line workarounds (a `// TODO: remove after #1234` comment is enough)
- Workarounds that touch only your own code (no cross-package shape-change to undo)
- Time-bound workarounds where the canonical path lands within hours (chatbus-thread sufficient for that lifetime)

The discipline is for workarounds that **span repos or persist past a single sprint**. That's where context decays and reversal-friction compounds.

### Cross-Repo Provenance

- **mind-canva pattern (anonymized in this guide):** `docs/VENDOR-FOUNDATION.md` shipped with `vendor/plugin-template/` workaround during v0.3.x cascade. Used 1:1 during v0.4.0 npm-publish reversal. Commit-link available via plugin-author's chatbus reference if needed.
- **kanban in-repo-mirror pattern:** `host-record-status.ts` 56-LoC mirror documents trade-offs (zero supply-chain-Surface vs drift-risk) inline as code-comments + chatbus-trail. For a mirror this small, code-comment + chatbus is sufficient; for larger workarounds (>150 LoC or multi-file), the full `WHY` companion-doc pattern is recommended.

See also: [`MIGRATION-COOKBOOK.md`](./MIGRATION-COOKBOOK.md) for the three adoption-patterns that reversal-disciplined workarounds bridge between.

---

> **Cross-link:** [`CROSS-PLUGIN-MCP-CALL-COOKBOOK.md`](./CROSS-PLUGIN-MCP-CALL-COOKBOOK.md) §5.0-§5.8 (joint failure-mode catalog) is a worked example of the reversal-discipline applied to a cluster-wide debug-session. The DOM-bubble-direction bug-fix shipped with **same-commit reversal-doc** as a debug-helper-section (§5.6), so future readers hit the diagnosis-path in <5 minutes instead of repeating the 2-hour discovery.

---

## 13. Pre-Coding to Surface Contract-Drift

A counter-intuitive pattern surfaced repeatedly across the `@nexus-mindgarden` cluster: **writing a consumer-adapter against a contract _before_ that contract's runtime is live** is one of the most effective ways to surface contract-drift early. The adapter, even un-executed, acts as a compile-time fuzzer of the wire-spec.

### The pattern

You're about to integrate with another plugin's tool-surface, RAG-client, or HTTP-API. The other side isn't live yet — they're a week out from shipping, or you don't have credentials, or the host-app activation is queued. Conventional wisdom says: wait for the live endpoint, then write the adapter against real responses.

**Counter-pattern:** write the adapter NOW, against the documented contract (the TS-client types, the YAML mcp_tool spec, the swagger). Treat your adapter code as a **dry-run spec-validator**:

1. Import the other plugin's published types/schemas (or hand-mirror them if not published yet)
2. Write the integration-layer in your own plugin — full call-shape, full error-handling, full response-mapping
3. Compile + unit-test against fixtures (mock the wire-layer, but commit to the documented shape)
4. Iterate **on the contract**, not on the runtime — when you trip over an inconsistency, the contract is drift-prone and needs fixing before the runtime lands

### Why this works

The author of the contract (whoever shipped the TS-client surface or YAML spec) usually wrote it from the **provider's** perspective — "here's what my tool emits / accepts." The first consumer who writes against it from the **opposite side** ("here's how I have to call it") routinely surfaces 2-3 kinds of drift:

- **Argument-name drift** — the spec says `documentId` but the actual handler reads `document_id` (or vice versa)
- **Silent argument stripping** — the wire-handler accepts the argument but ignores it (e.g. validation passes through but the field never reaches the storage-layer)
- **Optional-vs-required asymmetry** — the type says `field?: string` but the handler 500s when omitted

These are exactly the bugs that produce **wrong output on the first live call** — the call succeeds, the response shape looks correct, but the actual semantics diverge from spec. Pre-coding catches them in cold light.

### Anonymized reference

> Plugin-Author X coded a live-adapter against Plugin-Author Y's TS-client surface BEFORE Y's live-activation arrived. The dry-run-as-spec-validation caught 2 real contract-bugs in Y's wire (one arg-naming drift + one silent-arg-stripping) that would have produced wrong outputs in the first live call. Pre-coding pays off even before live-deploy — your adapter IS your contract-fuzz-tester.

### When this pattern applies

| Pattern fits | Pattern doesn't fit |
|---|---|
| You depend on a cross-plugin contract (MCP-tool, RAG-client, REST API) | Your code only consumes Foundation runtime |
| The provider has published types/schemas you can import | The provider hasn't documented the shape at all |
| You can write meaningful unit-fixtures of the response shape | The contract is purely behavioral (e.g. UI-event timing) |
| The provider's roadmap has them live in days-to-weeks | The provider is live now (just integrate normally) |

### How to do it without burning effort

The risk of pre-coding is **wasted work if the contract changes drastically before live-deploy**. Mitigations:

- **Import the provider's published types** if available — those are the authoritative shape, and any spec-doc-drift is the provider's drift to fix
- **Build your adapter behind a `NullAdapter` / `LiveAdapter` interface** so the consumer-code calling-side stays stable even if your impl swaps
- **Commit fixtures alongside the adapter** so future-you (or another CC) can re-run the dry-validation when the contract bumps
- **Report drift back via chatbus #contracts** — pre-coding only pays the cluster if your findings flow back to the provider

### Cross-link

See §12 "Writing Reversible Workarounds" for a related discipline: shipping workarounds with reversal-path-docs so they come out cleanly when the canonical path arrives. Pre-coding and reversible-workarounds are two sides of the same approach: **don't wait for clean conditions, build with the wiring in mind**.

### Real-world reference (anonymized)

A Phase-7-prep plugin in the `@nexus-mindgarden` cluster wrote a `LiveAdapter` against an in-flight `@plug-db/client` TS-surface before the corresponding live-deploy. The adapter compiled, unit-tested clean, and surfaced two real contract-bugs (one argument-naming drift, one silent-argument-stripping) that the upstream provider then fixed in a patch-release. Total elapsed time from adapter-write to drift-resolved: under a working day.

### §13.X Same-Key Idempotency Check — PEM-Compare not Fingerprint-Compare

> Reference-Lesson aus ET-Mind Pass-2 Foundation-Migration (Helper-Lib pattern,
> 2026-05-21, see plug-elec DM #602). Credit: `plug-elec` / ET-Mind Pass-2-author.

**Anti-Pattern (legacy ET-Mind impl, pre-Pass-2):**

```ts
function register(input: RegisterHostInput) {
  const fingerprint = fingerprintPublicKey(input.public_key_pem)
  const existing = repo.get(input.host_id)

  if (existing && existing.fingerprint === fingerprint) {
    // Drift #12 same-key idempotency — preserve user-confirmed status
    return preserveAndMergeMetadata(existing, input)
  }
  return rotateKey(existing, input)
}
```

**Pattern (Foundation v0.5.0 + post-Pass-2 ET-Mind):**

```ts
function register(input: RegisterHostInput) {
  const existing = repo.get(input.host_id)

  // Drift #12 same-key idempotency — PEM-string-compare ist authoritativ
  if (existing && existing.public_key_pem.trim() === input.public_key_pem.trim()) {
    return preserveAndMergeMetadata(existing, input)
  }
  return rotateKey(existing, input)
}
```

**Why PEM-compare is strictly better:**

1. **PEM-string equality is contract.** Two PEMs that compare equal under
   `trim()` are byte-for-byte the same public key — there is no theoretical
   collision space. Fingerprint-string equality requires equal SHA-256 outputs
   *and* equal presentational format. The latter can silently drift.
2. **Fingerprint-format is presentational.** Different Foundation versions can
   choose different formats (continuous-hex `11c5544d…` vs. colon-separated
   `11c5:544d:…` vs. base64). ET-Mind's pre-Pass-2 in-repo mirror used
   continuous-hex; Foundation v0.5.0 `fingerprintPublicKey()` returns
   colon-separated. Same SHA-256 bytes, different strings — naïve
   fingerprint-compare → drift across the boundary → every re-register goes
   to the rotate-branch → Drift #12 idempotency broken silently.
3. **Future-proof.** Foundation `fingerprintPublicKey()` could change again
   (e.g. base64 for QR-code-friendly display). PEM-compare survives all
   format changes by construction.

**Migration-Note:**

Plugins migrating from `fingerprint === fingerprint` to
`public_key_pem.trim() === public_key_pem.trim()` need no data-migration —
the stored `public_key_pem` field is already in every legacy record.
The fingerprint field on disk stays in the legacy-format until next
re-register; this is fine because nothing reads it for same-key checks
anymore.

**Generalisation (pre-coding angle):**

This anekdote also exemplifies §13's main thesis: comparing **contract-bytes**
(PEM is the canonical wire-shape) is stable across implementation-changes;
comparing **presentational-form** (fingerprint-string) is fragile because the
presentational layer can drift while the contract-bytes stay the same.
When pre-coding adapters against contracts, prefer assertions on the
canonical-wire-shape, not on derived/rendered values.

**Reference:** ET-Mind `packages/etmind-bridge/src/auth/host-registry.ts::register()`
(Pass-2 commit `14efe50`, msg #602).

---

> **See also (joint-author wire-protocol cookbook):** [`CROSS-PLUGIN-MCP-CALL-COOKBOOK.md`](./CROSS-PLUGIN-MCP-CALL-COOKBOOK.md) — the multi-author cluster-doc described in §13 is itself a worked-example of the pattern: plug-tmpl + agent + wiz-mind each pre-coded their section against an evolving shared spec, surfacing wire-shape inconsistencies BEFORE the joint-smoke (rather than during it).

---

## 14. References

- [`PLUGIN-BRIDGE-PROTOCOL.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-BRIDGE-PROTOCOL.md) — Wire-Spec + mcp_tools Extended Form
- [`PLUGIN-KIARA-INTEGRATION.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-KIARA-INTEGRATION.md) — Frag-Kiara
- [`PLUGIN-CSP-CONVENTIONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CSP-CONVENTIONS.md) — CSP-Allowlist
- [`PLUGIN-CAPABILITIES.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/PLUGIN-CAPABILITIES.md) — capabilities[] standard
- [`CROSS-REPO-LESSONS.md`](https://github.com/MrDewitt88/TeamMindV8/blob/main/docs/CROSS-REPO-LESSONS.md) — Drift-Catalog #1-#24
- `docs/templates/` (this repo) — Doc-Templates
- `HOST-INTEGRATION-GUIDE.md` (this repo) — gegenüberliegende Sicht für Plugin-Host-Integration
- **`agent.complete` Contract** — chatbus thread="contracts" 2026-05-21 + Theseus `v0.15.0-agent-complete-endpoint` (commit `51921ff`) + V8 Reverse-Call Design-Y
- **`@theseus/agent-complete-schema`** — canonical Wire-Schema (Theseus monorepo, npm publish pending)
