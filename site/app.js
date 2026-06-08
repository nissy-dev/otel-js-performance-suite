const VARIANT_COLORS = {
  baseline: '#4e79a7',
  trace: '#f28e2b',
  metrics: '#e15759',
  logs: '#76b7b2',
  full: '#edc948',
}

const VARIANT_ORDER = ['baseline', 'trace', 'metrics', 'logs', 'full']

const metricFilter = document.getElementById('metricFilter')
const viewFilter = document.getElementById('viewFilter')
const statusEl = document.getElementById('status')
const runsTable = document.getElementById('runsTable')
const comparisonTable = document.getElementById('comparisonTable')
const chartCanvas = document.getElementById('chart')

let history = { runs: [] }
let chart

function getMetricValue(result, metricPath) {
  const [group, field] = metricPath.split('.')
  return result[group]?.[field]
}

function getBaselineResult(run) {
  return run.results.find((item) => item.variant === 'baseline')
}

function getPercentOfBaseline(value, baselineValue) {
  if (value == null || baselineValue == null || baselineValue === 0) {
    return null
  }
  return (value / baselineValue) * 100
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString()
}

function formatAbsoluteValue(metricPath, value) {
  if (value == null) {
    return '-'
  }
  if (metricPath.startsWith('latency')) {
    return `${value.toFixed(1)} ms`
  }
  return value.toFixed(0)
}

function formatPercent(value) {
  if (value == null) {
    return '-'
  }
  return `${value.toFixed(1)}%`
}

function formatDelta(percent) {
  if (percent == null) {
    return '-'
  }
  if (percent === 100) {
    return '0.0%'
  }
  const delta = percent - 100
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}%`
}

function getDeltaClass(metricPath, percent) {
  if (percent == null || percent === 100) {
    return ''
  }

  const isThroughput = metricPath.startsWith('requestsPerSec')
  const isBetter = isThroughput ? percent > 100 : percent < 100
  return isBetter ? 'delta-better' : 'delta-worse'
}

function getSortedRuns() {
  return [...history.runs].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

function getLatestRun(runs) {
  return runs.at(-1)
}

function populateRunsTable(runs) {
  runsTable.innerHTML = ''

  for (const run of [...runs].reverse()) {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${formatTimestamp(run.timestamp)}</td>
      <td>${run.nodeVersion}</td>
      <td>${run.environment['@opentelemetry/sdk-node'] ?? '-'}</td>
      <td>${run.environment.hono ?? '-'}</td>
      <td>${run.commit ?? '-'}</td>
    `
    runsTable.appendChild(row)
  }
}

function populateComparisonTable(run, metricPath) {
  comparisonTable.innerHTML = ''

  if (!run) {
    return
  }

  const baselineValue = getMetricValue(getBaselineResult(run), metricPath)
  const variants = [...new Set(run.results.map((item) => item.variant))]
  const orderedVariants = [
    ...VARIANT_ORDER.filter((variant) => variants.includes(variant)),
    ...variants.filter((variant) => !VARIANT_ORDER.includes(variant)),
  ]

  for (const variant of orderedVariants) {
    const result = run.results.find((item) => item.variant === variant)
    const value = result ? getMetricValue(result, metricPath) : null
    const percent = getPercentOfBaseline(value, baselineValue)
    const row = document.createElement('tr')
    const deltaClass = getDeltaClass(metricPath, percent)

    row.innerHTML = `
      <td>${variant}</td>
      <td>${formatAbsoluteValue(metricPath, value)}</td>
      <td>${formatPercent(percent)}</td>
      <td class="${deltaClass}">${formatDelta(percent)}</td>
    `
    comparisonTable.appendChild(row)
  }
}

function renderChart() {
  const metricPath = metricFilter.value
  const view = viewFilter.value
  const runs = getSortedRuns()
  const variants = [...new Set(runs.flatMap((run) => run.results.map((item) => item.variant)))]

  const labels = runs.map((run) => formatTimestamp(run.timestamp))
  const datasets = variants.map((variant) => ({
    label: variant,
    data: runs.map((run) => {
      const result = run.results.find((item) => item.variant === variant)
      const value = result ? getMetricValue(result, metricPath) : null

      if (view === 'percent') {
        const baselineValue = getMetricValue(getBaselineResult(run), metricPath)
        return getPercentOfBaseline(value, baselineValue)
      }

      return value
    }),
    borderColor: VARIANT_COLORS[variant] ?? '#333',
    backgroundColor: VARIANT_COLORS[variant] ?? '#333',
    tension: 0.2,
    spanGaps: true,
  }))

  if (chart) {
    chart.destroy()
  }

  const chartTitle =
    view === 'percent' ? `${metricPath} (% of baseline)` : metricPath

  chart = new Chart(chartCanvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        title: {
          display: true,
          text: chartTitle,
        },
      },
      scales: {
        y: {
          beginAtZero: view === 'percent' ? false : !metricPath.startsWith('latency'),
        },
      },
    },
  })

  populateRunsTable(runs)
  populateComparisonTable(getLatestRun(runs), metricPath)
}

async function init() {
  try {
    const response = await fetch('./data/history.json')
    if (!response.ok) {
      throw new Error(`Failed to load history.json (${response.status})`)
    }
    history = await response.json()
    metricFilter.addEventListener('change', renderChart)
    viewFilter.addEventListener('change', renderChart)
    renderChart()
    statusEl.textContent = `${history.runs.length} benchmark runs loaded.`
  } catch (error) {
    statusEl.innerHTML = `<span class="error">${error.message}</span>`
  }
}

init()
