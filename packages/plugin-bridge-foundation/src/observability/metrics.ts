// Dependency-free in-process Counter + Gauge + Registry mit Prometheus
// exposition-format 0.0.4 output. Reference: plug-elec etmind-bridge/src/
// metrics.ts (msg #240) + plug-db OBS1 (prometheus-fastapi-instrumentator).
//
// Designed für single-process Plugin-Bridges. Multi-process would need
// inter-process aggregation (out of scope).

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')
}

function formatLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort()
  if (keys.length === 0) return ''
  const parts = keys.map((k) => `${k}="${escapeLabelValue(labels[k]!)}"`)
  return `{${parts.join(',')}}`
}

function metricKey(labels: Record<string, string>): string {
  return formatLabels(labels)
}

export interface MetricSample {
  labels: Record<string, string>
  value: number
}

export interface MetricCollector {
  readonly name: string
  readonly help: string
  readonly type: 'counter' | 'gauge'
  collect(): MetricSample[]
}

export class Counter implements MetricCollector {
  readonly type = 'counter' as const
  private readonly samples = new Map<string, MetricSample>()

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[] = [],
  ) {}

  inc(labels: Record<string, string> = {}, n = 1): void {
    if (n < 0) throw new Error(`Counter.inc: negative increment ${n}`)
    const sanitized = this.sanitizeLabels(labels)
    const key = metricKey(sanitized)
    const existing = this.samples.get(key)
    if (existing) {
      existing.value += n
    } else {
      this.samples.set(key, { labels: sanitized, value: n })
    }
  }

  collect(): MetricSample[] {
    return Array.from(this.samples.values())
  }

  private sanitizeLabels(labels: Record<string, string>): Record<string, string> {
    if (this.labelNames.length === 0) return {}
    const out: Record<string, string> = {}
    for (const name of this.labelNames) {
      out[name] = labels[name] ?? ''
    }
    return out
  }
}

export class Gauge implements MetricCollector {
  readonly type = 'gauge' as const
  private readonly samples = new Map<string, MetricSample>()
  private readonly producer: (() => number) | null

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[] = [],
    producer: (() => number) | null = null,
  ) {
    this.producer = producer
  }

  set(value: number, labels: Record<string, string> = {}): void {
    const sanitized = this.sanitizeLabels(labels)
    this.samples.set(metricKey(sanitized), { labels: sanitized, value })
  }

  inc(n = 1, labels: Record<string, string> = {}): void {
    const sanitized = this.sanitizeLabels(labels)
    const key = metricKey(sanitized)
    const existing = this.samples.get(key)
    if (existing) {
      existing.value += n
    } else {
      this.samples.set(key, { labels: sanitized, value: n })
    }
  }

  collect(): MetricSample[] {
    if (this.producer) {
      // Producer-mode: re-compute every collection cycle (uptime, registry-size).
      return [{ labels: {}, value: this.producer() }]
    }
    return Array.from(this.samples.values())
  }

  private sanitizeLabels(labels: Record<string, string>): Record<string, string> {
    if (this.labelNames.length === 0) return {}
    const out: Record<string, string> = {}
    for (const name of this.labelNames) {
      out[name] = labels[name] ?? ''
    }
    return out
  }
}

export class MetricsRegistry {
  private readonly metrics: MetricCollector[] = []

  register<T extends MetricCollector>(metric: T): T {
    this.metrics.push(metric)
    return metric
  }

  /** Prometheus text-exposition format 0.0.4. */
  collect(): string {
    const lines: string[] = []
    for (const m of this.metrics) {
      lines.push(`# HELP ${m.name} ${m.help}`)
      lines.push(`# TYPE ${m.name} ${m.type}`)
      for (const sample of m.collect()) {
        lines.push(`${m.name}${formatLabels(sample.labels)} ${sample.value}`)
      }
    }
    return lines.join('\n') + '\n'
  }
}
