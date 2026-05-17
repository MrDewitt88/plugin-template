import { describe, expect, it } from 'vitest'
import { Counter, Gauge, Logger, MetricsRegistry } from '../src/observability/index.js'

class StringSink {
  data = ''
  write(s: string) {
    this.data += s
  }
}

describe('Logger', () => {
  it('emits JSON-Lines with service + level + msg + ctx', () => {
    const out = new StringSink()
    const err = new StringSink()
    const log = new Logger({ service: 'test', stdout: out, stderr: err })
    log.info('hello', { foo: 'bar' })
    const parsed = JSON.parse(out.data.trim())
    expect(parsed).toMatchObject({ level: 'info', service: 'test', msg: 'hello', foo: 'bar' })
    expect(typeof parsed.ts).toBe('string')
  })

  it('routes warn + error to stderr, info + debug to stdout', () => {
    const out = new StringSink()
    const err = new StringSink()
    const log = new Logger({ service: 'test', level: 'debug', stdout: out, stderr: err })
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    const outLines = out.data.trim().split('\n')
    const errLines = err.data.trim().split('\n')
    expect(outLines).toHaveLength(2)
    expect(errLines).toHaveLength(2)
    expect(JSON.parse(outLines[0]!).level).toBe('debug')
    expect(JSON.parse(outLines[1]!).level).toBe('info')
    expect(JSON.parse(errLines[0]!).level).toBe('warn')
    expect(JSON.parse(errLines[1]!).level).toBe('error')
  })

  it('filters below minimum level', () => {
    const out = new StringSink()
    const err = new StringSink()
    const log = new Logger({ service: 'test', level: 'warn', stdout: out, stderr: err })
    log.debug('skip')
    log.info('skip')
    log.warn('keep')
    expect(out.data).toBe('')
    expect(err.data).toContain('keep')
  })

  it('text format emits key=value pairs', () => {
    const out = new StringSink()
    const err = new StringSink()
    const log = new Logger({ service: 'test', format: 'text', stdout: out, stderr: err })
    log.info('msg', { key1: 'v1', key2: 42 })
    expect(out.data).toContain('INFO  [test] msg')
    expect(out.data).toContain('key1=v1')
    expect(out.data).toContain('key2=42')
  })

  it('child() merges bound context', () => {
    const out = new StringSink()
    const err = new StringSink()
    const log = new Logger({ service: 'test', stdout: out, stderr: err })
    const child = log.child({ request_id: 'r-1' })
    child.info('msg', { extra: 'x' })
    const parsed = JSON.parse(out.data.trim())
    expect(parsed.request_id).toBe('r-1')
    expect(parsed.extra).toBe('x')
  })
})

describe('Counter', () => {
  it('inc with labels accumulates by key', () => {
    const c = new Counter('http_requests_total', 'help', ['method', 'status'])
    c.inc({ method: 'GET', status: '200' })
    c.inc({ method: 'GET', status: '200' })
    c.inc({ method: 'POST', status: '201' })
    const samples = c.collect()
    expect(samples).toHaveLength(2)
    const get200 = samples.find((s) => s.labels.method === 'GET' && s.labels.status === '200')
    expect(get200?.value).toBe(2)
  })

  it('rejects negative increment', () => {
    const c = new Counter('n', 'h', [])
    expect(() => c.inc({}, -1)).toThrow(/negative/)
  })
})

describe('Gauge', () => {
  it('set + inc work on labeled samples', () => {
    const g = new Gauge('temperature', 'help', ['room'])
    g.set(22, { room: 'kitchen' })
    g.inc(3, { room: 'kitchen' })
    const samples = g.collect()
    expect(samples[0]?.value).toBe(25)
  })

  it('producer-mode re-computes on collect()', () => {
    let counter = 0
    const g = new Gauge('counter', 'help', [], () => ++counter)
    expect(g.collect()[0]?.value).toBe(1)
    expect(g.collect()[0]?.value).toBe(2)
  })
})

describe('MetricsRegistry exposition format', () => {
  it('produces valid Prometheus exposition 0.0.4 text', () => {
    const reg = new MetricsRegistry()
    const c = reg.register(new Counter('http_requests_total', 'Total reqs', ['method']))
    c.inc({ method: 'GET' }, 5)
    reg.register(new Gauge('uptime_seconds', 'Uptime', [], () => 42))

    const out = reg.collect()
    expect(out).toContain('# HELP http_requests_total Total reqs')
    expect(out).toContain('# TYPE http_requests_total counter')
    expect(out).toContain('http_requests_total{method="GET"} 5')
    expect(out).toContain('# TYPE uptime_seconds gauge')
    expect(out).toContain('uptime_seconds 42')
  })

  it('escapes special characters in label values', () => {
    const reg = new MetricsRegistry()
    const c = reg.register(new Counter('events', 'help', ['path']))
    c.inc({ path: 'a"b\\c\nd' })
    const out = reg.collect()
    expect(out).toContain('a\\"b\\\\c\\nd')
  })
})
