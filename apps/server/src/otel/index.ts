import type { MiddlewareHandler } from 'hono'
import { httpInstrumentationMiddleware } from '@hono/otel'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { logs } from '@opentelemetry/api-logs'
import { LoggerProvider } from '@opentelemetry/sdk-logs'
import {
  createLogRecordProcessor,
  createMetricReader,
  createResource,
  createTraceExporter,
  SERVICE_NAME,
} from './config.js'
import { emitRequestLog } from './logs-middleware.js'

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

let sdk: NodeSDK | LoggerProvider | undefined

function startNodeSdk(instance: NodeSDK) {
  sdk = instance
  instance.start()
}

function httpOnlyInstrumentation() {
  return [new HttpInstrumentation()]
}

export function initOtel(variant: BenchVariant): void {
  const resource = createResource()

  switch (variant) {
    case 'trace':
      startNodeSdk(
        new NodeSDK({
          resource,
          traceExporter: createTraceExporter(),
        }),
      )
      break

    case 'metrics':
      startNodeSdk(
        new NodeSDK({
          resource,
          metricReader: createMetricReader(),
        }),
      )
      break

    case 'logs': {
      const loggerProvider = new LoggerProvider({
        resource,
        processors: [createLogRecordProcessor()],
      })
      logs.setGlobalLoggerProvider(loggerProvider)
      sdk = loggerProvider
      break
    }

    case 'trace-metrics':
      startNodeSdk(
        new NodeSDK({
          resource,
          traceExporter: createTraceExporter(),
          metricReader: createMetricReader(),
        }),
      )
      break

    case 'full':
      startNodeSdk(
        new NodeSDK({
          resource,
          traceExporter: createTraceExporter(),
          metricReader: createMetricReader(),
          logRecordProcessors: [createLogRecordProcessor()],
        }),
      )
      break

    case 'auto-http':
      startNodeSdk(
        new NodeSDK({
          resource,
          traceExporter: createTraceExporter(),
          metricReader: createMetricReader(),
          instrumentations: httpOnlyInstrumentation(),
        }),
      )
      break

    case 'hono-otel':
      startNodeSdk(
        new NodeSDK({
          resource,
          traceExporter: createTraceExporter(),
        }),
      )
      break

    case 'auto-hono-otel':
      startNodeSdk(
        new NodeSDK({
          resource,
          traceExporter: createTraceExporter(),
          metricReader: createMetricReader(),
          instrumentations: httpOnlyInstrumentation(),
        }),
      )
      break

    default:
      break
  }
}

export function getHonoMiddleware(): MiddlewareHandler[] {
  const variant = (process.env.BENCH_VARIANT ?? 'baseline') as BenchVariant
  const middleware: MiddlewareHandler[] = []

  if (variant === 'logs' || variant === 'full') {
    middleware.push(emitRequestLog)
  }

  if (variant === 'hono-otel' || variant === 'auto-hono-otel') {
    middleware.push(httpInstrumentationMiddleware({ serviceName: SERVICE_NAME }))
  }

  return middleware
}

export async function shutdownOtel(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
    sdk = undefined
  }
}
