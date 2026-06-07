import autocannon from 'autocannon'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BENCH_VARIANTS, type BenchmarkRun, type VariantResult } from './types.js'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const resultsDir = join(rootDir, 'results')
const serverEntry = join(rootDir, 'apps/server/src/index.ts')
const dummyServerEntry = join(rootDir, 'apps/server/src/dummy-server/index.ts')
const port = Number(process.env.PORT ?? 3000)
const dummyServerPort = Number(process.env.DUMMY_SERVER_PORT ?? 3099)
const dummyServerUrl = `http://127.0.0.1:${dummyServerPort}`
const baseUrl = `http://localhost:${port}`
const benchUrl = `${baseUrl}/`

function runCommand(command: string, options?: { cwd?: string }) {
  execSync(command, { stdio: 'inherit', cwd: options?.cwd ?? rootDir })
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

async function waitForDummyServer(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(dummyServerUrl)
      if (response.ok) {
        return
      }
    } catch {
      // retry
    }
    await sleep(200)
  }

  throw new Error(`Dummy server did not become ready at ${dummyServerUrl}`)
}

async function waitForServer(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(benchUrl)
      if (response.ok) {
        return
      }
    } catch {
      // retry
    }
    await sleep(200)
  }

  throw new Error(`Server did not become ready at ${benchUrl}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getPackageVersion(packageName: string): string | undefined {
  try {
    const pkg = require(`${packageName}/package.json`) as { version?: string }
    return pkg.version
  } catch {
    return undefined
  }
}

function getCommit(): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

async function runAutocannon(
  url: string,
): Promise<Pick<VariantResult, 'requestsPerSec' | 'latencyMs'>> {
  const result = await autocannon({
    url,
    connections: 100,
    pipelining: 10,
    duration: 10,
    warmup: [{ connections: 100, duration: 5 }],
  })

  return {
    requestsPerSec: {
      average: result.requests.average,
      p50: result.requests.p50,
      p99: result.requests.p99,
    },
    latencyMs: {
      average: result.latency.average,
      p50: result.latency.p50,
      p99: result.latency.p99,
    },
  }
}

function spawnManagedProcess(
  entry: string,
  env: NodeJS.ProcessEnv,
): ChildProcess {
  return spawn('pnpm', ['exec', 'tsx', entry], {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function stopManagedProcess(child: ChildProcess): Promise<void> {
  child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 3000)
    child.on('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function startDummyServer(): Promise<ChildProcess> {
  const child = spawnManagedProcess(dummyServerEntry, {
    ...process.env,
    DUMMY_SERVER_PORT: String(dummyServerPort),
  })

  try {
    await waitForDummyServer()
    return child
  } catch (error) {
    await stopManagedProcess(child)
    throw error
  }
}

async function benchmarkVariant(variant: (typeof BENCH_VARIANTS)[number]): Promise<VariantResult> {
  const child = spawnManagedProcess(serverEntry, {
    ...process.env,
    BENCH_VARIANT: variant,
    PORT: String(port),
    DUMMY_SERVER_URL: dummyServerUrl,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
  })

  try {
    await waitForServer()
    const stats = await runAutocannon(benchUrl)
    return {
      variant,
      requestsPerSec: stats.requestsPerSec,
      latencyMs: stats.latencyMs,
    }
  } finally {
    await stopManagedProcess(child)
  }
}

async function main() {
  const skipDocker = process.env.SKIP_DOCKER === '1'

  if (!skipDocker) {
    console.log('Starting OpenTelemetry Collector...')
    runCommand('docker compose up -d otel-collector')
    await waitForCollector()
  }

  const nodeVersion = process.version
  const outputSuffix = process.env.BENCHMARK_OUTPUT_SUFFIX
  const outputName = outputSuffix ? `latest-node${outputSuffix}.json` : 'latest.json'

  const run: BenchmarkRun = {
    timestamp: new Date().toISOString(),
    commit: getCommit(),
    nodeVersion,
    environment: {
      node: nodeVersion,
      platform: process.platform,
      hono: getPackageVersion('hono'),
      '@opentelemetry/sdk-node': getPackageVersion('@opentelemetry/sdk-node'),
    },
    results: [],
  }

  console.log('Starting dummy server...')
  const dummyServer = await startDummyServer()

  try {
    for (const variant of BENCH_VARIANTS) {
      console.log(`\n=== Benchmarking variant: ${variant} ===`)
      const result = await benchmarkVariant(variant)
      run.results.push(result)
      console.log(
        `  req/sec avg: ${result.requestsPerSec.average.toFixed(0)}, latency p50: ${result.latencyMs.p50.toFixed(1)}ms`,
      )
    }

    mkdirSync(resultsDir, { recursive: true })
    const outputPath = join(resultsDir, outputName)
    writeFileSync(outputPath, `${JSON.stringify(run, null, 2)}\n`)
    console.log(`\nWrote ${outputPath}`)
  } finally {
    await stopManagedProcess(dummyServer)
  }

  if (!skipDocker && process.env.KEEP_COLLECTOR !== '1') {
    runCommand('docker compose down')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
