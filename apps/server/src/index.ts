import './otel/preload.js'

import { serve } from '@hono/node-server'
import { createApp } from './routes.js'
import { getHonoMiddleware } from './otel/index.js'

const port = Number(process.env.PORT ?? 3000)
const app = createApp({ middleware: getHonoMiddleware() })

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server listening on http://localhost:${info.port} (variant: ${process.env.BENCH_VARIANT ?? 'baseline'})`)
})
