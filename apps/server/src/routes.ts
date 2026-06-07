import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'

export function createApp(options?: { middleware?: MiddlewareHandler[] }): Hono {
  const app = new Hono()

  for (const middleware of options?.middleware ?? []) {
    app.use('*', middleware)
  }

  app.get('/', (c) => {
    const requestId = Math.random().toString(36).substring(2, 15)
    return c.text(`Request ID: ${requestId}\n`)
  })

  return app
}
