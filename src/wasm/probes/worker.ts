import { getWasmBytes } from '../loader'

/**
 * Run CPU benchmark in a Web Worker and compare to main thread
 * Returns ratio of worker time to main thread time
 * A ratio significantly != 1.0 may indicate tampering or unusual environment
 */
export async function workerRatio(
  mainThreadTime: number,
  cpuIterations: number
): Promise<number | null> {
  if (typeof Worker === 'undefined') return null

  try {
    const wasmBytes = getWasmBytes()
    const workerTime = await runInWorker(wasmBytes, cpuIterations)
    if (workerTime === null) return null
    return workerTime / mainThreadTime
  } catch {
    return null
  }
}

/**
 * Run CPU benchmark in a worker
 */
async function runInWorker(
  wasmBytes: Uint8Array,
  iterations: number
): Promise<number | null> {
  return new Promise((resolve) => {
    const workerCode = `
      self.onmessage = async function(e) {
        const { wasmBytes, iterations } = e.data;

        try {
          // Instantiate WASM
          const module = await WebAssembly.compile(wasmBytes);
          const instance = await WebAssembly.instantiate(module, {
            wbg: {
              __wbg_boundaryCallback_3bc688e9be4df0fa: () => {}
            }
          });

          // Run benchmark
          const start = performance.now();
          instance.exports.cpu_stress_test(iterations);
          const elapsed = performance.now() - start;

          self.postMessage({ time: elapsed });
        } catch (err) {
          self.postMessage({ error: err.message });
        }
      };
    `

    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const worker = new Worker(URL.createObjectURL(blob))

    const timeout = setTimeout(() => {
      worker.terminate()
      resolve(null)
    }, 30000)

    worker.onmessage = (e) => {
      clearTimeout(timeout)
      worker.terminate()
      if (e.data.error) {
        resolve(null)
      } else {
        resolve(e.data.time)
      }
    }

    worker.onerror = () => {
      clearTimeout(timeout)
      worker.terminate()
      resolve(null)
    }

    // Transfer the ArrayBuffer for efficiency
    worker.postMessage(
      { wasmBytes, iterations },
      [wasmBytes.buffer]
    )
  })
}
