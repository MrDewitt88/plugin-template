// Dependency-free in-process Counter + Gauge + Registry mit Prometheus
// exposition-format 0.0.4 output. Reference: plug-elec etmind-bridge/src/
// metrics.ts (msg #240) + plug-db OBS1 (prometheus-fastapi-instrumentator).
//
// Designed für single-process Plugin-Bridges. Multi-process would need
// inter-process aggregation (out of scope).
function escapeLabelValue(v) {
    return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}
function formatLabels(labels) {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0)
        return '';
    const parts = keys.map((k) => `${k}="${escapeLabelValue(labels[k])}"`);
    return `{${parts.join(',')}}`;
}
function metricKey(labels) {
    return formatLabels(labels);
}
export class Counter {
    name;
    help;
    labelNames;
    type = 'counter';
    samples = new Map();
    constructor(name, help, labelNames = []) {
        this.name = name;
        this.help = help;
        this.labelNames = labelNames;
    }
    inc(labels = {}, n = 1) {
        if (n < 0)
            throw new Error(`Counter.inc: negative increment ${n}`);
        const sanitized = this.sanitizeLabels(labels);
        const key = metricKey(sanitized);
        const existing = this.samples.get(key);
        if (existing) {
            existing.value += n;
        }
        else {
            this.samples.set(key, { labels: sanitized, value: n });
        }
    }
    collect() {
        return Array.from(this.samples.values());
    }
    sanitizeLabels(labels) {
        if (this.labelNames.length === 0)
            return {};
        const out = {};
        for (const name of this.labelNames) {
            out[name] = labels[name] ?? '';
        }
        return out;
    }
}
export class Gauge {
    name;
    help;
    labelNames;
    type = 'gauge';
    samples = new Map();
    producer;
    constructor(name, help, labelNames = [], producer = null) {
        this.name = name;
        this.help = help;
        this.labelNames = labelNames;
        this.producer = producer;
    }
    set(value, labels = {}) {
        const sanitized = this.sanitizeLabels(labels);
        this.samples.set(metricKey(sanitized), { labels: sanitized, value });
    }
    inc(n = 1, labels = {}) {
        const sanitized = this.sanitizeLabels(labels);
        const key = metricKey(sanitized);
        const existing = this.samples.get(key);
        if (existing) {
            existing.value += n;
        }
        else {
            this.samples.set(key, { labels: sanitized, value: n });
        }
    }
    collect() {
        if (this.producer) {
            // Producer-mode: re-compute every collection cycle (uptime, registry-size).
            return [{ labels: {}, value: this.producer() }];
        }
        return Array.from(this.samples.values());
    }
    sanitizeLabels(labels) {
        if (this.labelNames.length === 0)
            return {};
        const out = {};
        for (const name of this.labelNames) {
            out[name] = labels[name] ?? '';
        }
        return out;
    }
}
export class MetricsRegistry {
    metrics = [];
    register(metric) {
        this.metrics.push(metric);
        return metric;
    }
    /** Prometheus text-exposition format 0.0.4. */
    collect() {
        const lines = [];
        for (const m of this.metrics) {
            lines.push(`# HELP ${m.name} ${m.help}`);
            lines.push(`# TYPE ${m.name} ${m.type}`);
            for (const sample of m.collect()) {
                lines.push(`${m.name}${formatLabels(sample.labels)} ${sample.value}`);
            }
        }
        return lines.join('\n') + '\n';
    }
}
//# sourceMappingURL=metrics.js.map