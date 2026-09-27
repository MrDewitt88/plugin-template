# Plattformen und lokale Plugin-Ausführung

Entscheidung aus der Architekturklärung vom 2026-09-27. Grundlage sind die
geprüften Quelltexte, Build-Konfigurationen und Tests; ältere Projekt-Markdowns
wurden für die Beurteilung des aktuellen Supports nicht herangezogen.

## Ziel

Reine Plugins wie ET-Mind bleiben Plugins ohne eigene App. Sie sollen ihre
Funktionen auch innerhalb von goMind auf Android und iOS vollständig lokal,
ohne Internet und ohne erreichbaren TeamMind-/FamilyMind-Host, ausführen können.
Die Ausführung über TeamMind/FamilyMind bleibt zusätzlich verfügbar.

Speak-Mind, Super-Loader und andere eigenständige Anwendungen behalten ihren
eigenen App-Lebenszyklus und ihre Bridge-Anbindung. Eine gemeinsame Schnittstelle
verpflichtet sie nicht zur Umwandlung in reine Plugins.

Theseus-Agent ist die Referenz für den Desktop. Theseus-Agent-Win11 und
Theseus-Agent-Bazzite übernehmen die Entwicklung, sobald die Referenz stabil
genug ist. Ihr aktueller Rückstand ist kein Grund, den gemeinsamen Vertrag nur
auf macOS auszurichten.

## Ausführungsmodell

| Ziel | Ausführung | Noch erforderliche Arbeit |
| --- | --- | --- |
| Theseus-Agent / macOS | Host startet und verwaltet den Plugin-Dienst | Abhängigkeiten und Plugin-Funktionen je Bundle prüfen |
| Theseus-Agent-Win11 | Dasselbe Dienstmodell im Windows-Client | Referenz übernehmen; Runtime, Pfade, native Module und Paketierung auf Windows prüfen |
| Theseus-Agent-Bazzite | Dasselbe Dienstmodell im Linux-Client | Referenz übernehmen; Runtime, native Module und Paketierung auf Bazzite prüfen |
| TeamMind / FamilyMind | Plugin-Dienst beim Host, Oberfläche beim Client | Remote-Zugriff auf UI-Ressourcen und Bridge zuverlässig über den Host vermitteln |
| goMind-Android / goMind-iOS | Plugin-Fachlogik innerhalb der mobilen Host-App | Lokalen Executor, mobile Daten-/Geräteadapter und Plugin-UI integrieren; Engines je Plugin portieren oder einbetten |

Gemeinsam bleiben Plugin-Identität, Tool-Namen und Schemas, Fehlersemantik,
Berechtigungen, fachliche Ergebnisse und die wiederverwendbare Oberfläche.
Ausführung, Persistenz, Dateizugriff und native Bibliotheken brauchen zum
jeweiligen Host passende Adapter. Ein Manifest-Feld allein stellt diese
Fähigkeiten nicht her.

Für neue reine Plugins soll die Fachlogik deshalb von HTTP-Bridge, Prozessstart,
Dateisystem und UI getrennt werden. Portables TypeScript oder eine geeignete
WASM-Engine sind mögliche Wege. Bestehende Python-/native Engines brauchen eine
eigene Prüfung: Ein Desktop-Subprozess ist keine mobile Laufzeit. Python bietet
auf [iOS](https://docs.python.org/3/using/ios.html) und
[Android](https://docs.python.org/3/using/android.html) die Einbettung in native
Apps an; daraus folgt noch keine Kompatibilität aller verwendeten Bibliotheken.

## Im Code beobachtete Grenzen

- `Theseus-Agent/apps/mymind/src/main/plugin-service-manager.ts` startet Bundles
  mit der Host-Bun-Runtime und setzt `PLUGIN_BRIDGE_PORT` sowie `PLUGIN_DATA_DIR`.
  Eine eigene Plugin-App-Oberfläche ist dafür nicht nötig.
- TeamMindV8 und FamilyMindV2 lösen im Plugin-Page-Loader Script-/Style-URLs gegen
  `conn.serviceEndpoint` auf und geben diesen als `bridge-endpoint` weiter.
  Ein Loopback-Endpunkt des Servers ist auf einem entfernten Client nicht
  derselbe Rechner. Dieser UI-Pfad braucht einen passenden Host-Zugriff.
- In den geprüften `main`-Ständen von `MrDewitt88/goMind-Android` und
  `MrDewitt88/goMind-iOS` erkennt `lib/teammind/connection.ts` Host-Tools. Die
  geprüfte Chat-Anbindung über `createMobileToolPlane` stellt damit noch keine
  vollständige Ausführung externer Plugins bereit. Tool-Erkennung ist kein
  Nachweis für einen lokalen Plugin-Executor oder eine Plugin-Oberfläche.
- Das aktuelle Foundation-Manifest kennt `external-service`. Es wurde kein
  neuer Verteiltyp und keine mobile Support-Zusage ergänzt, die vorhandene
  Hosts lediglich akzeptieren, ignorieren oder nicht ausführen würden.

## In dieser Änderung behobene P1/P2-Probleme

1. Der erzeugte Bridge-Server setzt `enforceScopes: true` und prüft damit sowohl
   den Plugin-Floor als auch die zusätzlichen Tool-Scopes.
2. Der mitgelieferte Health-Wrapper liegt im Bridge-Package, wird mitgebaut und
   vor den Auth-/Audience-Middlewares eingebunden. Geschützte Endpunkte bleiben
   geschützt; GET/HEAD auf Health benötigen keinen Token.
3. `items.list` und `items.get` aus dem Manifest haben passende Beispielhandler.
   Das nicht deklarierte Beispiel `documents.list` wurde entfernt.
4. Tool-, UI- und Hook-Handler beziehen `ctx.pluginId` aus dem eigenen Manifest.
   Ein JWT-`sub`, das den Benutzer bezeichnet, wird nicht mehr als Plugin-ID
   verwendet. Die verifizierten Original-Claims bleiben im Kontext erhalten.
5. `pnpm typecheck` prüft im Repository und im Scaffold tatsächlich die
   Workspace-Pakete. Regressionstests weisen einen absichtlich eingebauten
   Typfehler nach.

FamilyMind gehört außerdem zur Standard-Hostliste des Generators.

Prüfergebnis des isolierten Release-Stands am 2026-09-28: 647 Tests erfolgreich,
ein optionaler Granite-Live-Test übersprungen; Workspace-Typecheck und Build
erfolgreich. Zusätzlich wurde ein
kompiliertes Scaffold gegen die veröffentlichte Foundation 0.12.0 geprüft:
Health 200 statt 401, fehlende Scopes 403, beide deklarierten Tools aufrufbar und
Manifest weiterhin ohne Token gesperrt.

Release-Versionen: Bridge Foundation **0.19.1** und create-plugin **0.13.1**.
Die Git-Tags heißen `bridge-foundation@0.19.1` und `create-plugin@0.13.1`.
Bereits installierte Plugins erhalten die Korrekturen erst durch Übernahme der
korrigierten Pakete und einen erneuten Build. Eine npm-Veröffentlichung ist
nicht Bestandteil dieses Git-Releases; der Scaffold bleibt mit der bereits
veröffentlichten Foundation-Abhängigkeit installierbar.

## Nachweis für vollständigen mobilen Support

Vor einer entsprechenden Support-Zusage müssen dieselben fachlichen
Testvektoren auf Desktop und auf Android/iOS bestehen. Auf beiden Mobilgeräten
sind mindestens der Start ohne Host-Verbindung, sämtliche deklarierten Tools,
die Plugin-UI, lokale Persistenz über Neustarts sowie Berechtigungs- und
Mandantentrennung zu prüfen. Native Funktionen brauchen Gerätetests. Eine
Verbindung zu TeamMind/FamilyMind darf den lokalen Test nicht unbemerkt ersetzen.

Diese mobilen Laufzeiten, Geräteprüfungen und Plugin-Portierungen sind
Folgearbeiten in goMind und den jeweiligen Plugin-Repositories; die hier
behobenen Foundation-Fehler liefern noch keinen solchen Nachweis.
