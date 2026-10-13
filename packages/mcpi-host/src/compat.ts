/** Standalone function: also serialized into the opaque resource's realm. */
export function installAbortCompatibility(): void {
  if (typeof AbortSignal.any !== 'function')
    Object.defineProperty(AbortSignal, 'any', {
      configurable: true,
      writable: true,
      value: (signals: Iterable<AbortSignal>): AbortSignal => {
        const controller = new AbortController()
        const listeners: { signal: AbortSignal; listener: () => void }[] = []
        const cleanup = (): void => {
          for (const entry of listeners) entry.signal.removeEventListener('abort', entry.listener)
        }
        controller.signal.addEventListener('abort', cleanup, { once: true })
        for (const signal of signals) {
          if (signal.aborted) {
            controller.abort(signal.reason)
            break
          }
          const listener = (): void => controller.abort(signal.reason)
          listeners.push({ signal, listener })
          signal.addEventListener('abort', listener, { once: true })
        }
        return controller.signal
      },
    })
  if (typeof AbortSignal.timeout !== 'function')
    Object.defineProperty(AbortSignal, 'timeout', {
      configurable: true,
      writable: true,
      value: (ms: number): AbortSignal => {
        if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError('Invalid timeout')
        const controller = new AbortController()
        setTimeout(
          () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
          ms,
        )
        return controller.signal
      },
    })
}
