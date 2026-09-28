// Plugin → Host CustomEvent dispatch-Helpers.
// Spec-Reference: V8 docs/PLUGIN-KIARA-INTEGRATION.md §2.3 +
// PLUGIN-BRIDGE-PROTOCOL.md §"Plugin → Host Events"
//
// Alle Events sind `bubbles: true, composed: true` — Pflicht damit sie
// Shadow-DOM-Boundary crossen können.

export interface PluginNavigateDetail {
  route_path: string
}

export interface PluginRefreshDetail {
  scope?: string
}

export interface PluginErrorDetail {
  code: string
  message: string
}

export interface PluginAskKiaraDetail {
  context: string
  document_id?: string
  document_title?: string
  selection?: string
  cursor_offset?: number
  full_content?: string
  full_content_truncated?: boolean
  suggested_prompt?: string
  capabilities: string[]
}

/** Data snapshot for the currently mounted plugin view. The host supplies the
 * owning plugin identity and treats all fields here as untrusted data. */
export interface PluginContextReference {
  kind: string
  id: string
  title?: string
}

export interface PluginContextUpdateDetail {
  schema_version: 1
  /** Stable within one mounted plugin view; the host binds it to that mount. */
  view_id: string
  /** Short view kind, e.g. "document-detail"; never a model instruction. */
  context: string
  references?: PluginContextReference[]
  selection?: string
  cursor_offset?: number
  full_content?: string
  full_content_truncated?: boolean
  capabilities?: string[]
}

/**
 * Dispatch plugin:navigate von einem Source-Element. Host catched + routet
 * zu `/plugins/<plugin_id><route_path>`.
 */
export function dispatchNavigate(source: EventTarget, detail: PluginNavigateDetail): boolean {
  return source.dispatchEvent(
    new CustomEvent('plugin:navigate', {
      detail,
      bubbles: true,
      composed: true,
    }),
  )
}

/**
 * Dispatch plugin:refresh — Host invalidates loads / re-fetcht sidebar etc.
 */
export function dispatchRefresh(source: EventTarget, detail: PluginRefreshDetail = {}): boolean {
  return source.dispatchEvent(
    new CustomEvent('plugin:refresh', {
      detail,
      bubbles: true,
      composed: true,
    }),
  )
}

/**
 * Dispatch plugin:error — Host loggt + optional Toast.
 */
export function dispatchError(source: EventTarget, detail: PluginErrorDetail): boolean {
  return source.dispatchEvent(
    new CustomEvent('plugin:error', {
      detail,
      bubbles: true,
      composed: true,
    }),
  )
}

/**
 * Dispatch plugin:ask-kiara — Host opens Kiara-Dialog mit Plugin-Context.
 * Spec-Reference: V8 PLUGIN-KIARA-INTEGRATION.md §2.1 PluginAskKiaraDetail.
 *
 * Pflicht-Felder: context + capabilities[]. Plus optional document_id /
 * title / selection / full_content / suggested_prompt.
 *
 * MAX_CONTENT_BYTES = 50000 — Plugin trimmt selber (Spec §2.2).
 */
export function dispatchAskKiara(source: EventTarget, detail: PluginAskKiaraDetail): boolean {
  return source.dispatchEvent(
    new CustomEvent('plugin:ask-kiara', {
      detail,
      bubbles: true,
      composed: true,
    }),
  )
}

export const MAX_CONTENT_BYTES = 50_000
export const MAX_SELECTION_BYTES = 8_000
export const MAX_CONTEXT_SNAPSHOT_BYTES = 50_000

function assertText(field: string, value: unknown, maxBytes: number): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    new TextEncoder().encode(value).length > maxBytes
  ) {
    throw new TypeError(`${field} must be nonempty text of at most ${maxBytes} UTF-8 bytes`)
  }
}

/** Canonical provider-side snapshot. Hosts must validate again at their own
 * boundary; this helper only prevents accidental oversized event details. */
export function normalizeContextUpdateDetail(
  detail: PluginContextUpdateDetail,
): PluginContextUpdateDetail {
  if (!detail || detail.schema_version !== 1) throw new TypeError('schema_version must be 1')
  assertText('view_id', detail.view_id, 256)
  assertText('context', detail.context, 256)
  const normalized: PluginContextUpdateDetail = {
    schema_version: 1,
    view_id: detail.view_id,
    context: detail.context,
  }

  if (detail.references !== undefined) {
    if (!Array.isArray(detail.references) || detail.references.length > 16) {
      throw new TypeError('references must be an array of at most 16 entries')
    }
    normalized.references = detail.references.map((reference) => {
      if (!reference || typeof reference !== 'object') throw new TypeError('invalid reference')
      assertText('reference.kind', reference.kind, 64)
      assertText('reference.id', reference.id, 256)
      if (reference.title !== undefined) assertText('reference.title', reference.title, 256)
      return {
        kind: reference.kind,
        id: reference.id,
        ...(reference.title !== undefined ? { title: reference.title } : {}),
      }
    })
  }
  if (detail.selection !== undefined) {
    if (
      typeof detail.selection !== 'string' ||
      new TextEncoder().encode(detail.selection).length > MAX_SELECTION_BYTES
    ) {
      throw new TypeError(`selection must be text of at most ${MAX_SELECTION_BYTES} UTF-8 bytes`)
    }
    normalized.selection = detail.selection
  }
  if (detail.cursor_offset !== undefined) {
    if (!Number.isSafeInteger(detail.cursor_offset) || detail.cursor_offset < 0) {
      throw new TypeError('cursor_offset must be a nonnegative integer')
    }
    normalized.cursor_offset = detail.cursor_offset
  }
  if (detail.full_content !== undefined) {
    if (typeof detail.full_content !== 'string') throw new TypeError('full_content must be text')
    if (
      detail.full_content_truncated !== undefined &&
      typeof detail.full_content_truncated !== 'boolean'
    ) {
      throw new TypeError('full_content_truncated must be boolean')
    }
    const trimmed = trimToMaxBytes(detail.full_content)
    normalized.full_content = trimmed.text
    normalized.full_content_truncated = trimmed.truncated || detail.full_content_truncated === true
  }
  if (detail.capabilities !== undefined) {
    if (!Array.isArray(detail.capabilities) || detail.capabilities.length > 32) {
      throw new TypeError('capabilities must be an array of at most 32 entries')
    }
    normalized.capabilities = detail.capabilities.map((capability) => {
      assertText('capability', capability, 128)
      return capability
    })
  }

  // The snapshot as a whole has one budget. Preserve the user's selection and
  // references; shorten document body first when serialized JSON exceeds it.
  const size = () => new TextEncoder().encode(JSON.stringify(normalized)).byteLength
  if (size() > MAX_CONTEXT_SNAPSHOT_BYTES && normalized.full_content !== undefined) {
    let limit = new TextEncoder().encode(normalized.full_content).byteLength
    while (size() > MAX_CONTEXT_SNAPSHOT_BYTES && limit > 0) {
      limit = Math.max(0, limit - (size() - MAX_CONTEXT_SNAPSHOT_BYTES))
      normalized.full_content = trimToMaxBytes(detail.full_content!, limit).text
      normalized.full_content_truncated = true
    }
  }
  if (size() > MAX_CONTEXT_SNAPSHOT_BYTES) {
    throw new TypeError(`context snapshot exceeds ${MAX_CONTEXT_SNAPSHOT_BYTES} UTF-8 bytes`)
  }
  return normalized
}

/** Replaces the previous snapshot for this mounted view. Merely updating
 * context does not ask the host to start an agent turn. */
export function dispatchContextUpdate(
  source: EventTarget,
  detail: PluginContextUpdateDetail,
): boolean {
  return source.dispatchEvent(
    new CustomEvent('plugin:context-update', {
      detail: normalizeContextUpdateDetail(detail),
      bubbles: true,
      composed: true,
    }),
  )
}

/**
 * UTF-8-safe trim auf max-bytes. Cut nur an code-point-boundaries (kein
 * broken-multi-byte-char). Returnt { text, truncated }.
 *
 * Plugin nutzt das vor dispatchAskKiara() für full_content.
 */
export function trimToMaxBytes(
  text: string,
  max: number = MAX_CONTENT_BYTES,
): {
  text: string
  truncated: boolean
} {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const bytes = encoder.encode(text)
  if (bytes.byteLength <= max) return { text, truncated: false }
  // Trim + decode mit `stream: true` → ignoriert incomplete trailing seq
  const trimmed = decoder.decode(bytes.slice(0, max), { stream: true })
  return { text: trimmed, truncated: true }
}
