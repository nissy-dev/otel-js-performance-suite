import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type ProfilerTool = '0x' | 'flame'

const tool = process.argv[2] as ProfilerTool
if (tool !== '0x' && tool !== 'flame') {
  console.error('Usage: tsx benchmark/profile.ts <0x|flame>')
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const binDir = join(rootDir, 'node_modules', '.bin')
const nodeBin = process.execPath
const zeroXBin = join(binDir, '0x')
const flameBin = join(binDir, 'flame')
const tsxBin = join(binDir, 'tsx')
const serverEntry = join(rootDir, 'apps/server/src/index.ts')
const loadEntry = join(rootDir, 'benchmark/profile-load.ts')
const dummyServerEntry = join(rootDir, 'apps/server/src/dummy-server/index.ts')
const port = Number(process.env.PORT ?? 3000)
const dummyServerPort = Number(process.env.DUMMY_SERVER_PORT ?? 3099)
const dummyServerUrl = `http://127.0.0.1:${dummyServerPort}`
const variant = process.env.BENCH_VARIANT ?? 'full'
const requestCount = Number(process.env.PROFILE_REQUESTS ?? 5)
const profileDir = join(rootDir, 'profiles', variant, tool)
const benchUrl = `http://localhost:${port}/`

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForEndpoint(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // retry
    }
    await sleep(200)
  }

  throw new Error(`Endpoint did not become ready at ${url}`)
}

async function waitForCollector(timeoutMs = 30_000): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint)
      if (response.ok || response.status === 404 || response.status === 405) {
        return
      }
    } catch {
      // retry
    }
    await sleep(500)
  }

  throw new Error(`OpenTelemetry Collector did not become ready at ${endpoint}`)
}

function spawnManagedProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): ChildProcess {
  return spawn(command, args, {
    cwd: options.cwd ?? rootDir,
    env: options.env ?? process.env,
    stdio: 'inherit',
  })
}

async function stopManagedProcess(
  child: ChildProcess,
  signal: NodeJS.Signals = 'SIGTERM',
  timeoutMs = 5_000,
): Promise<void> {
  child.kill(signal)
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, timeoutMs)
    child.on('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function serverEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BENCH_VARIANT: variant,
    PORT: String(port),
    DUMMY_SERVER_URL: dummyServerUrl,
    OTEL_EXPORTER_OTLP_ENDPOINT:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
  }
}

async function sendSampleRequests(): Promise<void> {
  console.log(`Sending ${requestCount} requests to ${benchUrl}...`)

  for (let i = 0; i < requestCount; i++) {
    const response = await fetch(benchUrl)
    await response.text()
  }
}

async function startDummyServer(): Promise<ChildProcess> {
  const child = spawnManagedProcess(tsxBin, [dummyServerEntry], {
    env: {
      ...process.env,
      DUMMY_SERVER_PORT: String(dummyServerPort),
    },
  })

  try {
    await waitForEndpoint(dummyServerUrl)
    return child
  } catch (error) {
    await stopManagedProcess(child)
    throw error
  }
}

async function profileWithServer(
  startServer: () => ChildProcess,
  onReady: (child: ChildProcess) => Promise<void>,
): Promise<void> {
  const child = startServer()

  try {
    await waitForEndpoint(benchUrl)
    await onReady(child)
  } finally {
    await stopManagedProcess(child, 'SIGINT', 30_000)
  }
}

async function run0x(): Promise<void> {
  const loadCmd = `${tsxBin} ${loadEntry} $PORT ${requestCount}`
  const args = [
    '-o',
    '-P',
    loadCmd,
    '--name',
    variant,
    '--title',
    `otel-bench ${variant}`,
    '-D',
    profileDir,
    '-F',
    join(profileDir, 'flamegraph.html'),
    '--',
    nodeBin,
    '--import',
    'tsx',
    serverEntry,
  ]

  await new Promise<void>((resolve, reject) => {
    const child = spawnManagedProcess(zeroXBin, args, { env: serverEnv() })
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`0x exited with code ${code ?? 'unknown'}`))
    })
  })

  console.log(`0x flamegraph: ${join(profileDir, 'flamegraph.html')}`)
}

async function runFlame(): Promise<void> {
  await profileWithServer(
    () =>
      spawnManagedProcess(flameBin, ['run', '--node-options=--import tsx', serverEntry], {
        cwd: profileDir,
        env: serverEnv(),
      }),
    async () => {
      await sendSampleRequests()
    },
  )

  console.log(`Flame outputs: ${profileDir}`)
}

async function main() {
  mkdirSync(profileDir, { recursive: true })

  if (process.env.SKIP_DOCKER !== '1') {
    console.log('Starting OpenTelemetry Collector...')
    execSync('docker compose up -d otel-collector', { cwd: rootDir, stdio: 'inherit' })
    await waitForCollector()
  }

  console.log(`Profiling variant "${variant}" with ${tool} (${requestCount} requests)...`)
  console.log(`Output directory: ${profileDir}`)

  const dummyServer = await startDummyServer()

  try {
    if (tool === '0x') {
      await run0x()
    } else {
      await runFlame()
    }
  } finally {
    await stopManagedProcess(dummyServer)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
