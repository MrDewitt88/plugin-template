/**
 * withPublicHealth — macht `/plugin-bridge/v1/health` tokenfrei, ohne die
 * Foundation zu tauschen.
 *
 * ── Wofür ────────────────────────────────────────────────────────────────
 * `plugin-bridge-foundation` legte von 0.12.0 bis 0.18.x `auth()` VOR die
 * Health-Route. Jedes Plugin auf diesen Versionen antwortet damit auf ein
 * tokenloses GET /health mit 401 — ohne eine Zeile eigenen Code.
 *
 * Der Host pollt Health, um Bereitschaft festzustellen, BEVOR er ein Token
 * hat. Ein 401 heisst fuer ihn "nicht bereit": der Dienst laeuft, antwortet,
 * funktioniert — und wird nie als gesund erkannt. Kein Absturz, kein
 * Log-Eintrag, nur eine Karte mit "antwortet gerade nicht".
 *
 * Behoben in 0.19.0. Solange die Version nicht auf npm liegt, ist DAS hier
 * der Weg — und er ist auch dann noch richtig, wenn du eine EIGENE Bridge
 * baust: der Fehler wird nicht aus der Foundation geerbt, sondern aus
 * derselben Intuition nachgebaut ("Wire-Endpunkte sind bearer-geschuetzt,
 * Health ist ein Wire-Endpunkt"). Er ist es nicht:
 *
 *   Health ist der Endpunkt, den man abfragt, UM an ein Token zu kommen.
 *
 * ── Verwendung ───────────────────────────────────────────────────────────
 *   import { withPublicHealth } from './public-health.mjs'
 *
 *   const app = createBridgeApp({ manifest, registry, toolHandlers })
 *   serve({ fetch: withPublicHealth(app.fetch, manifest), port: resolvePort() })
 *
 * VOR dem Routing, nicht als `.use()` danach — sonst laeuft der Guard der
 * Foundation zuerst und antwortet bereits mit 401.
 *
 * ── Warum die Antwort statisch ist ───────────────────────────────────────
 * Die Sonde teilt sich die Warteschlange mit Nutzerklicks (wiz-mind). Kein
 * Modell, kein Netz, kein Lock, keine Datenbank — nur Werte, die beim Start
 * schon feststehen. Wer hier rechnet, macht aus einer Bereitschaftsfrage
 * einen Grund fuer `unhealthy`.
 *
 * ── Was NICHT passiert ───────────────────────────────────────────────────
 * Alles ausser GET/HEAD auf genau diesem Pfad wird unveraendert delegiert.
 * handshake, manifest, execute-tool, render-ui und invoke-hook bleiben
 * auth-geschuetzt. Pruef das mit einem Test, nicht mit Zuversicht: eine
 * Reparatur, die zu viel oeffnet, waere schlimmer als der Fehler.
 */

const HEALTH_PATH = '/plugin-bridge/v1/health'

/**
 * @param {(req: Request) => Response | Promise<Response>} innerFetch
 * @param {{ version?: string, id?: string }} [manifest]  Version fuer die Antwort (optional, SHOULD).
 * @param {{ manifestHash?: string, status?: () => 'ok'|'degraded'|'unhealthy' }} [opts]
 */
export function withPublicHealth(innerFetch, manifest = {}, opts = {}) {
  // Beim Start festgezurrt — zur Sondenzeit wird nichts mehr berechnet.
  const body = JSON.stringify({
    status: 'ok',
    ...(manifest.version ? { version: manifest.version } : {}),
    ...(opts.manifestHash ? { manifest_hash: opts.manifestHash } : {}),
  })
  const headers = { 'content-type': 'application/json' }

  return (req, ...rest) => {
    const method = req.method.toUpperCase()
    if (method === 'GET' || method === 'HEAD') {
      // Nur der exakte Pfad. Query-Strings ignorieren, Unterpfade delegieren.
      const path = new URL(req.url).pathname
      if (path === HEALTH_PATH) {
        // `status` darf eine Funktion sein, MUSS aber synchron und billig sein.
        const s = opts.status ? opts.status() : 'ok'
        const payload = s === 'ok' ? body : JSON.stringify({ ...JSON.parse(body), status: s })
        return new Response(method === 'HEAD' ? null : payload, { status: 200, headers })
      }
    }
    return innerFetch(req, ...rest)
  }
}
