# OpenCode — konkreter Arbeitsauftrag für StandaloneNotesApp

Diese Vorlage ist ein laufendes App-Projekt mit einem Einträge-Beispiel. Die Integrationsgrenzen sind bereits vorhanden; ersetze das Beispiel durch die gewünschte Domain.

## Direkt verwendbarer Prompt

> Arbeite in diesem Repo und lies AGENTS.md und OPENCODE.md. Implementiere die eigenständige App für **[Zweck, Nutzer und gewünschte Funktionen einsetzen]**. Behalte ihre eigene Hauptoberfläche und ihren eigenen Lebenszyklus. Ersetze die Einträge-Domain durch fachliche Modelle und Operationen. Haupt-App und MCPi-Bridge müssen dieselbe Domain und denselben Datenspeicher verwenden. Ergänze lokale Tool-Namen, Input-Schemas, ausdrücklich grantbare Scopes und ein kompaktes MCPi-UI-B1-Widget. Erhalte die explizite Host-Freigabe, signierte Benutzer-/Tenant-Bindung und die isolierten SDK-Callbacks. Führe Typprüfung, Tests, Build und einen SDK-Rundlauf aus. Native Plattform-Pakete nur für die ausdrücklich gewünschten Zielplattformen ergänzen. Aktualisiere die Dokumentation am Ende anhand des tatsächlichen Codes.

## Reihenfolge

1. `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm start`; die private `open-app.html` aus dem ausgegebenen Datenordner öffnen und die unveränderte Vorlage einmal bedienen.
2. Domain in `src/domain.ts` modellieren: Eingaben validieren, Besitzer korrekt binden, Speicher und Fehlerverhalten festlegen. Die bestehenden Tests für Persistenz, Rechte und Schlüsselwechsel erhalten.
3. Hauptoberfläche in `src/ui/App.svelte` ausbauen. Domain-Funktionen über die eigene App-API in `src/application.ts` aufrufen.
4. Tools im Manifest und in `src/bridge.ts` gleichzeitig ergänzen. Keine Plugin-ID vor die lokalen Tool-Namen setzen; myMind ergänzt die Herkunft. Leserechte bleiben Floor, Schreiboperationen verlangen passende zusätzliche Scopes.
5. Das kompakte Widget in `packages/standalone-notes-app-mcp-ui/src/` bearbeiten. Offizielles `App`-SDK verwenden; Handler vor `connect()` setzen; auch ohne initiales Tool-Ergebnis funktionieren. Das Widget erhält weder JWT noch direkten HTTP-/Datei-/Native-Zugang. Die vollständige Haupt-App ist nicht auf den Widget-Umfang beschränkt.
6. App selbst starten, Manifest aus der App herunterladen, in myMind aktivieren, Host-Fingerprint prüfen und lokal freigeben. Den Widget-Rundlauf Lesen → Anlegen → Lesen prüfen; dieselben Daten müssen in der Haupt-App erscheinen. UUIDs der `.env` müssen zum myMind-Arbeitsraum passen.
7. Für Android/iOS oder native Desktop-Pakete den App-eigenen Prozess, Hintergrundbetrieb, sicheren Speicher und Distribution festlegen. Der Host übernimmt diese Aufgaben nicht automatisch. Mobile Anbindung braucht einen erreichbaren HTTPS-Bridge-Endpunkt.

## Abnahme

- Haupt-App funktioniert bei geschlossenem myMind; Daten und bestätigte Hosts überleben einen App-Neustart.
- Ausstehende, gesperrte, falsche oder rotierte Host-Schlüssel können keine Werkzeuge ausführen.
- Falsche Audience/Aussteller, fehlende Scopes und Benutzerwechsel öffnen keine fremden Daten.
- Ein freigegebener Widget-Callback wirkt in der gemeinsamen Domain; direkte Widget-Netzwerk-/Native-Aufrufe sind nicht Teil des B1-Profils.
- Kein horizontaler Überlauf bei 320/360/390/430 px; Texte aus der Domain bleiben Text.
- Unbekannte Schreibausgänge werden durch Zustandsprüfung geklärt, nicht automatisch wiederholt.

Die vollständigen mobilen goMind-Geräteprüfungen und deren Store-Freigabe bleiben eine separate Abnahme. Vertrag: https://github.com/MrDewitt88/plugin-template/blob/main/docs/MCPI-CONTRACT.md.
