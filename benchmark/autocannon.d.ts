declare module 'autocannon' {
  interface Histogram {
    average: number
    p50: number
    p99: number
  }

  interface AutocannonResult {
    requests: Histogram
    latency: Histogram
  }

  interface AutocannonOptions {
    url: string
    connections?: number
    pipelining?: number
    duration?: number
    warmup?: Array<{ connections: number; duration: number }>
  }

  function autocannon(options: AutocannonOptions): Promise<AutocannonResult>

  export default autocannon
}
