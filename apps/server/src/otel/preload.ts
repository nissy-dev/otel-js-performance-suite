import { initOtel, type BenchVariant } from './index.js'

const variant = (process.env.BENCH_VARIANT ?? 'baseline') as BenchVariant

if (variant !== 'baseline') {
  initOtel(variant)
}
