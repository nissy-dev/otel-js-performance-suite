const VARIANT_COLORS = {
  baseline: '#4e79a7',
  trace: '#f28e2b',
  metrics: '#e15759',
  logs: '#76b7b2',
  full: '#edc948',
}

const nodeFilter = document.getElementById('nodeFilter')
const metricFilter = document.getElementById('metricFilter')
const statusEl = document.getElementById('status')
const runsTable = document.getElementById('runsTable')
const chartCanvas = document.getElementById('chart')

let history = { runs: [] }
let chart

function getMetricValue(result, metricPath) {
  const [group, field] = metricPath.split('.')
  return result[group]?.[field]
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString()
}

function populateNodeFilter() {
  const versions = [...new Set(history.runs.map((run) => run.nodeVersion))].sort()
  nodeFilter.innerHTML = ''

  for (const version of versions) {
    const option = document.createElement('option')
    option.value = version
    option.textContent = version
    nodeFilter.appendChild(option)
  }
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

function renderChart() {
  const nodeVersion = nodeFilter.value
  const metricPath = metricFilter.value
  const runs = history.runs
    .filter((run) => run.nodeVersion === nodeVersion)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const variants = [...new Set(runs.flatMap((run) => run.results.map((item) => item.variant)))]

  const labels = runs.map((run) => formatTimestamp(run.timestamp))
  const datasets = variants.map((variant) => ({
    label: variant,
    data: runs.map((run) => {
      const result = run.results.find((item) => item.variant === variant)
      return result ? getMetricValue(result, metricPath) : null
    }),
    borderColor: VARIANT_COLORS[variant] ?? '#333',
    backgroundColor: VARIANT_COLORS[variant] ?? '#333',
    tension: 0.2,
    spanGaps: true,
  }))

  if (chart) {
    chart.destroy()
  }

  chart = new Chart(chartCanvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        title: {
          display: true,
          text: `${metricPath} (${nodeVersion})`,
        },
      },
      scales: {
        y: {
          beginAtZero: metricPath.startsWith('latency') ? false : true,
        },
      },
    },
  })

  populateRunsTable(runs)
}

async function init() {
  try {
    const response = await fetch('./data/history.json')
    if (!response.ok) {
      throw new Error(`Failed to load history.json (${response.status})`)
    }
    history = await response.json()
    populateNodeFilter()
    nodeFilter.addEventListener('change', renderChart)
    metricFilter.addEventListener('change', renderChart)
    renderChart()
    statusEl.textContent = `${history.runs.length} benchmark runs loaded.`
  } catch (error) {
    statusEl.innerHTML = `<span class="error">${error.message}</span>`
  }
}

init()
