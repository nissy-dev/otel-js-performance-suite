const port = process.argv[2]
const requestCount = Number(process.argv[3] ?? 5)

if (!port) {
  console.error('Usage: tsx benchmark/profile-load.ts <port> [requestCount]')
  process.exit(1)
}

const url = `http://localhost:${port}/`

for (let i = 0; i < requestCount; i++) {
  const response = await fetch(url)
  await response.text()
}
