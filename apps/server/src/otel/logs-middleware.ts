import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import { createMiddleware } from 'hono/factory'
import { SERVICE_NAME } from './config.js'

const logger = logs.getLogger(SERVICE_NAME)

export const emitRequestLog = createMiddleware(async (c, next) => {
  await next()
  logger.emit({
    severityNumber: SeverityNumber.INFO,
    severityText: 'INFO',
    body: 'request handled',
    attributes: {
      'http.method': c.req.method,
      'http.route': c.req.path,
      'http.status_code': c.res.status,
    },
  })
})
