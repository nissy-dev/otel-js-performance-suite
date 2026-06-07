import { type Counter, metrics } from '@opentelemetry/api'
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
} from '@opentelemetry/semantic-conventions'
import { createMiddleware } from 'hono/factory'
import { SERVICE_NAME } from './config.js'

let incomingRequestCounter: Counter | undefined

function getIncomingRequestCounter(): Counter {
  if (!incomingRequestCounter) {
    const meter = metrics.getMeter(SERVICE_NAME)
    incomingRequestCounter = meter.createCounter('http.server.incoming_requests', {
      description: 'Count of incoming HTTP requests handled by the server',
    })
  }
  return incomingRequestCounter
}

export const countIncomingRequests = createMiddleware(async (c, next) => {
  await next()
  getIncomingRequestCounter().add(1, {
    [ATTR_HTTP_REQUEST_METHOD]: c.req.method,
    [ATTR_HTTP_RESPONSE_STATUS_CODE]: c.res.status,
    [ATTR_HTTP_ROUTE]: c.req.routePath,
  })
})
