# Conformance-Runner — „Aktivierbar beim Endkunden"

> **Gebaut vom Host, verteilt von plug-tmpl.** Der Runner prüft den Vertrag, den der **Host tatsächlich fährt** — nicht das, was hier dokumentiert ist. Er ist deshalb bewusst **keine Kopie**: er wird als gebautes Artefakt übernommen, und `agent` meldet jede Änderung mit neuem Hash und Grund. Übernommen wird er erst nach eigener Messung.

## 🔐 Prüf die Datei, bevor du sie ausführst

```bash
shasum -a 256 -c plugin-conformance.mjs.sha256
```

> **Der Sidecar ist die Wahrheit. In diesem Text steht absichtlich kein Hash.**
>
> Bis 2026-08-19 stand er hier noch einmal ausgeschrieben — und war **veraltet**: die Datei trug die siebte Fassung, der Text die fünfte. Wer meiner eigenen Anweisung folgte („der gültige Hash steht in der README") und dagegen prüfte, bekam eine Abweichung und musste annehmen, die Datei sei manipuliert (gemeldet von **plug-elec**). Genau die Reibung, die dazu führt, dass am Ende niemand prüft.
>
> Dieselbe Klasse, die ich zwei Tage zuvor selbst benannt hatte — *ein beweglicher Wert an N Orten ist N−1 falsche Werte* — und ich hatte ihn aus den Chat-Nachrichten hierher gezogen und dabei ein zweites Mal dupliziert. Version, Bytes und Herkunft nennt der **Commit**, der die Datei tauscht; die Prüfsumme nennt der **Sidecar**.

## Aufruf

```bash
node plugin-conformance.mjs <manifest> [--endpoint URL] [--bundle <wurzel>]
```

**Exit 0**, wenn alle Pflichtprüfungen bestehen. Er braucht nur **`node`** — kein Workspace, kein TypeScript, keine Installation — und spricht **HTTP**, läuft also gegen einen Python-, Rust- oder Go-Dienst genauso wie gegen einen TypeScript-Dienst.

| Flag | Was ohne dieses Flag **nicht** gemessen wird |
| --- | --- |
| `--endpoint` | **die gesamte Sicherheitshälfte** — B, C, D. Ein grünes Manifest sagt **nichts** über deine Token-Prüfung |
| `--bundle` | **A2b**. Der Punkt wird dann **gar nicht erhoben** und zählt **nicht** als bestanden |

> ⭐ Dass ein nicht erhobener Punkt **nicht** als bestanden zählt, ist die Lehre aus einem eigenen Defekt: E und F standen einmal hinter dem Erreichbarkeits-Abbruch und wurden ohne `--endpoint` übersprungen — **trotzdem als bestanden mitgezählt**. Eine Prüfung, die grün meldet, weil sie nichts zu prüfen hatte, ist schlimmer als keine.

## Was geprüft wird

| | | |
| --- | --- | --- |
| **A1** | Manifest ist gültig | Pflicht |
| **A2** | Ablage entspricht dem, was alle Hosts finden | Hinweis |
| **A2b** | Bundle liefert `<plugin-id>/manifest.yaml` | Pflicht *(nur mit `--bundle`)* |
| **A3** | `compatibility.apps` enthält `theseus` | Pflicht |
| **A4** | `min_app_version` sperrt keine rc-Builds aus | Pflicht |
| **A5** | Version ist pfadsicher | Pflicht |
| **A6** | `service_endpoint` vorhanden | Pflicht |
| **A8** | `service_endpoint` ist eine gültige URL (`127.0.0.1`, nie `localhost`) | Pflicht |
| **B1** | `/health` ist **tokenfrei** erreichbar und gültig | Pflicht |
| **B2** | Dienst meldet sich selbst als `ok` | Hinweis |
| **C0** | nimmt den Host-Schlüssel entgegen (`register-host`) | Pflicht |
| **C0b/C0c** | akzeptiert `public_key` und `public_key_pem` **je allein** | Pflicht |
| **C1** | akzeptiert ein vertragskonformes Token | Pflicht |
| **D1** | weist ein Token für ein **anderes Plugin** ab | Pflicht |
| **D1b** | fällt **nicht** auf den `sub`-Claim zurück | Pflicht |
| **D1c** | kommt mit den Standard-Claims allein aus (`aud`/`sub`) | Hinweis |
| **D2** | weist eine **fremde Signatur** ab | Pflicht |
| **D3** | weist ein **abgelaufenes** Token ab | Pflicht |
| **E0** | `requires.scopes` nennt nur bekannte `host.*`-Namen | Hinweis |
| **E1** | Werkzeuge tragen ein `input_schema` | **Pflicht** |
| **E2/E3** | Beschreibung vorhanden · Werkzeugnamen wiederholen die Kennung nicht | Hinweis |
| **F1/F2** | `component_type` wird ausgewertet · alle gesetzten Manifest-Felder werden gelesen | Hinweis |

## Die drei Prüfungen, die am häufigsten missverstanden werden

**B1 — `/health` muss tokenfrei sein.** Der Host pollt sie, **bevor** er ein Token hat. Ein 401 heißt für ihn „nicht bereit": der Dienst läuft, antwortet, funktioniert — und wird nie als gesund erkannt.

> **Health ist der Endpunkt, den man abfragt, *um* an ein Token zu kommen** (plug-elec). Die naheliegende Intuition — *„Wire-Endpunkte sind bearer-geschützt, Health ist ein Wire-Endpunkt"* — führt genau daneben. Sie hat die Foundation bis `0.18.x` erwischt **und** mindestens ein Plugin mit eigener Bridge, das ihren Code gar nicht benutzt.
>
> Ein 401 auf `/health` bricht den Lauf **nicht** ab: C und D werden weiter gemessen. Deine Token-Prüfung ist unabhängig davon beweisbar.

**C0 vs. C1 — unterscheide „kennt uns nicht" von „lehnt gültiges Token ab".** C0 läuft **vor** C1. Wer danach noch „kennt den Host nicht" sagt, hat **quittiert und nicht gespeichert** — das ist deins. Meldet `register-host` dagegen `pending`, gilt C1 als **NICHT GEPRÜFT**, nicht als bestanden.

**E1 — ohne `input_schema` ruft das Modell mit `{}` auf.** Kein fehlender Metadaten-Eintrag, sondern ein funktionaler Bruch: eine Suche ohne Suchbegriff, ein Anlegen ohne Titel. Argumentlose Werkzeuge deklarieren `{"type":"object","properties":{}}` — **ein leeres Schema ist eine Aussage, gar keins ist eine Auslassung.**

## Warum das Artefakt und keine Kopie des Quellcodes

Eine Kopie wäre in zwei Wochen eine **zweite Wahrheit**. Der Runner gehört dem Host, weil er den Host-Vertrag testet; ändert sich der Host, ändert sich der Runner. plug-tmpl verteilt nur — und misst vor der Übernahme Hash, Bytes und den Selbsttest (Aufruf ohne Argumente ⇒ Exit 2) nach.

**Reproduzierbar:** `pnpm --filter @theseus/plugin-system conformance:bundle`

## Für alle, die selbst bündeln (zwei Fallen, die `agent` beim Bauen fand)

- Über den Barrel-Export `src/index.js` zieht die Prüfung den Plugin-Store und damit **`better-sqlite3`** mit — nativ, ABI-gepinnt, und das Bündel stirbt an `Dynamic require of "fs"`. Lösung: **direkte Modulpfade** statt Barrel.
- **`yaml` ist CJS.** In einem ESM-Bündel ohne definiertes `require` stirbt es an `Dynamic require of "process"`. Lösung: Banner mit `createRequire`.

Das Build-Skript raucht sein eigenes Ergebnis: Aufruf ohne Argumente **muss** Exit 2 liefern. Ein Bündel, das beim ersten echten Aufruf an einem dynamischen `require` stirbt, wäre schlimmer als keines — es sähe für den Plugin-Autor wie **sein** Fehler aus.

---

Volle Erklärung jeder Regel samt der Fälle dahinter: **`docs/PLUGIN-VERTRAG.md`** (verbindlich) und `docs/PLUGIN-PROVIDER-GUIDE.md` (Nachschlagewerk).
