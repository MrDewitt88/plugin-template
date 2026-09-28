# Plugin-Kontext und Tool-Metadaten, Version 1

Dieser Vertrag beschreibt den aktuellen gemeinsamen Durchstich zwischen
Plugin-Providern und Theseus/myMind. Er ergänzt die bestehende Plugin-Bridge.
MCP-Apps-Rendering, `resources/read` und mobile Plugin-Laufzeiten sind weitere
Arbeitsschritte.

## Kontext aus einer Plugin-Ansicht

Eine Plugin-Oberfläche meldet den neuesten Datenstand mit
`plugin:context-update`. Die Svelte-Foundation exportiert
`dispatchContextUpdate(element, detail)` und
`normalizeContextUpdateDetail(detail)`:

```ts
import { dispatchAskKiara, dispatchContextUpdate } from '@nexus-mindgarden/plugin-svelte-foundation'

dispatchContextUpdate(element, {
  schema_version: 1,
  view_id: 'document-detail:doc-42',
  context: 'document-detail',
  references: [{ kind: 'document', id: 'doc-42', title: 'Projektstatus' }],
  selection: 'Der nächste Schritt ist offen.',
  full_content: documentText,
  capabilities: ['markdown'],
})

// Wenn der Nutzer Kiara öffnen möchte, folgt das bestehende Ereignis.
// Der Host übernimmt den neuesten passenden Snapshot in den nächsten Turn.
dispatchAskKiara(element, {
  context: 'document-detail',
  document_id: 'doc-42',
  suggested_prompt: 'Fasse den aktuellen Stand zusammen.',
  capabilities: ['markdown'],
})
```

`context` benennt kurz die Ansicht. `references` enthält Kennungen und kurze
Titel, `selection` die aktuelle Auswahl, `full_content` optional den Inhalt.
`full_content_truncated` wird vom Helfer gesetzt, sobald er kürzt; eine bereits
vom Plugin gemeldete Kürzung bleibt erhalten. Der ganze serialisierte Snapshot
ist auf 50.000 UTF-8-Bytes begrenzt. Eine Auswahl darf höchstens 8.000 Bytes
haben und bleibt beim Kürzen des Dokumentinhalts erhalten. Höchstens 16
Referenzen und 32 Capabilities sind erlaubt.

Der Host bestimmt `plugin_id` selbst aus dem Mount, bindet `view_id` an die
aktive Ansicht und validiert das Event erneut. Er ersetzt den bisherigen
Snapshot dieser Ansicht und verwirft ihn beim Unmount oder Wechsel der
Session. Ein reines Kontext-Update startet keinen Agent-Turn.

Das bestehende `plugin:ask-kiara` bleibt für das Öffnen des Chats bestehen.
Der Host übernimmt den neuesten zur Ansicht und Referenz passenden Snapshot
in den sichtbaren, entfernbaren Chat-Kontext und den nächsten Turn. Beim
Entmounten oder Routewechsel verfällt der Live-Snapshot; ein Sessionwechsel
verwirft auch die Übergabe an den Chat. Ältere Provider können den Dateninhalt
weiter direkt mit `plugin:ask-kiara` liefern. `suggested_prompt` ist
ausschließlich ein Vorschlag für die Nutzereingabe.
Plugin-Inhalte und Referenztitel sind unvertrauenswürdige Daten und dürfen
nicht zu Systemanweisungen werden. Kurze Arbeitsanweisungen erzeugt der Host
aus seinem geprüften Vertrag und den im jeweiligen Providerrequest sichtbaren
Toolnamen. Tool-Sichtbarkeit erteilt keine Berechtigung.

## Tool-Definition und Ergebnis

MCP-Apps-Metadaten stehen an der Tool-Definition, nicht am Tool-Ergebnis:

```yaml
provides:
  mcp_tools:
    - name: items.refresh
      input_schema: { type: object, properties: {} }
      _meta:
        ui:
          resourceUri: ui://example-plugin/item-panel
          visibility: [app]
```

Ohne `visibility` gilt nach der aktuellen MCP-Apps-Spezifikation
`[model, app]`. `[app]` bleibt für berechtigte Aufrufe aus der zugehörigen UI
verfügbar, erscheint aber nicht in der Toolliste des Modells. Der Host prüft
Serverzugehörigkeit und Scopes bei jedem Aufruf. Die ältere Schreibweise
`_meta["ui/resourceUri"]` bleibt beim Parsen erhalten.

Die Bridge-Hülle bleibt `{ ok: true, result }`. Ein Provider kann darin ein
MCP-förmiges Ergebnis zurückgeben:

```json
{
  "ok": true,
  "result": {
    "content": [{ "type": "text", "text": "Eintrag aktualisiert." }],
    "structuredContent": { "id": "doc-42", "revision": 3 },
    "_meta": { "traceId": "sample-42" }
  }
}
```

`content` ist die verständliche Textausgabe für Modell und Hosts ohne UI.
`structuredContent` und `_meta` bleiben für die UI beziehungsweise den Host
erhalten. Sie dürfen nicht durch pauschales JSON-Stringifizieren in einen
Systemprompt oder eine Modellantwort rutschen. Der vollständige Prüfdatensatz
liegt unter `fixtures/context-tool-contract-v1.json` und enthält auch ein
altes `plugin:ask-kiara`-Event sowie ein nur für die App sichtbares Tool.

Referenz für `_meta.ui`, Sichtbarkeit und Ressourcen:
[MCP Apps Specification (Draft)](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx).

## Mobile Host-Naht für Android und iOS

Dieser Abschnitt beschreibt den Vertrag, den ein mobiler Host implementieren
muss. Er behauptet **keine** bereits vorhandene mobile Plugin-Laufzeit. Die
derzeitige Manifest-Distribution `external-service` bleibt für Desktop-Hosts
gültig; ein lokaler mobiler Bundle-Loader und seine Installation sind eigene
Host-Arbeit. Ein neuer `distribution.type` wird dafür nicht vorausgesetzt.

Die Plugin-UI verwendet dieselben Custom-Events wie auf dem Desktop:
`plugin:mcp-call`/`plugin:mcp-response`, `plugin:context-update` und das
ausdrücklich nutzerausgelöste `plugin:ask-kiara`. Ein mobiler Host lädt das
verifizierte UI-Bundle, montiert dessen Custom-Element und bindet alle Listener
an genau diesen Mount. Beim Unmount entfernt er Listener und Live-Kontext.

Ein MCP-Toolname in der Capability-Registrierung ist der **innere** Name. Der
Host ergänzt außen `<plugin-id>.` für Modell und Plugin-UI, auch wenn der innere
Name bereits Punkte enthält. Beispiel: `id: chatbus-mind` plus Manifest-Tool
`chatbus.messages_read` ergibt den Host-/UI-Namen
`chatbus-mind.chatbus.messages_read`. Vor dem Aufruf des zugehörigen
Plugin-Handlers entfernt der Host genau das äußere Präfix; der Handler erhält
`chatbus.messages_read`. Diese Regel entspricht dem aktuellen Theseus-Host.

Bei `plugin:mcp-call` prüft der Host den Namen gegen die **an diesen Mount
gebundene, verifizierte Tool-Registrierung** und die aktuellen Scopes. Diese
Registrierung darf mobile-only Tools wie `chatbus.mobile_sync` enthalten, muss
deren tatsächliche mobile Implementierung aber belegen; das Desktop-Manifest
allein ist dafür keine Ausführungszusage. Format und Installation der mobilen
Registrierung bleiben Host-Arbeit, ohne einen bereits unterstützten
`embedded`-Manifesttyp zu behaupten. Der Host ermittelt Plugin-Identität,
Nutzer und Akteur aus seiner eigenen Session;
`actor_class` im UI-Event ist kein Berechtigungsnachweis. Nur deklarierte und
für die App sichtbare Tools dürfen über den Mount aufgerufen werden. Die
Antwort mit derselben `request_id` geht an das auslösende Custom-Element, nicht
an einen beliebigen anderen Mount. Für Modellaufrufe gilt die getrennte
Sichtbarkeit aus `_meta.ui.visibility`; `[app]` wird dem Modell nicht angeboten.

Plugin-spezifische Offline-Logik kann im vertrauenswürdigen mobilen Host-Bereich
laufen. Bei Chatbus-Mind sind das ein an Installation/Konto gebundener
Persistenz-Port und ein auf Hub und Rolle begrenzter Transport-Port. Die
Custom-Element-UI bekommt weder Zugangsdaten noch eine allgemeine Fetch- oder
Dateisystem-Freigabe; ein nativer Port fügt Zugangsdaten erst nach der
hostseitigen Freigabe einer konkreten Operation an. Ob ein Vorgang offline
vorgemerkt oder am Hub ausgeführt wurde, muss im Ergebnis unterscheidbar sein.

Ein mobiler Durchstich ist erst vollständig, wenn Android **und** iOS das
Bundle laden und mounten, einen erlaubten Tool-Aufruf samt Antwort ausführen,
einen fremden oder nicht deklarierten Toolnamen abweisen, Kontext bei
Ansichtwechsel/Unmount verwerfen und eine Plugin-spezifische Offline-/Sync-
Probe mit sicherer Persistenz bestehen. Ein separat importierbarer Browser-
Client allein erfüllt diese Host-Gates noch nicht.
