export interface MetricSample {
    labels: Record<string, string>;
    value: number;
}
export interface MetricCollector {
    readonly name: string;
    readonly help: string;
    readonly type: 'counter' | 'gauge';
    collect(): MetricSample[];
}
export declare class Counter implements MetricCollector {
    readonly name: string;
    readonly help: string;
    readonly labelNames: readonly string[];
    readonly type: "counter";
    private readonly samples;
    constructor(name: string, help: string, labelNames?: readonly string[]);
    inc(labels?: Record<string, string>, n?: number): void;
    collect(): MetricSample[];
    private sanitizeLabels;
}
export declare class Gauge implements MetricCollector {
    readonly name: string;
    readonly help: string;
    readonly labelNames: readonly string[];
    readonly type: "gauge";
    private readonly samples;
    private readonly producer;
    constructor(name: string, help: string, labelNames?: readonly string[], producer?: (() => number) | null);
    set(value: number, labels?: Record<string, string>): void;
    inc(n?: number, labels?: Record<string, string>): void;
    collect(): MetricSample[];
    private sanitizeLabels;
}
export declare class MetricsRegistry {
    private readonly metrics;
    register<T extends MetricCollector>(metric: T): T;
    /** Prometheus text-exposition format 0.0.4. */
    collect(): string;
}
//# sourceMappingURL=metrics.d.ts.map