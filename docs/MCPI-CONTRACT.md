# MCPi und MCPi-UI — Mind-Integrationsvertrag v1

Stand: 2026-10-13. Referenzimplementierung: `@nexus-mindgarden/mcpi-host@0.1.0`.

## Begriffe und Geltungsbereich

**MCPi** bedeutet im Mind-Ökosystem **MCP Integration**. Es bezeichnet das
Integrationsprofil zwischen einer Anwendung/einem Plugin und Theseus/myMind,
goMind, TeamMind oder FamilyMind: Identität, Anmeldung, Werkzeugkatalog,
Rechte, Ausführung und Lebenszyklus. MCPi ist ein Ökosystembegriff, kein
zusätzlicher offizieller MCP-Standard und kein neuer Transport.

**MCPi-UI** ist das optionale UI-Profil von MCPi auf Basis der offiziellen
[MCP Apps-Spezifikation 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).
Auf der Leitung heißen die Methoden weiterhin `resources/list`,
`resources/read`, `ui/initialize`, `tools/call` usw. Die kanonische MIME ist
`text/html;profile=mcp-app`. Der frühere Begriff MCP-UI wird in diesem Projekt
als Oberbegriff verwendet; selbst erfundene MIME-Typen oder Widget-Nachrichten
ersetzen den MCP-Apps-Vertrag nicht.

| Form              | Prozess und Hauptoberfläche                                                        | myMind-Verbindung                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Host-Plugin       | Der Host zeigt die Plugin-Oberfläche; ein deklarierter Dienst kann separat laufen. | Plugin-Manifest + Bridge; MCPi-UI optional.                                                                |
| Eigenständige App | Die App behält ihren eigenen Prozess, ihre Installation und ihre Hauptoberfläche.  | Dieselbe Bridge als Integrationsschnittstelle; MCPi-UI kann eine kompakte App-Oberfläche im Host anbieten. |
| Reiner MCP-Server | Der Betreiber startet einen registrierten MCP-Transport.                           | Reguläre MCP-Werkzeuge/Ressourcen; Theseus unterstützt weiterhin seinen gebundenen stdio-Pfad.             |

Speak-Mind, Super-Loader und von OpenCode erstellte Apps können deshalb
eigenständig bleiben. Die Verbindung mit myMind macht aus ihnen keine
eingebetteten oder vom Host besessenen Anwendungen.

## MCPi v1

1. Jede Integration besitzt eine stabile, eindeutige Manifest-ID. Das Manifest
   beschreibt `provides.mcp_tools` mit lokalen Namen, Schemas und benötigten
   Scopes. Die Tools dürfen ausschließlich über die vom Host freigegebene
   Ausführungsgrenze angesprochen werden.
2. Für die Plugin Bridge gilt `distribution.type: external-service` mit einem
   autorisierten `service_endpoint`. Der Host übernimmt Authentisierung und
   Aktivierung. Ressourcen-URIs und Tool-Ergebnisse bestimmen niemals die
   Zieladresse eines Requests.
3. JWT: registrierter Aussteller, geprüfte Signatur, `aud = manifest.id`,
   Ablaufzeit, `host_id`, `tenant_id` und Benutzeridentität. `sub` ist die
   Benutzeridentität; kompatibel kann `user_id` denselben Benutzer benennen.
   `plugin_id` kann zusätzlich identisch zu `aud` vorhanden sein. Neue
   Host-Verbindungen verlangen `aud`; es ersetzt keine Signaturprüfung.
4. Die Provider-Prüfung erzwingt den Plugin-Floor plus die Tool-/Ressourcen-
   Scopes. Host-Discovery ist eine Rechteübersicht, keine Rechteausweitung.
   Zusätzliche benötigte UI-Scopes müssen im manifestierten/grantbaren
   Scope-Umfang liegen; andernfalls bleibt die Ressource unsichtbar.
5. Jede Sitzung bindet Plugin, Zieladresse, Benutzer/Tenant, aktive Host-
   Identität und Katalog-/Aktivierungsstand. Abmelden, Agent-/Lane-Wechsel,
   Deaktivierung, Rechteänderung und Credential-Wechsel ziehen die Sitzung
   zurück. Nach einer Freigabe wird diese Bindung vor dem Effekt erneut geprüft.
6. Werkzeugbeschreibungen, Schemas und optionales Guidance bleiben Daten aus
   der Integration. Progressive Discovery, etwa Theseus `tools.load`, lädt
   nur freigegebene Fähigkeiten. App-only-Werkzeuge gelangen nicht ins Modell.
7. Der Anwendungsprozess gehört dem Betreiber der App. Eine eigenständige App
   deklariert keinen Host-Startbefehl für ihre Hauptanwendung. Start/Stop,
   Updates und Hintergrundfähigkeit bleiben ihre eigene OS-Verantwortung.
   Host-Verlust beendet die Integration, nicht automatisch die App.

## MCPi-UI v1, Profil B1

Das erste gemeinsame Profil verwendet selbst enthaltenes HTML/JS/CSS ohne
CDN, Netzwerkzugriff im Widget, native Gerätefunktionen oder externe Frames.
Ein Host kann später weitere Fähigkeiten einzeln freigeben; die bloße
Deklaration in `_meta.ui` ist dafür keine Zustimmung.

### Provider → Host

Ein UI-Werkzeug deklariert:

```json
{
  "name": "items.panel",
  "input_schema": { "type": "object", "properties": {}, "additionalProperties": false },
  "_meta": { "ui": { "resourceUri": "ui://my-app/items", "visibility": ["model", "app"] } }
}
```

Die Bridge kündigt `mcp_ui.version: 1` mit den festen Endpunkten an:

| HTTP                                    | Body                             | Antwort                                                                                                    |
| --------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POST /plugin-bridge/v1/resources/list` | `{}`                             | `{ "resources": [...] }`                                                                                   |
| `POST /plugin-bridge/v1/resources/read` | `{ "uri": "ui://my-app/items" }` | `{ "contents": [{ "uri": "ui://my-app/items", "mimeType": "text/html;profile=mcp-app", "text": "..." }] }` |

Es gelten die Authentisierung und Grenzen aus
[MCP-UI-RESOURCES.md](MCP-UI-RESOURCES.md): exakt registrierte URIs, ein HTML-
Eintrag, maximal 512 KiB UTF-8, bis zu 128 Ressourcen und keine persistente
Antwortablage. Der HTTP-Adapter verwendet Ressourcen-Antworten ohne
JSON-RPC- oder `ok/result`-Hülle. `execute-tool` behält seine `ok/result`-Hülle;
deren `result` ist für ein UI-Werkzeug ein MCP `CallToolResult` mit `content`
und gegebenenfalls `structuredContent`.

### Widget → Host → Provider

Die App verwendet den offiziellen `App`-SDK. Der Host verwendet die offizielle
`AppBridge`, bindet Nachrichten an genau den geöffneten Frame und sendet die
Initialisierung sowie verfügbare Tool-Inputs/-Resultate. Ein Widget muss auch
den Ressourcenmodus ohne vorausgehendes Tool-Ergebnis unterstützen, z. B.
mit einem expliziten Laden-/Aktualisieren-Knopf.

`app.callServerTool({ name: 'items.panel', arguments: {} })` enthält immer den
provider-lokalen Namen. Theseus ergänzt intern die Herkunft zu
`my-app.items.panel`; beim Weiterleiten entfernt der Dispatcher ausschließlich
diesen äußeren Präfix einmal. Andere Plugins und Host-Werkzeuge sind über
diesen Kanal nicht erreichbar. `visibility: ["app"]` erlaubt App-Callbacks,
`visibility: ["model"]` verbietet sie. Fehlende Visibility bedeutet beide.

Ein Widget erhält keinen JWT, keine Host-/Capacitor-/Electron-Brücke und keinen
DOM-Zugriff auf den Host. HTML läuft in einem opaken Frame mit `allow-scripts`
und einer restriktiven CSP. Die native Grenze muss zusätzlich Unterframe-
Aufrufe und Dokumentnavigation verhindern. Eine UI ohne diese Grenze darf
auf dem Gerät nicht geöffnet werden.

Es gibt keine automatische Wiederholung einer Wirkung nach Abbruch,
Timeout oder Verbindungsverlust. Bei unbekanntem Ausgang prüft der Benutzer
den App-Zustand. Im Profil B1 werden Schreibwirkungen weiterhin durch den
Host-Freigabepfad vermittelt.

## Implementierter Host-Umfang

| Host           | Eingebundener Pfad                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Theseus/myMind | Aktivierte Plugin-Bridge-Ressourcen im MCP-App-Workbench; stdio bleibt erhalten. Callbacks über den bestehenden ToolExecutor einschließlich Freigabe und Prüfung vor dem Effekt.                                                                       |
| goMind Android | Verbindungen je Lane; Keystore und native Einzel-HTTP-Anfragen. Separater WebView-Renderer mit opakem App-Frame, global gesperrtem Netzwerk und origin-/main-frame-gebundenem MCP-Aktionskanal ohne Capacitor. UI nur mit verfügbarer sicherer Brücke. |
| goMind iOS     | Derselbe Web-Pfad; nativer sicherer Speicher, Prüfung des Script-Message-Frames und WebKit-Sperre für HTTP(S)-Dokumentnavigation.                                                                                                                      |

Mobile Verbindungen benötigen einen erreichbaren HTTPS-Bridge-Endpunkt und
einen dafür vom registrierten Host ausgestellten, plugin-/benutzer-/tenant-
gebundenen Zugang. Ein Desktop-Loopback-Endpunkt wird dadurch nicht von einem
Telefon erreichbar. Android/iOS starten keine Bun-/Node-/Python-Plugin-Dienste.
Der aktuelle Anschluss erfolgt manuell über die Verbindungsfelder; automatische
Gerätekopplung/QR-Ausstellung ist kein Bestandteil dieses Profils. Die bestehenden
TeamMind-/FamilyMind-Zugänge werden nicht an beliebige Plugin-Adressen gesendet.

Die Host-Oberfläche wird derzeit explizit im Workbench/Funktionen-Bereich
geöffnet. Automatisches Einfügen eines Widgets nach jeder Modellantwort,
Sampling, Elicitation, allgemeine Host-Werkzeuge und native Widget-Permissions
sind keine Zusagen des Profils B1.

## Einstieg für OpenCode-App-Projekte

1. Die App normal erstellen; die App hält ihren Bridge-Dienst selbst am Leben.
2. Mit `create-plugin --features=mcp-ui` einen kompatiblen Bridge-/Widget-
   Ausgangspunkt erzeugen. Domain-Engine und Haupt-App bleiben eigenständig.
3. Stabile App-ID, lokale Tool-Namen, Input-/Output-Schemas und kleine,
   ausdrücklich grantbare Scopes definieren. Panel-Werkzeuge verlinken `ui://`.
4. Foundation `createBridgeApp({ mcpUiResources: [...] })` verwenden; mit
   `register-host` den autorisierten Host-Schlüssel registrieren/prüfen.
5. `App`-SDK verwenden, Listener vor `connect()` setzen, Daten als Text/Props
   behandeln und den Ressourcenmodus ohne initiales Ergebnis berücksichtigen.
6. Im Host Manifest installieren/aktivieren; standalone App starten; Ressource
   öffnen und einen Callback prüfen. Mobile zusätzlich mit HTTPS-Zugang und
   nativer Frame-Abnahme prüfen.

Referenztests: `packages/mcpi-host/test/` enthält Provider/Auth-, Browser-/SDK-
und Smartphone-Matrix-Prüfungen. Die goMind-Repos enthalten die Plattform-
Anbindung und Tests. Ein Browser-Test oder ein erfolgreicher nativer Compile
ersetzt keine Ausführung der Sicherheits- und Bedienfälle auf dem Gerät.

## Native Kandidatenprüfung — 2026-10-13

Die goMind-Repos enthalten `1.1.0-rc.1` mit Buildnummer 2. Androids SDK-/Native-
Isolations- und Navigationstests bestehen auf ARM64/API 35 mit 16-KB-Seiten;
21 JVM-Tests und Debug-/Release-Lint bestehen. Der initiale Iframe-Navigations-
Bypass wurde durch den separaten, netzwerkgesperrten Renderer geschlossen.
iOS: vier Bridge-/SDK-Tests und die StreamProxy-Abbruchregression bestehen im
iOS-27-Simulator. Web-Tests: Android 500, iOS 485.

Unsigned APK/AAB und ein unsigniertes iOS-Geräte-Archiv sind vorbereitet.
Die detaillierte Geräteabnahme ist auf Benutzerwunsch zurückgestellt; iOS-
Data Protection benötigt echte Hardware. Die vollständigen finalen nativen
Suiten, Produktionssignierung und Store-Auslieferung bleiben Release-Gates.
Die Kandidaten-Manifeste in den goMind-Repos setzen deshalb `storeReady=false`.
Das ist keine Freigabe als produktiver Store-Release.

## Konkreter Standalone-Starter — Template 0.10.0

`create-plugin <app-id> --kind=app` (Generator 0.16.0) erzeugt eine eigene
Node-24-/Svelte-5-App. Hauptoberfläche und MCPi-Werkzeuge teilen den validierten,
dauerhaften Store; ein separates SDK-Widget liefert B1-Lesen/Anlegen.
Hosts werden nach Fingerprint-/Aussteller-Prüfung lokal freigegeben;
Audience, Scopes und signierte Benutzer-/Tenant-Claims bleiben verpflichtend.
Die App verwaltet ihren Prozess. Native App-Pakete werden in ihrem Projekt ergänzt.

Kopierbares Beispiel: `examples/standalone-notes-app/`; OpenCode-Auftrag:
`examples/standalone-notes-app/OPENCODE.md`. Die gepinnte Foundation ist
beigelegt und mit SHA-256 prüfbar; eine npm-Veröffentlichung wird nicht vorausgesetzt.
B1-Aktionen benutzen Buttons/SDK-Callbacks. Formularnavigation ist im opaken
Frame gesperrt und darf für den Starter nicht freigeschaltet werden.

Die zurückgestellte mobile Geräteabnahme bleibt unverändert ein goMind-Release-Gate.
