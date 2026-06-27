// GET /static/ui/* — serves Custom-Element-Bundles + supporting assets.
//
// Foundation-Standard für Plugin-Provider die UI-Components als ESM-Bundles
// via render-ui ausliefern (alle aktuellen Plugin-Authoren — markview, plug-
// elec M3, plug-design renderer-host, oracle/plug-ea geplant). Spart das
// Hand-Rolling per Plugin und garantiert konsistente Content-Type-,
// Cache- + Path-Traversal-Sicherheit.
//
// Source-Pattern: plug-elec packages/etmind-bridge/src/static-handler.ts
// (msg #245 M3), oracle's Q5 in render-ui-Thread (msg #259).
//
// Path-Traversal-Safety: alle requested paths werden gegen den root canonicalized;
// `..`-Segmente die out-of-root entkommen würden → 403 forbidden.

import type { Context } from 'hono'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, relative, resolve, sep } from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

export interface StaticUiHandlerOptions {
  /**
   * Absolute filesystem-path zum dist/ui directory. Alle requested files
   * MÜSSEN unter diesem root liegen (path-traversal protection).
   */
  staticDir: string
  /**
   * URL-prefix unter dem die Handler-Route mount'd wird. Default '/static/ui'.
   * Pflicht: muss matched zu wie createBridgeApp das Endpoint einbindet.
   */
  urlPrefix?: string
  /**
   * Cache-Control header. Default 'public, max-age=31536000, immutable' —
   * geeignet für content-hashed esbuild-bundles (file.MAUBSVBY.js). Wenn
   * du non-hashed assets ausliefst, override auf 'no-cache' oder kürzerer max-age.
   */
  cacheControl?: string
  /**
   * Optional 404-handler wenn file fehlt. Default: Drift #103-canonical
   * `{error:{code:'not_found',message:'…'}}`.
   */
  onNotFound?: (c: Context, requestedPath: string) => Response | Promise<Response>
  /**
   * v0.8.0 — Optionale Extension-Allowlist (markview #5348b). Wenn gesetzt,
   * werden NUR Dateien mit einer dieser (lowercased, inkl. führendem Punkt)
   * Extensions serviert; alles andere → 404 `not_found` (kein Existenz-Leak,
   * z.B. versehentliches `secret.env`/`.map` im Bundle-Dir bleibt verborgen).
   * Match passiert VOR stat/read.
   *
   * Default `undefined` → permissiv (jede existierende Datei wird serviert,
   * unbekannte Extensions via `application/octet-stream`) = exakt v0.7.x.
   * Empfohlen restriktiv, z.B. `['.js', '.mjs', '.css', '.map', '.wasm']`.
   */
  allowedExtensions?: readonly string[]
}

export function staticUiHandler(opts: StaticUiHandlerOptions) {
  const root = resolve(opts.staticDir)
  const urlPrefix = (opts.urlPrefix ?? '/static/ui').replace(/\/$/, '')
  const cacheControl = opts.cacheControl ?? 'public, max-age=31536000, immutable'
  const allowedExtensions = opts.allowedExtensions
    ? new Set(opts.allowedExtensions.map((e) => e.toLowerCase()))
    : null

  return async (c: Context): Promise<Response> => {
    const requestedPath = c.req.path
    // Strip URL-prefix to get relative file path
    if (!requestedPath.startsWith(urlPrefix + '/')) {
      return c.json(
        {
          error: { code: 'invalid_request', message: `static path must start with ${urlPrefix}/` },
        },
        400,
      )
    }
    const rel = decodeURIComponent(requestedPath.slice(urlPrefix.length + 1))

    // Path-Traversal protection: normalize, resolve, ensure under root
    const normalized = normalize(rel)
    const absolute = resolve(join(root, normalized))
    const relToRoot = relative(root, absolute)
    if (relToRoot.startsWith('..' + sep) || relToRoot === '..' || relToRoot.startsWith('/')) {
      return c.json(
        { error: { code: 'forbidden', message: 'path-traversal outside static-root rejected' } },
        403,
      )
    }

    // v0.8.0 — Extension-Allowlist (markview #5348b): disallowed ext → 404
    // (kein Existenz-Leak), VOR stat/read. Permissiv wenn allowedExtensions null.
    if (allowedExtensions && !allowedExtensions.has(extname(absolute).toLowerCase())) {
      if (opts.onNotFound) return opts.onNotFound(c, requestedPath)
      return c.json(
        { error: { code: 'not_found', message: `static file not found: ${requestedPath}` } },
        404,
      )
    }

    // Stat + read
    try {
      const st = await stat(absolute)
      if (!st.isFile()) {
        if (opts.onNotFound) return opts.onNotFound(c, requestedPath)
        return c.json(
          { error: { code: 'not_found', message: `static file not found: ${requestedPath}` } },
          404,
        )
      }
    } catch {
      if (opts.onNotFound) return opts.onNotFound(c, requestedPath)
      return c.json(
        { error: { code: 'not_found', message: `static file not found: ${requestedPath}` } },
        404,
      )
    }

    const buf = await readFile(absolute)
    const ext = extname(absolute).toLowerCase()
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': cacheControl,
        'x-content-type-options': 'nosniff',
      },
    })
  }
}
