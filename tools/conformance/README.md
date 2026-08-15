# Conformance-Runner — „Aktivierbar beim Endkunden"

> **Gebaut vom Host, verteilt von plug-tmpl.** Der Runner prüft den Vertrag, den der **Host tatsächlich fährt** — nicht das, was hier dokumentiert ist. Er ist deshalb bewusst **keine Kopie**: er wird als gebautes Artefakt übernommen, und `agent` meldet jede Änderung mit neuem Hash und Grund.

## Aufruf

```bash
node plugin-conformance.mjs <pfad/zu/manifest.<id>.yaml> [--endpoint URL]
```

**Exit 0**, wenn alle **Pflicht**-Prüfungen bestehen (A/B/C/D). E1–E3 sind **Hinweise** und senken den Exit-Code nicht.

Er braucht nur **`node`** — kein Workspace, kein TypeScript, keine Installation. Und er spricht **HTTP**: er läuft gegen einen Python-, Rust- oder Go-Dienst genauso wie gegen einen TypeScript-Dienst.

**Ohne `--endpoint`** laufen nur die Manifest-Prüfungen (A1–A6) und die Hinweise (E1–E3) — das ist bereits nützlich und findet z.B. den A4-Blocker, ohne dass ein Dienst laufen muss. Für B/C/D muss dein Dienst erreichbar sein.

> ⚠️ **DIESES ARTEFAKT IST VERALTET — nicht mehr für Konformitätsmeldungen verwenden.**
>
> **AKTUELLE FASSUNG (fünfte):**
>
> ```
> sha256  d36d9a3b3ea2cd7f0643883f135f4a0078c09383fe186dcaf72ff4baecfe2c36
> bytes   456348
> Quelle  e3cd988e
> ```
>
> **Neu: `D1b` (Pflicht) und `D1c` (Hinweis).**
>
> **D1b — „fällt nicht auf den `sub`-Claim zurück".** Token **ohne `aud`, ohne `plugin_id`**, dessen **`sub` die Plugin-Kennung trägt**. Wer korrekt bindet, hat nichts zu binden und weist ab; wer `aud ?? sub` schreibt, akzeptiert. **C1 fängt den harten Fall** (ein Verifier, der auf `sub` besteht, lehnt jedes gültige Token ab und fällt sofort auf) — **D1b fängt den weichen**, eine Kette, die C1 *und* D1 besteht und trotzdem falsch ist.
>
> **D1c — „kommt mit den Standard-Claims allein aus".** Token **ohne `plugin_id`/`user_id`**. 200 ⇒ du überstehst das Ende des Dual-Emits ohne Änderung; 401 ⇒ dein Verifier braucht die expliziten Felder. **Kein Sicherheitspunkt, eine Messung** — heute folgenlos, weil beide Sätze gesendet werden.
>
> Die ratifizierte Regel dahinter (agent + v8-corp): **auf `aud ?? plugin_id` binden. Fehlt beides: abweisen. `sub` NIE prüfen.**
>
> **Überholt:** `ebb80ef5…` (453933 B, vierte) · `387cc7ae…` · `530b601b…` · `e3c7f355…`
>
> ✅ **Gegengemessen, nicht übernommen auf Zuruf.** Die Datei liegt daneben, `sha256` und Bytezahl stimmen mit der Meldung überein, `shasum -c` bestätigt, und der Selbsttest ist gefahren: Aufruf ohne Argumente ⇒ **Exit 2**. Zusätzlich stichprobenhaft geprüft, dass `--bundle`/A2b und die `host.*`-Namen für E0 wirklich im Bündel stehen.
>
> *(Der Hash kam zuerst abgekürzt an und wurde zurückgewiesen. Ein abgekürzter Hash belegt nichts und lässt sich gegen keine Datei prüfen — Prüfen-vor-Ausführen ist der einzige Zweck der Angabe. Und „gemeldet" bleibt „gemeldet", bis jemand misst: eine README, in der beides gleich aussieht, belegt nichts mehr.)*
>
> **Was die vierte Fassung ändert — A2 ist entschärft, A2b kommt dazu:**
> - **A2 ist Hinweis**, kein Pflichtpunkt mehr. Grund: die Zielform `<plugin-id>/manifest.yaml` gilt am **Installationsort**, der Runner läuft aber im **Entwicklungs-Repo** — und dort heißt das Verzeichnis nach dem Repo (`Med-Mind/` bei `id: med-mind`). Gemessen: **20 von 20 Plugins** weichen ab. Eine Pflichtprüfung hätte alle rot gemacht für etwas, das am Zielort gar nicht mehr gilt.
> - **A2b ist Pflicht, aber nur mit `--bundle <wurzel>`** — was ausgeliefert wird, hat den endgültigen Ort und ist damit prüfbar.
> - ⭐ **Ohne `--bundle` wird A2b gar nicht erhoben** — es zählt **nicht** als bestanden. Genau der Defekt, den E und F heute Vormittag hatten: eine Prüfung, die grün meldet, weil sie nichts zu prüfen hatte.
>
>
> Ungültig sind damit `e3c7f355…` (445931 B) **und** `530b601b…` (446591 B). Die Datei liegt hier noch nicht vor — bis dahin gilt der Hash als Referenz, nicht die Datei daneben.
>
> **Neu in dieser Fassung — Hinweis `E0`:** meldet unbekannte `host.*`-Scope-Namen samt gültiger Liste. Grund: ein Tippfehler wie `host.contact.manage` ist am **Host kein Fehler** — der sagt korrekt „gibt es hier nicht", das Plugin verliert **still seinen Zugriff an jedem Host**, und niemand sagt es dem Autor. **Der Nutzer bekommt die Tatsache, der Autor die Ursache.** Geprüft wird nur `host.*`; alles andere sind plugin-eigene Scopes fremder Dienste, über die der Runner nichts weiß und nichts behaupten darf.
>
> Die sechs Host-Scope-Namen stehen im Bündel als **Literal, nicht als Import** — es läuft damit auch bei Autoren, die weder myMind noch die Foundation im Baum haben. **Ändert sich die Namensliste, ändert sich der Hash.** Das ist die Kopplung, die wir wollen.
>
> Weggefallen: der Hinweis `A7` (`type ≠ external-service`) — `distribution.type` hat seit `plugin-bridge-foundation@0.16.0` und dem entsprechenden Host-Commit nur noch **einen** zulässigen Wert, die Abweisung passiert jetzt eine Ebene früher beim Lesen statt beim Aktivieren.
>
> **Zwei ältere Änderungen, die weiterhin eine Wiederholung erzwingen:**
> - **E1 ist Pflichtpunkt** geworden (`input_schema` je Werkzeug). Ausnahme für argumentlose Werkzeuge: `"input_schema": {"type":"object","properties":{}}` — **ein leeres Schema ist eine Aussage, gar keins ist eine Auslassung.**
> - 🚨 **E und F standen hinter `if (!liveness.erreicht) return`.** Ein Lauf **ohne `--endpoint`** übersprang sie und meldete trotzdem „6/7 bestanden" — er zählte eine Pflichtprüfung als bestanden, **die nie gelaufen war.** Genau auf dem Weg, den dieses README als „bereits nützlich" empfiehlt. Im neuen Artefakt laufen E und F **vor** der Netzstufe.
>
> **Ein grünes Offline-Ergebnis vom alten Runner beweist E1 nicht.** Wer so gemeldet hat: bitte mit dem neuen Artefakt wiederholen.

## Provenienz

| | |
| --- | --- |
| **sha256** | `e3c7f355e976d73f74d8a3d0c8733401a03ba03d1d039546632c60acd58ebff6` |
| **bytes** | 445931 |
| **Quelle** | Theseus-Agent `packages/plugin-system`, Commit `bc62046f` |
| **Reproduzierbar** | `pnpm --filter @theseus/plugin-system conformance:bundle` |
| **Übernommen** | 2026-08-15 — Hash + Bytes + Selbsttest (Aufruf ohne Argumente ⇒ Exit 2) vor der Übernahme verifiziert |

Prüf den Hash, bevor du ihn ausführst:

```bash
shasum -a 256 -c plugin-conformance.mjs.sha256
```

## Was geprüft wird

| | Prüfung | |
| --- | --- | --- |
| **A1** | Manifest ist gültig | Pflicht |
| **A2** | Dateiname trägt die Plugin-Kennung (`manifest.<id>.yaml`) | Pflicht |
| **A3** | `compatibility.apps` enthält `theseus` | Pflicht |
| **A4** | `min_app_version` sperrt keine rc-Builds aus | Pflicht |
| **A5** | Version ist pfadsicher | Pflicht |
| **A6** | `service_endpoint` vorhanden | Pflicht |
| **B1** | Dienst antwortet | Pflicht |
| **C0** | nimmt den Host-Schlüssel entgegen (`register-host`) | Pflicht |
| **C1** | akzeptiert ein vertragskonformes Token. C0 lief vorher — wer jetzt „kennt den Host nicht" sagt, hat **quittiert und nicht gespeichert**. Ausnahme `pending`: Hinweis **„NICHT GEPRÜFT"**, nicht „bestanden" | Pflicht |
| **E1** | `input_schema` je Werkzeug. Argumentlos ⇒ `{"type":"object","properties":{}}` — **ein leeres Schema ist eine Aussage, gar keins eine Auslassung** | Pflicht |
| **D1** | weist ein Token für ein **anderes Plugin** ab | Pflicht |
| **D2** | weist eine **fremde Signatur** ab | Pflicht |
| **D3** | weist ein **abgelaufenes Token** ab | Pflicht |
| **E1–E3** | `input_schema` · Beschreibung · Werkzeugnamen wiederholen die Kennung nicht | Hinweis |

**C0 läuft vor C1** — das ist kein Detail. Prüft man das positive Token, *bevor* der Host registriert ist, meldet der Lauf „Signaturprüfung fehlgeschlagen", obwohl nur der Schlüssel fehlte. Unterscheide bei einem Fehlschlag immer **„kennt uns nicht"** (repariert der Host selbst) von **„lehnt gültiges Token ab"** (musst du fixen).

Volle Erklärung jeder Prüfung samt der Fallen: `docs/PLUGIN-PROVIDER-GUIDE.md` §4.9.

## Warum das Artefakt und keine Kopie des Quellcodes

Eine Kopie wäre in zwei Wochen eine **zweite Wahrheit**. Der Runner gehört dem Host, weil er den Host-Vertrag testet; ändert sich der Host, ändert sich der Runner. plug-tmpl verteilt nur — inklusive Hash, damit du prüfen kannst, was du ausführst.

## Für alle, die selbst bündeln (zwei Fallen, die `agent` beim Bauen fand)

- Über den Barrel-Export `src/index.js` zieht die Prüfung den Plugin-Store und damit **`better-sqlite3`** mit — nativ, ABI-gepinnt, und das Bündel stirbt an `Dynamic require of "fs"`. Lösung: **direkte Modulpfade** statt Barrel.
- **`yaml` ist CJS.** In einem ESM-Bündel ohne definiertes `require` stirbt es an `Dynamic require of "process"`. Lösung: Banner mit `createRequire`.

Das Build-Skript raucht sein eigenes Ergebnis: Aufruf ohne Argumente **muss** Exit 2 liefern. Ein Bündel, das beim ersten echten Aufruf an einem dynamischen `require` stirbt, wäre schlimmer als keines — es sähe für den Plugin-Autor wie **sein** Fehler aus.
