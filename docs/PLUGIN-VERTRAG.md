# Der Plugin-Vertrag

> **Zwischen „gekauft" und „nutzbar" liegt genau eine bewusste Entscheidung eines Menschen — und die trifft der Mandanten-Admin, nicht der Endbenutzer und nicht der Serverbetreiber.**
> — der Maßstab, an dem alles hier gemessen wird (v8-corp)

**Diese Seite ist der Vertrag.** Alles andere in `docs/` ist Nachschlagewerk. Was hier keinen Platz gefunden hat, war nie normativ.

Jede Regel nennt den **sichtbaren Ausfall**, den sie verhindert. Findest du eine ohne, streich sie.

---

## Die Reise

**kaufen → Konto → erscheint → aktivieren → arbeitet → überlebt das Update**

| Schritt | Was du schuldest | Was sonst beim Kunden passiert |
|---|---|---|
| **erscheint** | `min_app_version` **immer mit `-rc.1`**, egal welche Zahl | `1.0.0` sperrt jeden `1.0.0-rc.x` aus. Das Plugin ist **unsichtbar** |
| | `distribution.type: external-service` — der einzige wirksame Wert | jeder andere Wert ⇒ Ablehnung mit kryptischem Schema-Fehler |
| | **`<plugin-id>/manifest.yaml`** — Verzeichnis trägt die Kennung (siehe unten) | ein Layout, das ein Host nicht kennt, macht dein Plugin dort **unsichtbar**: kein Fehler, kein Katalogeintrag, einfach nicht da |
| **aktivieren** | **`aud` selbst erzwingen.** Die Foundation prüft die Signatur, nicht die Zielrichtung | du akzeptierst das Token des Nachbarplugins |
| | **`sub` niemals validieren** — Format ist host-intern | bricht beim nächsten Host-Update |
| | `autoAccept` als **Autorenkonstante**, nie aus einer Umgebungsvariablen | ein selbstverwalteter Dienst vertraut seinem eigenen Launcher und nimmt `register-host` von jedem auf Loopback |
| | `register-host` **beide Schreibweisen** lesen: `public_key_pem` **und** `public_key` | Handshake scheitert mit „Signaturprüfung fehlgeschlagen", obwohl nur der Schlüssel fehlte |
| **arbeitet** | Tenant-Check und RBAC **auch auf dem Tool-Pfad**, nicht nur auf HTTP | der Tool-Pfad umgeht deine Rechteprüfung |
| | Werkzeugnamen und Kennung sind **eingefroren** | jede Umbenennung ist ein Zustimmungs-Ereignis bei **jedem** bestehenden Nutzer |
| **Update** | **alles Persistente** ins `PLUGIN_DATA_DIR` — DB, Assets, Host-Keys, Lizenz-Nachweis | ein Update ersetzt den Bundle-Pfad **komplett**. Alles dort ist weg |
| | Datenpfad geändert? **Altbestand adoptieren oder gezählt melden** | 12/12 grün und trotzdem Nutzerdaten verwaist — kein Gate fängt das |

---

## 📁 Wo das Manifest liegt

**`<plugin-id>/manifest.yaml`** — das Verzeichnis heißt wie die Kennung, die Datei schlicht `manifest.yaml`. Alle drei Hosts gemessen:

| | findet |
|---|---|
| **myMind** | beide Formen |
| **TeamMind** | **nur** `<plugin-id>/manifest.yaml` |
| **FamilyMind** | **nur** `<plugin-id>/manifest.yaml` (schreibt und liest dort) |

> ⚠️ **`manifest.<id>.yaml` findet genau EIN Host von dreien.** Diese Seite hat es verlangt und die Foundation hat zum Umbenennen gewarnt — beides war falsch herum. Wer dem folgte, war bei zwei Hosts **unsichtbar**: kein Fehler, kein Katalogeintrag, das Plugin einfach nicht da. Zurückgenommen in `plugin-bridge-foundation@0.17.0`; die angekündigte Entfernung des baren Manifests ist **abgesagt**.

**Die Kennung muss aus dem Ablageort ableitbar bleiben** — sie trägt jetzt das Verzeichnis statt des Dateinamens. Eine `manifest.yaml` ohne ihren Pfad hat keine Identität mehr, also **prüft der Host `manifest.id` gegen den Verzeichnisnamen** (`discoverManifest(dir, { expectDirId: true })`; TeamMind tut es bereits). Ohne diese Gegenprobe tauscht man eine sichere Kopplung gegen eine Konvention.

> 🔑 **Und die Ablage muss dem Host gehören** (v8-fam). Liegt sie dort, wo nur ein Betreiber schreiben darf — `/etc/…`, root-eigen —, ist der Bezugsweg **kein Bezugsweg, sondern eine Anleitung für einen Serveradmin.** Nachgemessen: FamilyMinds Self-Register scheitert auf der Appliance an `EACCES`, und der Lesepfad schluckt es (`ENOENT` ⇒ leeres Ergebnis) — **ein leerer Katalog sieht exakt aus wie „nichts gekauft".**
> Die Unterscheidung: was der Host **von sich aus laufend überschreibt**, ist Laufzeit-Zustand und gehört nach `data`. `/etc` ist root-eigen, weil dort der *Operator* entscheidet.

> 🚫 **Ein Default, der auf ein fremdes Produkt zeigt, ist schlimmer als kein Default** (v8-fam). Gemessen: FamilyMinds Fallback war `/etc/teammind/plugins`, und die eigene `.env.example` lieferte die Variable leer aus — ein frischer Klon nach eigener Anleitung las **die Manifeste des Nachbarprodukts**, das auf derselben Maschine läuft. Ein `ENOENT` hätte laut gescheppert. Zeig auf einen Pfad, der garantiert nicht existiert, und lass den Lesepfad es melden.

**Was in jeder Auflösung erhalten bleiben muss:** die Kennung muss aus dem Ablageort **eindeutig ableitbar** sein. Ein bares `manifest.yaml` ohne Kontext hat keine Identität mehr — löst man das über das Verzeichnis, muss `manifest.id` **gleich dem Verzeichnisnamen** sein und der Host das erzwingen. TeamMind tut das bereits und lehnt Abweichungen mit Meldung ab; das ist die Eigenschaft, die den Verzeichnis-Weg tragfähig macht.

---

## Zwei Achsen, kein Rang

Der Host entscheidet nicht an `distribution.type`, sondern:

- **Lebenszyklus** — host-verwaltet (Bundle im Slot) ⟷ selbstverwaltet (dein launchd/systemd/Electron)
- **Oberfläche** — bringst du `routes`/`ui.sidebar_entry` in den Host?

**Frei kombinierbar.** Alle vier Felder sind besetzt. Der Consent-Fingerabdruck hängt an der **Oberfläche**, nicht am Lebenszyklus.

> **Der Env-Vertrag ist universell, nur wer die Variable setzt hängt am Lebenszyklus.** `PLUGIN_BRIDGE_PORT` und `PLUGIN_DATA_DIR` liest du **immer** — host-verwaltet setzt sie der Host, selbstverwaltet dein Dienst-Manager. „Kommt nicht" und „darf nicht" sind zwei verschiedene Sätze.

**Und die Betriebsart darf beim Endkunden nicht durchschlagen.** Er sieht ein Plugin, das an oder aus ist. Erzwingt eine Betriebsart eine zusätzliche Nutzerentscheidung, ist das ein Fehler **in der Betriebsart**.

---

## Lizenz: genau zwei Netzmomente

| Moment | Wie oft |
|---|---|
| Erstaktivierung des Hosts | **einmal** je Installation |
| Bezug eines Plugins | **einmal** je Plugin |

**Danach nie wieder.** Kein Start-Check, kein Heartbeat, keine Neuvalidierung. Nexus liegt **nicht im Verfügbarkeitspfad** — ein Nexus-Ausfall ist kein Kundenausfall.

- **Es gibt keine Laufzeit-Lizenzprüfung.** Kein Ablauf, kein Widerruf. Das ist eine Entscheidung, keine Lücke.
- **Bau es auch nicht halb:** kein vorsorgliches Ablaufdatum, keine Neuvalidierung „alle 30 Tage", kein stiller Degradierungspfad. Abo-Modelle bekommen eigene Regeln.
- **„Lizenz freigeben", nicht „Zugriff entziehen".** Deaktivieren gibt den Platz frei; eine laufende Installation läuft weiter. Ohne Laufzeitprüfung gibt es nichts, was sie davon erführe.
- **Sicherheitsvorfall ≠ Lizenzwiderruf.** Eine kompromittierte Version lässt sich zurückziehen — über einen anderen Weg.

> 🧬 **„Überlebt Updates" und „wird beim Restore nicht mitkopiert" sind zwei Anforderungen.**
> **Nutzerdaten** sollen beides. **Identität und Berechtigung** (Installations-Kennung, Lizenz-Nachweis, Host-Keys) sollen Updates überleben und beim Restore **nicht** mitkommen — sonst klont jede Wiederherstellung einen Lizenzplatz und eine Identität.
> **Daten willst du wiederhaben. Identität nicht.**

---

## Rückrufe in den Host

Deklarieren ist **freiwillig**: wer schweigt, behält die heutige Reichweite; wer deklariert, bekommt genau das und nichts darüber hinaus.

```yaml
requires:
  scopes: [host.contacts.manage]
```

| Scope | Was der Nutzer liest |
|---|---|
| `host.contacts.manage` | lesen, ändern und **löschen** |
| `host.calendar.manage` | lesen, anlegen, ändern und **löschen** |
| `host.notes.write` | lesen, schreiben und ergänzen |
| `host.projects.write` | lesen, anlegen und ändern |
| `host.attachments.write` | Anhänge hochladen |
| `host.image.generate` | Bilder erzeugen und bearbeiten |

`host.*` geht **hinaus**. Alles ohne `host.`-Präfix (`family.policy.read`) beschreibt, was ein Aufrufer braucht, um zu **dir** zu kommen — die Gegenrichtung.

⚠️ **`requires: {}` ist ein Fehler.** Drei Zustände, absichtlich unterscheidbar: **fehlt** = nicht deklariert · **`scopes: []`** = „ich rufe nichts nach außen" · **`{}`** = Fehler. Ein Default würde aus einem halb hingeschriebenen Feld still die schärfste Einstellung machen.

⚠️ **Eine Erklärung zu entfernen ist die größte Erweiterung, die es gibt** — von „nur Kontakte" auf „alles". Im Diff sieht es aus wie Aufräumen.

---

## Die dreizehn Pflichtprüfungen

`node tools/conformance/plugin-conformance.mjs manifest.<id>.yaml [--endpoint URL]`

**A1–A6** Manifest · **B1** Dienst antwortet · **C0** nimmt den Host-Schlüssel entgegen · **C1** akzeptiert ein vertragskonformes Token — *außer der Host wartet noch auf Freigabe (`pending`), dann gilt der Lauf als **nicht geprüft**, nicht als bestanden* · **D1–D3** weist fremdes, falsch signiertes und abgelaufenes Token ab · **E1** `input_schema` je Werkzeug. Das übrige **E/F sind Hinweise**.

- **Ohne `--endpoint`** laufen Manifest- und Hinweisprüfungen bereits — sie finden den häufigsten Blocker, bevor ein Dienst läuft.
- **Melde einen Hash erst, wenn der Lauf grün ist.**
- **Der gültige Runner-Hash steht in `tools/conformance/README.md`** — nirgends sonst. Ein beweglicher Wert an N Orten ist N−1 falsche Werte.
- Bei einem Fehlschlag unterscheide **„kennt uns nicht"** (repariert der Host) von **„lehnt gültiges Token ab"** (musst du fixen).

---

## Was der Nutzer nie liest

`host_pending`, `consent drift`, `A4`, `audience_mismatch` sind **unsere** Wörter.

| intern | was er liest |
|---|---|
| `host_pending` | „Dieses Plugin braucht deine Freigabe." **+ Knopf** |
| Versions-Mismatch | „Passt nicht zu deiner App-Version." + was zu tun ist |
| Consent-Drift | „Diese Version möchte auf **X** zugreifen." — X **benennen** |
| verwaiste Daten | „Ältere Daten gefunden: **30 Befunde**." — gezählt |
| Scope, den es hier nicht gibt | „**Ohne Wirkung hier:** deine Kontakte — lesen, ändern und löschen. Das Plugin bittet um Zugriff, den es in *&lt;Anwendung&gt;* nicht gibt. Die Bitte bleibt folgenlos — **du musst nichts tun.**" |

**Keine Sackgassen.** Ein gekauftes Plugin, das auf `pending` landet und nicht freigegeben werden kann, ist ein toter Kauf. Hat das Plugin keine Oberfläche, **schuldet der Host die Fläche** — es kann dem Nutzer sonst nichts zeigen.

**Der Kanal dafür ist `notice` auf der Health-Antwort** (ab `plugin-bridge-foundation@0.18.0`) — **eine** Zeile, die der Host beim Plugin in seiner Liste zeigt:

```ts
notice?: { level: 'info' | 'warning', text: string /* max 200 */ }
```

Die Form erzwingt die Semantik, statt sie zu verlangen: das Plugin meldet die Zeile bei **jeder** Sonde, solange die Bedingung gilt; hört es auf, verschwindet sie ohne Rücknahme-Aufruf; und **Wegklicken kann sie nicht dauerhaft unterdrücken**, weil die nächste Sonde sie erneut liefert.

**Es gibt kein Wegklicken.** Was verschwinden soll, nimmt das Plugin zurück. Ein Wegklicken hätte nur bis zur nächsten Sonde gehalten und dabei **so ausgesehen, als hätte es Wirkung** — schlechter als keins.

> ⚠️ **Rechne sie nicht in der Sonde aus.** Das Health-Budget gilt unverändert — der Verwaisungs-Scan gehört **einmal** in den Boot, die Sonde gibt nur das gespeicherte Ergebnis zurück. Wer hier scannt, macht aus einer Meldung über verlorene Daten einen Grund für `unhealthy`, und dann verschwindet das Plugin, statt zu erklären.
>
> ⚠️ **Einzahl, mit Absicht.** Wer zwei Dinge zu sagen hat, sagt das wichtigere. Eine Liste wird ein Feed, und ein Feed wird ignoriert.
>
> **Sprache:** es gibt heute **keine Locale** — weder Handshake noch Manifest tragen eine. Formuliere in der Sprache deiner Oberfläche. Bekannte Lücke, kein Design; sie wird geöffnet, wenn ein Plugin sie braucht.

> 🧼 **Dein Text wird normalisiert — verlass dich nicht auf seine Form.** Der Host prüft und bereinigt ihn an der Grenze, weil er **direkt auf dem Bildschirm des Nutzers landet** und von einem fremden Autor stammt:
> - **Steuerzeichen fliegen raus**, Zeilenumbrüche eingeschlossen. Nicht wegen Skripten — die Oberfläche escaped ohnehin —, sondern weil Umbrüche und Rücksetzzeichen **eine** Meldung wie **mehrere** aussehen lassen oder Text überschreiben.
> - **Über 200 Zeichen wird gekürzt**, nicht abgewiesen.
> - **Eine unbekannte Stufe wird abgewiesen**, nicht auf `info` abgerundet.
>
> Die Asymmetrie der letzten beiden ist Absicht, und sie ist eine allgemeine Regel wert: **weise ab, wo Stillschweigen die Bedeutung verfälscht — kürze, wo Abweisen die Nachricht ganz verschwinden ließe.** Ein `level: 'error'`, das still zu `info` würde, verlöre die Dringlichkeit, ohne dass es jemand merkt. Ein zu langer Text, der abgewiesen würde, verschwände ganz, und der Autor erführe es nie.
>
> 🔓 **Und der Grund, warum die Einzahl-Regel ohne diese Bereinigung nicht trägt:** eine Meldung, die Umbrüche enthalten darf, kann sich als **mehrere** ausgeben — oder als Systemmeldung. **Eine Mengenbeschränkung lässt sich durch den Inhalt eines einzelnen Elements umgehen**, wenn dessen Form nicht mitbeschränkt ist.

---

## Drei Sätze, die uns Geld gekostet haben

> **Ein Feld, das validiert und nichts bewirkt, ist schlimmer als ein Feld, das fehlt.** Fehlt es, merkt es der Autor. Validiert es, hält er es für erledigt — und der Fehler taucht erst beim Kunden auf.
> Prüf deshalb nicht, ob dein Schema ein Manifest **annimmt** — prüf, **was nach dem Parsen noch da ist.**

> **Ein Name darf nicht weniger versprechen, als er gewährt — und nicht mehr androhen.** Das eine ist eine Falschaussage im Zustimmungsdialog, das andere treibt zu einer Ablehnung ohne Sachgrund.

> **Ein rotes Ergebnis ist eine Frage, keine Antwort.** Frag bei jedem Rot zuerst, ob der Messpunkt stimmt, bevor du das Gemessene änderst.

> **Wo ein Fehler zu „nichts" geglättet wird, sieht der Nutzer statt eines Problems eine Leere — und über Leere beschwert sich niemand.** An einem Tag dreimal gefunden: verwaiste Daten hinter einer leeren Liste · ein `EACCES`, das der Lesepfad zu `ENOENT` glättet, sodass ein leerer Katalog aussieht wie „nichts gekauft" · eine übersprungene Pflichtprüfung, die als bestanden mitgezählt wurde. **Ein lautes Scheitern ist ein Geschenk.**

---

**Nachschlagewerk:** `PLUGIN-PROVIDER-GUIDE.md` (Begründungen, Rezepte, die Fälle dahinter) · `PLUGIN-BRIDGE-WIRE-SPEC.md` (sprachneutral, für Nicht-TypeScript) · `HOST-INTEGRATION-GUIDE.md` (wenn du Plugins aufnimmst) · `tools/conformance/README.md` (Runner, Hash, Provenienz).
