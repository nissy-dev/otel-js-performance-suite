# otel-js-performance-suite

Benchmark suite comparing plain [Hono](https://hono.dev/) HTTP server performance against various [OpenTelemetry](https://opentelemetry.io/) SDK configurations.

Results are collected in CI and published to GitHub Pages.

## What is measured

- **Endpoint**: `GET /` only (single handler returning `Request ID: <random>`)
- **Load test**: [autocannon](https://github.com/mcollina/autocannon) with `-c 100 -p 10 -d 10` and a 5s warmup
- **Telemetry**: OTLP HTTP export to a local OpenTelemetry Collector (Docker), including export overhead

This measures a production-like setup, not in-memory/no-op exporters.

## Variants

| `BENCH_VARIANT` | Description |
|-----------------|-------------|
| `baseline` | Hono only, no OpenTelemetry |
| `trace` | Node SDK with traces → OTLP |
| `metrics` | Node SDK with metrics → OTLP |
| `logs` | Logs SDK with request logs → OTLP |
| `trace-metrics` | Traces + metrics |
| `full` | Traces + metrics + logs |
| `auto-http` | HTTP auto-instrumentation only |
| `hono-otel` | `@hono/otel` middleware |
| `auto-hono-otel` | HTTP auto-instrumentation + `@hono/otel` |

## Local run

Requires Node.js, pnpm, and Docker.

```bash
corepack enable
corepack prepare pnpm@latest --activate

pnpm install
docker compose up -d
pnpm run benchmark
docker compose down
```

Output is written to `results/latest.json`.

To merge into history:

```bash
pnpm run merge-history
```

To run a single server variant manually:

```bash
BENCH_VARIANT=trace pnpm run server
```

## CI and dashboard

- Workflow: [`.github/workflows/benchmark.yml`](.github/workflows/benchmark.yml)
- Runs weekly (Sunday 03:00 UTC), on relevant pushes to `main`, and manually
- Node.js matrix: 22.x and 24.x
- Results committed to `results/` and deployed to GitHub Pages

### GitHub Pages setup

1. Repository **Settings → Pages**
2. **Build and deployment → Source**: GitHub Actions

Dashboard URL (after first deploy):

`https://nissy-dev.github.io/otel-js-performance-suite/`

## Dependency updates

Dependabot opens weekly grouped PRs for OpenTelemetry and Hono packages with a 3-day cooldown.

## Notes

- Benchmark numbers vary between machines and CI runners.
- Compare trends over time rather than absolute values from a single run.
- Methodology references:
  - [async-local-storage-perf-node-24](https://github.com/platformatic/async-local-storage-perf-node-24)
  - [bun-http-framework-benchmark](https://github.com/SaltyAom/bun-http-framework-benchmark) (scenario simplified to a single endpoint)

## License

MIT
