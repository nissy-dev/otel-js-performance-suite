export type BenchVariant =
  | 'baseline'
  | 'trace'
  | 'metrics'
  | 'logs'
  | 'trace-metrics'
  | 'full'
  | 'auto-http'
  | 'hono-otel'
  | 'auto-hono-otel'

export const BENCH_VARIANTS: BenchVariant[] = [
  'baseline',
  'trace',
  'metrics',
  'logs',
  'trace-metrics',
  'full',
  'auto-http',
  'hono-otel',
  'auto-hono-otel',
]

export interface HistogramStats {
  average: number
  p50: number
  p99: number
}

export interface VariantResult {
  variant: BenchVariant
  requestsPerSec: HistogramStats
  latencyMs: HistogramStats
}

export interface BenchmarkEnvironment {
  node: string
  platform: string
  hono?: string
  '@opentelemetry/sdk-node'?: string
}

export interface BenchmarkRun {
  timestamp: string
  commit?: string
  nodeVersion: string
  environment: BenchmarkEnvironment
  results: VariantResult[]
}

export interface HistoryFile {
  runs: BenchmarkRun[]
}
