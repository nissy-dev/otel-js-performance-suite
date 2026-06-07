import type { MiddlewareHandler } from 'hono'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { logs } from '@opentelemetry/api-logs'
import { LoggerProvider } from '@opentelemetry/sdk-logs'
import {
  createLogRecordProcessor,
  createMetricReader,
  createResource,
  createTraceExporter,
} from './config.js'
import { emitRequestLog } from './logs-middleware.js'
import { countIncomingRequests } from './request-metrics-middleware.js'

export type BenchVariant =
  | 'baseline'
  | 'trace'
  | 'metrics'
  | 'logs'
  | 'full'

export const BENCH_VARIANTS: BenchVariant[] = [
  'baseline',
  'trace',
  'metrics',
  'logs',
  'full',
]

let sdk: NodeSDK | LoggerProvider | undefined

function startNodeSdk(instance: NodeSDK) {
  sdk = instance
  instance.start()
}

function httpInstrumentation() {
  return [new HttpInstrumentation()]
}

export function getBenchVariant(): BenchVariant {
  return (process.env.BENCH_VARIANT ?? 'baseline') as BenchVariant
}

export function initOtel(variant: BenchVariant): void {
  const resource = createResource()

  switch (variant) {
    case 'trace':
      startNodeSdk(
        new NodeSDK({
          resource,
          traceExporter: createTraceExporter(),
          instrumentations: httpInstrumentation(),
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

    case 'full':
      startNodeSdk(
        new NodeSDK({
          resource,
          traceExporter: createTraceExporter(),
          metricReader: createMetricReader(),
          logRecordProcessors: [createLogRecordProcessor()],
          instrumentations: httpInstrumentation(),
        }),
      )
      break

    default:
      break
  }
}

export function getHonoMiddleware(): MiddlewareHandler[] {
  const variant = getBenchVariant()
  const middleware: MiddlewareHandler[] = []

  if (variant === 'metrics' || variant === 'full') {
    middleware.push(countIncomingRequests)
  }

  if (variant === 'logs' || variant === 'full') {
    middleware.push(emitRequestLog)
  }

  return middleware
}

export async function shutdownOtel(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
    sdk = undefined
  }
}
