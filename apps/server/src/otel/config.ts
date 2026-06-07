import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

export const SERVICE_NAME = 'hono-bench'

export function getOtlpEndpoint(): string {
  return process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'
}

export function createResource() {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
  })
}

export function createTraceExporter() {
  const endpoint = getOtlpEndpoint()
  return new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
}

export function createMetricReader() {
  const endpoint = getOtlpEndpoint()
  return new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
    exportIntervalMillis: 1000,
  })
}

export function createLogRecordProcessor() {
  const endpoint = getOtlpEndpoint()
  return new BatchLogRecordProcessor(
    new OTLPLogExporter({ url: `${endpoint}/v1/logs` }),
  )
}
