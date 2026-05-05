# Companion-Doc Pattern

> **TEMPLATE / META-PATTERN.** Companion-Docs sind Implementation-Reality-Docs im Host-Repo. Spec-Docs (V8/canonical-Cross-Repo) bleiben high-level Contract; Companion-Docs zeigen wie ein konkreter Host das implementiert.

---

## 1. Wann Companion-Doc schreiben?

Schreibe Companion-Doc wenn:
1. Dein Host (V8/Theseus/FamilyMind/...) implementiert eine Cross-Repo-Spec (z.B. PLUGIN-KIARA-INTEGRATION) UND
2. Implementation-Details host-specific genug sind dass Spec-Inline-Documentation den Spec verbloated (z.B. Theseus' ChatApp + IPC + AgentHost vs V8s simpler `+page.svelte`-Listener).

Beispiel-Match: Theseus' `PLUGIN-KIARA-INTEGRATION-THESEUS.md` (303 Zeilen) im Theseus-Repo — V8s Spec-§4.2 hat 3 Sätze für Theseus, Companion-Doc liefert die Implementation-Substanz.

**NICHT schreiben** wenn:
- Implementation < 50 Zeilen Code (Spec-Inline reicht)
- Single-File-Implementation (Spec kann das direkt referenzieren)
- Spec-Generic genug dass alle Hosts gleichen Pattern nutzen (z.B. JWT-Verify)

---

## 2. Companion-Doc-Naming

Convention: `{SPEC-NAME}-{HOST-NAME}.md` im Host-Repo `docs/`.

Beispiele:
- `PLUGIN-KIARA-INTEGRATION-THESEUS.md` (Theseus-Repo)
- `PLUGIN-KIARA-INTEGRATION-V8.md` (V8-Repo, falls je nötig — V8 nutzt aktuell inline §4.1)
- `PLUGIN-CSP-CONVENTIONS-FAMILYMIND.md` (FamilyMind-Repo, post-Hard-Fork)

---

## 3. Standard-Sections für Companion-Docs

```markdown
# {Spec-Name} — {Host-Name} Implementation

> Companion-Doc zu [Spec-Name](spec-link). Diese Datei dokumentiert
> die {Host-Name}-Implementation. High-level Cross-Repo-Vertrag lebt
> im Spec-Doc.

## 1. Architektur-Überblick

{ASCII-flow-diagram, key-components}

## 2. Key-Files (commit-anchored)

| Path | Purpose |
|---|---|
| `apps/foo/src/...` | {what} |

## 3. {Host-Specific-Section-1}

{e.g. IPC-channels für Electron-host, hooks.server.ts-pattern für SvelteKit, ...}

## 4. {Host-Specific-Section-2}

{...}

## 5. Drift-Encounters {Host-Side}

{Welche Drifts dieser Host während Spec-Implementation gefangen hat,
mit fix-commits — feedback to V8 Drift-Catalog}

## 6. Test-Hooks

{Wie Plugin-Provider gegen diese Implementation testen kann}

## 7. Phase-N BACKLOG

{Items für Folge-PRs}

## 8. Cross-Repo-Coordination

{Welche Spec-Refinements oder Pattern-Improvements aus dieser
Implementation für die canonical Spec relevant sind}
```

---

## 4. Spec-Side Pflicht: §4.X Implementation-Companions Tabelle

In dem Cross-Repo-Spec, der einen Companion-Doc-Pattern hat, gehört eine `§4.X Implementation-Companions`-Section mit Tabelle:

```markdown
## 4.X Implementation-Companions

Diese Spec ist high-level Cross-Repo-Vertrag — **wie** ein Host
konkret implementiert lebt in **Companion-Docs** im jeweiligen
Host-Repo.

| Host | Companion-Doc | Status |
|---|---|---|
| TeamMindV8 | inline (§4.1) | sufficient |
| Theseus/myMind | [link](url) | live |
| MarkView | n/a (Plugin-Provider, kein Host) | — |
| ET-Mind / KANBAN / Future | tbd nach Adoption | — |

**Pattern für künftige Hosts:**
1. Implementiert Spec-Convention
2. Schreibt Companion-Doc per [`COMPANION-DOC-PATTERN.md`](https://github.com/MrDewitt88/plugin-template/blob/main/docs/templates/COMPANION-DOC-PATTERN.md)
3. Erweitert Tabelle in §4.X mit Link zum Companion-Doc

Pattern skaliert linear mit jeder neuen Host-Adoption.
```

V8s `PLUGIN-KIARA-INTEGRATION.md` §4.4 ist die Reference-Implementation dieses Patterns.

---

## 5. Vorteile

| Aspekt | Pro |
|---|---|
| **Single-Source-of-Truth-Falle vermieden** | Spec wächst nicht mit jeder Host-Implementation-Detail |
| **Linear scaling** | Neuer Host = neuer Eintrag in Tabelle, kein Spec-Rewrite |
| **Implementation-Reality close-to-code** | Companion-Doc lebt im selben Repo wie Code; commit-anchored Key-Files |
| **Spec stays concise** | Spec-Reader sieht Vertrag, nicht Implementation-Spaghetti |
| **Drift-Feedback-Loop** | Host kann §5 Drift-Encounters dokumentieren, Spec-Owner kann canonical Lessons-Catalog updaten |

---

## 6. Anti-Patterns

**Spec absorbed Companion-Content:**
> Spec wird Implementation-Manual mit allen Hosts inline → Spec-Bloat, Implementation-Drift wenn Host-Code geändert wird ohne Spec-Update

**Companion-Doc dupliziert Spec:**
> Companion-Doc kopiert Spec-Sections statt zu referenzieren → Drift wenn Spec geändert

**Companion-Doc ohne Cross-Reference:**
> Plugin-Provider sucht Implementation, findet aber nur Spec — kein Hint dass Companion-Doc existiert → Tabelle in Spec-§4.X ist Pflicht

---

## 7. References

- V8 `PLUGIN-KIARA-INTEGRATION.md` §4.4 — Reference-Implementation des Patterns
- Theseus `PLUGIN-KIARA-INTEGRATION-THESEUS.md` (`cc9f824`) — erste Companion-Doc-Live-Adoption
- Plus L4 PLUGIN-PROVIDER-GUIDE.md (kommt) — wann Plugin-Provider eigene Companion-Docs schreiben sollte
