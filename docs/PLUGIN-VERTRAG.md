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
| **erscheint** | `min_app_version` mit **`-rc.1`** — ⚠️ **aber bei zwei Hosts abstimmen** | `1.0.0` sperrt jeden `1.0.0-rc.x` aus, das Plugin ist bei myMind **unsichtbar**. **Umgekehrt bei FamilyMind:** deren heutiger Vergleich liest `-rc.1` als **größer**, dort macht der Suffix dich unsichtbar — bis ihr semver-Fix da ist. **Wer beide beliefert, stimmt den Wert mit dem Zielhost ab** |
| | `distribution.type: external-service` — der einzige wirksame Wert | jeder andere Wert ⇒ Ablehnung mit kryptischem Schema-Fehler |
| | **`<plugin-id>/manifest.yaml`** — Verzeichnis trägt die Kennung (siehe unten) | ein Layout, das ein Host nicht kennt, macht dein Plugin dort **unsichtbar**: kein Fehler, kein Katalogeintrag, einfach nicht da |
| **aktivieren** | **Wartest du auf eine menschliche Freigabe, sag es im Fehlercode:** `host_pending`, `host_awaiting_confirmation` oder `pending_approval` mit 401/403 | auf `invalid_token` normalisiert (cad-2ds alter Fehler) sieht der Nutzer „nicht aktivierbar" statt „wartet auf dich". **Der Code entscheidet, ob er eine Sackgasse oder einen Knopf sieht** |
| | **Auf `aud ?? plugin_id` binden. Fehlt beides: abweisen. `sub` NIE prüfen.** *(ratifiziert von agent + v8-corp)* | ohne eigene Bindung akzeptierst du das Token des Nachbarplugins — die Foundation prüft die Signatur, nicht die Zielrichtung |
| | ⚠️ **`aud ?? sub` ist die verbotene Kette** — verwechsle sie nicht mit der erlaubten oben | `aud` und `plugin_id` sind beide **Plugin**-Identität, `sub` ist die **Nutzer**-Identität. Wer auf sie zurückfällt, nimmt jedes Token an, in dem irgendwer die Kennung an die Nutzer-Stelle schreibt |
| | **`sub` niemals validieren** — Format ist host-intern | bricht beim nächsten Host-Update |
| | `autoAccept` als **Autorenkonstante**, nie aus einer Umgebungsvariablen | ein selbstverwalteter Dienst vertraut seinem eigenen Launcher und nimmt `register-host` von jedem auf Loopback |
| | `register-host` **beide Schreibweisen** lesen: `public_key_pem` **und** `public_key` | Handshake scheitert mit „Signaturprüfung fehlgeschlagen", obwohl nur der Schlüssel fehlte |
| **arbeitet** | **`/health` ohne Authentifizierung** — und **kein Host darf sie tokengeschützt erwarten** | 401 auf Health ⇒ myMind schließt „nicht bereit". Dein Dienst **läuft** und wird nie als gesund erkannt. ⚠️ **TeamMind sendet heute immer einen Bearer mit**, also läuft dasselbe Plugin dort und ist bei myMind unsichtbar: **ein Plugin, zwei Hosts, zwei Urteile** |
| | **Health-Antwort: Pflicht ist ausschließlich `status`** (`ok`\|`degraded`\|`unhealthy`) | `version`, `manifest_hash`, `notice`, `last_active` sind **SHOULD/optional**. Eine `{"status":"ok"}` **MUSS bei jedem Host als gesund gelten** — wer mehr verlangt, suspendiert ein vertragskonformes Plugin mit falschem Grund („nicht erreichbar" über einen Dienst, der geantwortet hat). Foundation ≥ `0.19.0` liefert `status` **und** `version`, liegt also **über** der Pflicht — so herum gehört es |
| | **Binde dual-stack** — `serve({ port })` ohne `hostname`. Und `service_endpoint`: `127.0.0.1` (Prüfung **A8**) | **Alle drei Hosts erwarten `127.0.0.1`** — ein abweichender Wert ist mindestens ein Katalog-Unterschied. Der Verbindungsausfall dahinter ist **bedingt und gemessen**: `localhost` löst auf manchen Systemen zu `::1` **zuerst** auf, und ein Client **ohne Familien-Autoselektion** (Node < 20, naive Clients anderer Sprachen) läuft gegen einen `127.0.0.1`-only-Dienst in `ECONNREFUSED`. Moderne Hosts verdecken das per Happy-Eyeballs — **deshalb ist es unsichtbar, nicht selten** |
| | Tenant-Check und RBAC **auch auf dem Tool-Pfad**, nicht nur auf HTTP | der Tool-Pfad umgeht deine Rechteprüfung |
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

## Adressen kommen aus dem Handshake, nie aus der Konvention

Zwei Hosts auf einer Maschine sind kein Gedankenspiel mehr (Stock-myMind neben einer TeamMind-Variante, Pilot). Gemessen: **alle Host-Sidecars und alle effektiven Plugin-Endpunkte sind je Variante port-verschoben** — die Manifest-Adresse ist **nicht** die Verbindungsadresse, und die eine Umrechnungsstelle liegt beim Host.

| | |
|---|---|
| **Dein Port** | binde an den Port, den der **Host beim Start übergibt** — nie an die Zahl aus deinem eigenen Manifest. Die Manifest-Adresse ist Standalone-Dev-Default |
| **Die Rückruf-Adresse des Hosts** | persistiere sie **ausschließlich aus dem Handshake**. Ein hartkodiertes `127.0.0.1:3400` landet auf Varianten-Installationen **beim falschen Host** |

> Die `aud`-Bindung weist das falsche Ziel zwar ab — aber **„falscher Host, dank Token laut" ist kein Adressierungskonzept.** Eine Sicherheitsprüfung, die einen Konfigurationsfehler auffängt, ersetzt ihn nicht.

---

## Eigene Datenbank mit Migrationen? Prüf beim Start, ob dein Code zum Schema passt

**Code-Rollback ohne Schema-Rollback ist der Normalfall, nicht der Sonderfall** — bei beiden V8-Produkten gemessen. Danach läuft **alter Code unbemerkt auf neuem Schema**. Ein Plugin mit eigener SQLite und Migrationen hat dieselbe Lücke bei jedem Update-Rollback.

**Die kleinste Form sind fünf Zeilen:** dein Code-Stand kennt seine eigene Migrationsmenge; vergleich sie beim Start gegen das Migrations-Ledger. **Enthält das Ledger Kennungen, die dieser Stand nicht kennt** → laut melden und **verweigern oder read-only**, statt still weiterzulaufen.

> 🔬 **Und wenn du einen Wächter gegen destruktive Migrationen baust: leite ihn aus deinem eigenen Korpus ab, nie aus einem kopierten Muster.** Gemessen: FamilyMind hat **2** echte `DROP`-Dateien (die zuerst gemeldeten „neun" waren ein Regex-Artefakt), TeamMind **0** — dafür **8** datenverändernde `UPDATE`/`DELETE`/`TRUNCATE` und **20** `UNIQUE`-Verschärfungen. **Die destruktive Klasse ist je Codebasis eine andere.** Ein Wächter nach fremdem Muster prüft die Gefahren der fremden Codebasis.

---

## Der Handshake ist **nicht** einmalig

> Ein Host darf ihn **jederzeit erneut senden**, um ein ersetztes `bridge_token` zuzustellen. Das Plugin **muss** das im Body gelieferte Token übernehmen und das vorherige verwerfen. Nebenwirkungen, die nur zur **Erstaktivierung** gehören, hängen an `is_first_register` — nicht am Handshake.

**Das normiert kein Wunschverhalten, sondern das Ist-Verhalten von zwei Hosts**: myMind stellt erneuerte Tokens seit jeher per Handshake zu (*„handshake before replacing the stored bearer"*), FamilyMind hat es unabhängig ebenso gebaut, v8-corp rotiert mit 6 h Vorlauf. Ein **gescheiterter** Handshake lässt das alte Token und die Aktivierung unangetastet.

Ein eigener `rotate-token`-Endpunkt wurde erwogen und **zurückgezogen** — er wäre ein Bruch für alle bestehenden Plugins, für ein Verhalten, das der Handshake bereits trägt.

> ⏳ **Und der Preis, den das hat, gehört benannt: Scopes sind praktisch unsterblich.** Eine Erneuerung übernimmt die Scopes aus dem **alten** Token. Eine *Kürzung* wirkt damit nie durch bloße Erneuerung — sie braucht einen Menschen. Bei myMind existiert dieser Pfad (`manifest_hash`-Wechsel → Zustimmungs-Gate → Neu-Ableitung); wo er fehlt, ersetzt der Health-Monitor die Berechtigungen still und die Autorisierung liest nur das Token. **Wer erneuert, muss sagen können, wie eine Kürzung je ankommt.**

---

## Rückrufe, die etwas ändern: der Host fragt den Nutzer

Für **schreibende und zerstörende** Rückrufe in den Host bestätigt der **Nutzer** jeden Aufruf — nicht dein Plugin, nicht ein Feld im Token. **Der Beweis ist ein Ort, kein Feld:** alles, was du mitschickst, ist eine Behauptung, und ein Anwesenheits-Token wäre zusätzlich weiterreichbar. Lesende Rückrufe bleiben beim Aktivierungs-Consent.

| | |
|---|---|
| `confirmation_timeout_s` | **120** — Vertragskonstante. Setz deinen Client-Timeout auf **≥ 150 s**, sonst gibst du auf, während der Nutzer noch liest |
| `confirmation_denied` | **endgültig**, nicht transient |
| `confirmation_timeout` | **endgültig.** Keine Antwort heißt: niemand am Gerät. Bildschirm gesperrt ⇒ Dialog unsichtbar ⇒ Abwesenheit lehnt **ehrlich ab** |
| `purpose` (optional) | **eine** Zeile Prosa für den Dialog, host-seitig normalisiert wie `notice`. **Ändert nie das Gate** |

> 🔁 **Kein Retry-Loop auf `confirmation_timeout`.** Wer es versucht, empfängt den heimkommenden Nutzer mit N Dialogen — und trainiert ihn darauf, sie wegzuklicken. **Liegen lassen und beim nächsten nutzer-initiierten Moment neu anbieten.**

> 🔌 **Reißt die Verbindung, bevor die Antwort dich erreicht, wird der Dialog zurückgezogen und der Aufruf gilt als abgebrochen.** Es darf **nie** passieren, dass der Nutzer bestätigt, die Aktion läuft — und dein Plugin hat längst aufgegeben und erfährt es nie.
>
> Allgemein, und weit über diesen Fall hinaus: **eine Bestätigung, deren Ergebnis den Fragenden nicht mehr erreicht, darf keine Wirkung haben.** Wer die Antwort nicht empfangen kann, bekommt keine Wirkung.

> ⏳ **„Sitzung" ist definiert, nicht gefühlt.** Ein Merken je (Plugin, Werkzeug) erlischt beim **frühesten** von: Bildschirmsperre/Abmeldung · **4 Stunden** · App-Ende. Nur im Speicher; ein Neustart beginnt bei null. **Der Stapel-Fall ist genau das** — 200 Visitenkarten zeigen einen Dialog, die Checkbox deckt den Rest, und der Dialogtext sagt es. Keine eigene Stapel-Form.

> 💬 **Die Argumente sind die Wahrheit des Aufrufs, `purpose` ist nur die Prosa dazu.** Der Dialog zeigt immer die Argument-Zusammenfassung — *„Med-Mind will den Kontakt ‚Max Mustermann' ändern"*, nie *„ein Plugin möchte deine Kontakte ändern"*. Deshalb bleibt `purpose` ehrlich optional: ohne es ist der Dialog **konkreter**, nicht vager.

⚠️ **`user_initiated` ist ausdrücklich KEIN Gate-Signal** und steht nicht im Wire. Ein Gate, das auf eine Selbstauskunft des Aufrufers hört, ist kein Gate. Als Dialog-Zeile erlaubt, mehr nicht.

---

## Die Pflichtprüfungen

`node tools/conformance/plugin-conformance.mjs <manifest> [--endpoint URL] [--bundle <wurzel>]`

**A1, A3–A6** Manifest · **B1** Dienst antwortet · **C0** nimmt den Host-Schlüssel entgegen · **C1** akzeptiert ein vertragskonformes Token — *außer der Host wartet noch auf Freigabe (`pending`), dann gilt der Lauf als **nicht geprüft**, nicht als bestanden* · **D1–D3** weist fremdes, falsch signiertes und abgelaufenes Token ab · **D1b** fällt nicht auf den `sub`-Claim zurück · **E1** `input_schema` je Werkzeug. Das übrige **E/F sind Hinweise**, darunter **D1c**.

> 🎯 **D1b prüft den weichen Fall, den C1 und D1 beide durchlassen.** Es schickt ein Token **ohne `aud`, ohne `plugin_id`**, dessen **`sub` die Plugin-Kennung trägt**. Wer korrekt bindet, hat nichts zu binden und **weist ab**. Wer `aud ?? sub` schreibt, akzeptiert.
>
> Der Unterschied zu C1 ist der Kern: **C1 fängt den harten Fall** — ein Verifier, der auf `sub` *besteht*, lehnt jedes gültige Token ab und fällt sofort auf. **D1b fängt den weichen** — eine Kette, die C1 **und** D1 besteht und trotzdem falsch ist. Genau daran ist cad-2d gescheitert, und ein Satz im Vertrag hätte es nicht verhindert.
>
> **D1c ist ein Hinweis und kein Sicherheitspunkt, sondern eine Messung.** Es schickt ein Token **ohne `plugin_id`/`user_id`**: **200** heißt, du überstehst das Ende des Dual-Emits ohne Änderung — **401** heißt, dein Verifier braucht die expliziten Felder. **Heute folgenlos**, weil beide Sätze gesendet werden; deshalb Hinweis. Es sammelt die Bestandsaufnahme ein, ohne dass jemand gefragt werden muss.

**Die Ablage prüft `--bundle`, nicht der Manifest-Lauf:**

| | |
|---|---|
| **A2** | **Hinweis.** Die Zielform gilt am **Installationsort**; der Runner läuft im **Entwicklungs-Repo**, wo das Verzeichnis nach dem Repo heißt (`Med-Mind/` bei `id: med-mind`). Gemessen: **20 von 20** weichen ab. Als Pflichtpunkt hätte er alle rot gemacht — für etwas, das am Zielort nicht mehr gilt |
| **A2b** | **Pflicht, aber nur mit `--bundle`.** Was ausgeliefert wird, hat den endgültigen Ort. ⭐ **Ohne `--bundle` wird der Punkt gar nicht erhoben — er zählt nicht als bestanden** |

Der Stern ist die Lehre aus einem Defekt von heute: E und F standen hinter dem Netz-Abbruch, wurden ohne `--endpoint` übersprungen — und trotzdem als bestanden **mitgezählt**. **Eine Prüfung, die grün meldet, weil sie nichts zu prüfen hatte, ist schlimmer als keine.**

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

> **Zwei Relais, null Messung** (agent) — so entsteht eine Regel aus nichts. A8 baute auf meiner Meldung, meine auf Allgemeinwissen; keiner von uns hatte gemessen, und durch die Weitergabe klang es nach Befund. **Eine Behauptung gewinnt keine Geltung dadurch, dass sie weitergereicht wurde** — sie gewinnt nur Zeugen.
>
> Aufgelöst wurde es nicht durch „wer hat recht", sondern durch die **fehlende Bedingung**: der Ausfall ist real, aber er braucht einen Client **ohne Familien-Autoselektion**. Node ≥ 20 und Bun verdecken ihn vollständig. **Beide Messungen stimmten — die eine hatte die Bedingung nicht genannt, die andere sie nicht hergestellt.** Wenn zwei Messungen sich widersprechen, fehlt meist keine von beiden, sondern die Bedingung dazwischen.

> **Text-Pins prüfen Existenz, nicht Verhalten.** In **zwei real ausgelieferten** Paketen waren die Rollback-Handler wirkungslos — gestorben an ihrer ersten Zeile —, während die Vertragstests grün blieben, weil sie Reihenfolge und Position nur **textlich** festnagelten. Die dauerhafte Form: ein Test, der die echten Funktionsrümpfe **extrahiert und wirklich fallen lässt**, bei jedem Push. **Führ jeden Fehlerpfad mindestens einmal echt aus** — ein Fehlerpfad, der nie gelaufen ist, ist kein Fehlerpfad, sondern eine Absichtserklärung.

> **Ein rotes Ergebnis ist eine Frage, keine Antwort.** Frag bei jedem Rot zuerst, ob der Messpunkt stimmt, bevor du das Gemessene änderst.

> ## 🔁 Was für **Hosts** gilt, nicht für Plugins
>
> **Wer `exp` setzt, muss vor Ablauf rotieren** (v8-corp, v8-fam — an zwei unabhängigen Hosts derselbe Defekt, also eine fehlende Regel und nicht zweimal Schlamperei).
>
> Gemessen: Token-Laufzeit 24 h, Health-Monitor pollt alle 5 Minuten mit dem **gespeicherten** Token, **nichts rotiert ihn**. Nach Ablauf weist das Plugin ab ⇒ `suspended`. **Jedes Plugin in jedem Mandanten suspendiert sich einmal täglich selbst.** Und alle Routing-Lookups filtern auf `bridge_token_expires_at > now` — nach 24 h ist das Plugin auch für Tool-Dispatch und UI-Routing weg. **Der Ausfall ist total, nicht partiell.**
>
> > **Ein Knopf, der die Ursache nicht beheben kann, wird nicht angeboten.** „Fortsetzen" ruft dort den Health-Check mit **genau dem abgelaufenen Token** — der Kommentar daneben behauptet „bestehender Token bleibt valid". Ein Knopf, der nichts bewirkt und so aussieht, als bewirke er etwas, ist schlechter als kein Knopf.
>
> **`/health` tokenfrei ist eine Anforderung an beide Seiten.** Ein Host darf sie nicht tokengeschützt *erwarten* — sonst gilt dasselbe Plugin bei einem Host als gesund und beim anderen als tot.
>
> 💡 **Und der Satz, der den Fehler an der Wurzel trifft** (plug-elec): **Health ist der Endpunkt, den man abfragt, *um* an ein Token zu kommen.** Die naheliegende Intuition — *„Wire-Endpunkte sind bearer-geschützt, Health ist ein Wire-Endpunkt"* — führt genau daneben. Sie hat die Foundation bis `0.18.x` erwischt **und** mindestens ein Plugin mit eigener Bridge, das diesen Code gar nicht benutzt. **Der Fehler wird also nicht geerbt, sondern nachgebaut** — deshalb reicht ein Foundation-Fix nicht, es braucht den Satz.

> 🚧 **Aber schneidet nicht hart.** Bis `plugin-bridge-foundation@0.18.x` lag `/health` **in der Foundation selbst** hinter `auth()` — **jedes** Plugin auf 0.13.x–0.18.x antwortet mit 401, ohne eine Zeile eigenen Code (wiz-mind, `dist/server.js:208`). Ein Host, der ohne Rückfall umstellt, suspendiert **eine ganze Foundation-Generation**.
>
> **Und der Rückfall darf nicht an 401/403 hängen** (v8-fam): erst ohne Ausweis fragen — ist die Antwort **nicht verwertbar** (nicht 2xx **oder** Schema reißt), einmal mit Ausweis nachfassen. Der 401/403-Zuschnitt sperrt alle aus, die stattdessen **404** liefern oder hinter einem Gateway auf eine Login-Seite umleiten. **„Auth fehlt" ist kein zuverlässig erkennbarer Statuscode.**
>
> **Und das ist der eigentliche Grund** (v8-fam), stärker als alles andere, was dafür vorgebracht wurde:
>
> > **Eine Liveness-Probe, die von einem Ausweis mit kürzerer Lebensdauer als der geprüfte Dienst abhängt, meldet den Dienst irgendwann zwangsläufig als tot.**
>
> Ein tokenfreies `/health` macht den Rotations-Defekt oben nicht nur behebbar, sondern **unmöglich**. Gemessen: 24-h-Token, 5-Minuten-Takt, Rotation nur bei „Fortsetzen" — der Monitor schickt ab Tag zwei ein abgelaufenes Token, das Plugin antwortet vertragsgemäß 401, und die Karte sagt „Antwortet gerade nicht" über einen Dienst, der einwandfrei geantwortet hat.
>
> Unsichtbar blieb es, weil **der eigene Mock den Authorization-Header auf `/health` nie prüfte** — kein Smoke lief je durch den Fall, den die Produktion an Tag zwei erreicht. Wieder die Klasse: eine Prüfung, die strukturell nicht fallen kann.

> ## 🟢 Und die Klasse, die alles hiervon verbindet
>
> **Eine Prüfung, die strukturell nicht fallen kann, ist keine Prüfung — sie ist eine Beruhigung.** Drei Fälle in einer Woche, alle grün, alle unfähig zu scheitern:
> - eine B1, die **jede** HTTP-Antwort als bestanden stempelte — sie hätte einen Aktivierungs-Deadlock **als korrekt beschriftet**
> - eine Sonde, die nichts zu prüfen hatte und trotzdem mitzählte
> - ein Test, der auf einem case-insensitiven Dateisystem **zwei Namen für dieselbe Datei** verglich
>
> Frag bei jedem Grün: **unter welcher Bedingung wäre das rot geworden?** Findest du keine, misst du nichts.

> **Wo ein Fehler zu „nichts" geglättet wird, sieht der Nutzer statt eines Problems eine Leere — und über Leere beschwert sich niemand.** An einem Tag dreimal gefunden: verwaiste Daten hinter einer leeren Liste · ein `EACCES`, das der Lesepfad zu `ENOENT` glättet, sodass ein leerer Katalog aussieht wie „nichts gekauft" · eine übersprungene Pflichtprüfung, die als bestanden mitgezählt wurde. **Ein lautes Scheitern ist ein Geschenk.**

> **Ein Feld, dessen Name in die Irre führt, braucht eine mechanische Absicherung — ein Satz im Vertrag reicht nicht** (agent, v8-corp). Von `iss`/`aud`/`sub`/`jti` ist **`sub`** das einzige, dessen Name das Gegenteil nahelegt: *„Subject"* liest sich wie „worum es in diesem Token geht" — und genau so hat cad-2ds Verifier es gelesen. `user_id` sagt, was drinsteht; `sub` **muss man wissen**.
> Wir konvergieren also bewusst auf ein Paar, dessen eine Hälfte selbsterklärend ist und dessen andere eine Falle bleibt: die RFC-Begründung wiegt schwerer (**jede JWT-Bibliothek prüft `aud` von selbst**, ein Eigenname muss jeder Verifier von Hand nachbauen). Daraus folgt aber, dass die Falle **geprüft** gehört, nicht nur beschrieben.

> **Eine Abhilfe, die einen Fehlschlag selten macht, kann ihn ausgerechnet auf die verlagern, die es richtig machen.** myMinds Aktivierung heilt den häufigsten `pending`-Fall selbst (neu registrieren, einmal wiederholen) — übrig bleibt genau der Fall, in dem ein Plugin **wirklich** auf eine menschliche Freigabe wartet, also das Plugin **mit** einer echten Freigabe-Oberfläche. *„Selten" beschreibt die Häufigkeit, nicht die Klasse* — und wer nur die Häufigkeit misst, hält den Rest für gelöst.

> **Wir haben nichts gefunden, indem wir gesucht haben. Wir haben es gefunden, indem wir nachgemessen haben, was wir schon zu wissen glaubten** (agent). Kein Fund dieses Tages kam aus einem Review. Jeder kam aus einer Messung, die jemand nebenbei fuhr, während er etwas anderes baute: die Werkzeug-Erhebung fand die Löschrechte, das Gegenlesen fand den falschen Suspend-Grund, das Formulieren eines Nutzersatzes fand die Autor/Nutzer-Asymmetrie, der Bau des Nutzer-Kanals fand die fehlende Locale. **Die teuersten Irrtümer waren die, bei denen sich niemand unsicher fühlte.**

---

## Offene Schulden — mit Namen und Auslöser

Nicht „fehlt", sondern **„wird geöffnet, wenn X"**. Eine Lücke ohne Auslöser ist eine Ausrede; eine mit Auslöser ist ein Plan.

| Schuld | Wer | Auslöser |
|---|---|---|
| **Locale im Handshake** | plug-tmpl + myMind | das erste Plugin mit **mehr als einer Sprache**. Vorher wäre es ein Feld, das validiert und nichts bewirkt |
| **`host_pending` + Knopf** | ~~myMind~~ **gebaut** · TeamMind, FamilyMind offen | sofort. Die Zeile entsteht sonst erst **nach** erfolgreichem Handshake — wartet ein Plugin auf eine menschliche Freigabe, gibt es keine Karte, also keinen Knopf, also einen **toten Kauf** |
| **Dauerhafter signierter `once`-Nachweis** | Nexus | blockiert das beschlossene Lizenzmodell. Das 10-Minuten-JWT ist ausdrücklich **nicht** dieser Nachweis |
| **Tenantweiten Kauf-Fan-out entfernen** | Nexus | bevor die Lizenzprüfung echt antwortet — sonst zahlt ein Kunde fünfmal für dasselbe Plugin |
| **`exp` beim Minten** | myMind, TeamMind, FamilyMind | Phase 2 der Übergangsfrist. Der Stichtag wird gesetzt, **wenn die Minter gemeldet haben**, nicht vorher |

---

**Nachschlagewerk:** `PLUGIN-PROVIDER-GUIDE.md` (Begründungen, Rezepte, die Fälle dahinter) · `PLUGIN-BRIDGE-WIRE-SPEC.md` (sprachneutral, für Nicht-TypeScript) · `HOST-INTEGRATION-GUIDE.md` (wenn du Plugins aufnimmst) · `tools/conformance/README.md` (Runner, Hash, Provenienz).
