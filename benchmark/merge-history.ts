import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BenchmarkRun, HistoryFile } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const resultsDir = join(rootDir, 'results')
const historyPath = join(resultsDir, 'history.json')
const maxRuns = Number(process.env.HISTORY_MAX_RUNS ?? 100)

function readJsonFile<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return undefined
  }
}

function collectLatestRuns(): BenchmarkRun[] {
  const runs: BenchmarkRun[] = []

  for (const file of readdirSync(resultsDir)) {
    if (!file.startsWith('latest') || !file.endsWith('.json') || file === 'history.json') {
      continue
    }
    const run = readJsonFile<BenchmarkRun>(join(resultsDir, file))
    if (run) {
      runs.push(run)
    }
  }

  return runs
}

function main() {
  const existing = readJsonFile<HistoryFile>(historyPath) ?? { runs: [] }
  const incoming = collectLatestRuns()

  if (incoming.length === 0) {
    console.log('No latest*.json files found to merge')
    return
  }

  const merged = [...existing.runs]

  for (const run of incoming) {
    const duplicate = merged.find(
      (item) => item.timestamp === run.timestamp && item.nodeVersion === run.nodeVersion,
    )
    if (!duplicate) {
      merged.push(run)
    }
  }

  merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const pruned = merged.slice(-maxRuns)

  mkdirSync(resultsDir, { recursive: true })
  writeFileSync(historyPath, `${JSON.stringify({ runs: pruned }, null, 2)}\n`)
  console.log(`Updated ${historyPath} (${pruned.length} runs)`)
}

main()
