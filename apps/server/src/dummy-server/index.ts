import { createServer } from 'node:http'

const port = Number(process.env.DUMMY_SERVER_PORT ?? 3099)

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('ok\n')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Dummy server listening on http://127.0.0.1:${port}`)
})
