import { serve } from '@hono/node-server'
import { createApp } from './routes.js'
import { getBenchVariant, getHonoMiddleware, initOtel } from './otel/index.js'

const port = Number(process.env.PORT ?? 3000)
const dummyServerUrl = process.env.DUMMY_SERVER_URL ?? 'http://127.0.0.1:3099'
const variant = getBenchVariant()

if (variant !== 'baseline') {
  initOtel(variant)
}

const app = createApp({
  middleware: getHonoMiddleware(),
  dummyServerUrl,
})

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `Server listening on http://localhost:${info.port} (variant: ${variant})`,
  )
  console.log(`Upstream dummy server: ${dummyServerUrl}`)
})
