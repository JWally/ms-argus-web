/**
 * WebGPU Compute Shader Fingerprinting Module
 *
 * Implements GPU fingerprinting via compute shader timing, inspired by the
 * LockedApart research (Microarchitecture Security Conference, March 2025).
 *
 * Key insight: Different GPUs have unique timing signatures when compute
 * shader threads compete for shared resources. By measuring contention
 * patterns across different workloads, we can fingerprint the GPU hardware.
 *
 * This is 310x faster and 1.8x more accurate than WebGL-based DrawnApart.
 *
 * @see https://ojs.ub.rub.de/index.php/uASC/article/view/12008
 * @module webgpu-compute
 */

import { captureError } from '../errors';
import { hashMini } from '../utils/crypto';
import { createTimer, queueEvent, logTestResult } from '../utils/helpers';
import type { WebGpuComputeFingerprint } from './types';

/**
 * WGSL compute shader that creates thread contention.
 *
 * Strategy: Force GPU threads to compete for shared memory access.
 * Different GPU architectures handle this contention differently,
 * creating measurable timing variations.
 */
const CONTENTION_SHADER = /* wgsl */ `
  // Shared workgroup memory - threads compete for access
  var<workgroup> shared_data: array<atomic<u32>, 256>;

  // Output buffer for timing-sensitive results
  @group(0) @binding(0) var<storage, read_write> output: array<u32>;

  @compute @workgroup_size(64)
  fn contention_test(@builtin(local_invocation_id) local_id: vec3<u32>,
                     @builtin(workgroup_id) workgroup_id: vec3<u32>,
                     @builtin(global_invocation_id) global_id: vec3<u32>) {
    let tid = local_id.x;
    let wid = workgroup_id.x;
    let gid = global_id.x;

    // Initialize shared memory
    atomicStore(&shared_data[tid], tid);
    workgroupBarrier();

    // Create contention: all threads try to access overlapping memory locations
    // The pattern of access creates GPU-specific timing signatures
    var acc: u32 = 0u;
    for (var i: u32 = 0u; i < 64u; i = i + 1u) {
      // Intentionally create bank conflicts by accessing with stride
      let idx = (tid + i * 17u) % 256u;
      acc = acc + atomicAdd(&shared_data[idx], 1u);
    }

    // Second pass with different access pattern
    for (var i: u32 = 0u; i < 32u; i = i + 1u) {
      let idx = (tid * 4u + i) % 256u;
      acc = acc ^ atomicLoad(&shared_data[idx]);
    }

    workgroupBarrier();

    // Write result - includes accumulated timing artifacts
    output[gid] = acc ^ atomicLoad(&shared_data[tid]);
  }
`;

/**
 * WGSL shader for arithmetic throughput measurement.
 * Different GPU architectures have different ALU configurations.
 */
const ARITHMETIC_SHADER = /* wgsl */ `
  @group(0) @binding(0) var<storage, read_write> output: array<f32>;

  @compute @workgroup_size(64)
  fn arithmetic_test(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let gid = global_id.x;
    var val = f32(gid);

    // Heavy arithmetic to stress ALUs
    for (var i: u32 = 0u; i < 128u; i = i + 1u) {
      val = sin(val) * cos(val * 0.7) + tan(val * 0.3);
      val = sqrt(abs(val) + 1.0) * log(abs(val) + 2.0);
      val = pow(abs(val), 0.5) + exp(-abs(val) * 0.1);
    }

    output[gid] = val;
  }
`;

/**
 * WGSL shader for memory bandwidth measurement.
 */
const MEMORY_SHADER = /* wgsl */ `
  @group(0) @binding(0) var<storage, read> input: array<u32>;
  @group(0) @binding(1) var<storage, read_write> output: array<u32>;

  @compute @workgroup_size(64)
  fn memory_test(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let gid = global_id.x;
    let size = arrayLength(&input);

    var acc: u32 = 0u;
    // Strided access pattern to measure cache behavior
    for (var i: u32 = 0u; i < 16u; i = i + 1u) {
      let idx = (gid * 67u + i * 127u) % size;
      acc = acc ^ input[idx];
    }

    output[gid] = acc;
  }
`;

/**
 * Number of timing samples to collect per test.
 * More samples = more stable fingerprint, but slower.
 */
const TIMING_SAMPLES = 5;

/**
 * Number of workgroups to dispatch.
 */
const NUM_WORKGROUPS = 16;

/**
 * Threads per workgroup (must match shader).
 */
const WORKGROUP_SIZE = 64;

/**
 * Total number of threads.
 */
const TOTAL_THREADS = NUM_WORKGROUPS * WORKGROUP_SIZE;

/**
 * Runs a compute shader and measures execution time.
 */
async function runTimedCompute(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  bindGroup: GPUBindGroup,
  numWorkgroups: number,
): Promise<number> {
  const start = performance.now();

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(numWorkgroups);
  pass.end();

  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  return performance.now() - start;
}

/**
 * Creates a compute pipeline from shader code.
 */
function createPipeline(
  device: GPUDevice,
  code: string,
  entryPoint: string,
): GPUComputePipeline {
  const module = device.createShaderModule({ code });
  return device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint },
  });
}

/**
 * Runs the contention test and collects timing samples.
 */
async function runContentionTest(
  device: GPUDevice,
): Promise<{ timings: number[]; resultHash: string }> {
  const pipeline = createPipeline(device, CONTENTION_SHADER, 'contention_test');

  // Create output buffer
  const outputBuffer = device.createBuffer({
    size: TOTAL_THREADS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // Create read buffer for results
  const readBuffer = device.createBuffer({
    size: TOTAL_THREADS * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: outputBuffer } }],
  });

  // Collect timing samples
  const timings: number[] = [];
  for (let i = 0; i < TIMING_SAMPLES; i++) {
    const time = await runTimedCompute(device, pipeline, bindGroup, NUM_WORKGROUPS);
    timings.push(time);
  }

  // Read final results for hashing
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, TOTAL_THREADS * 4);
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const results = new Uint32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();

  // Cleanup
  outputBuffer.destroy();
  readBuffer.destroy();

  // XOR all results for a fingerprint hash
  let xorResult = 0;
  for (let i = 0; i < results.length; i++) {
    xorResult ^= results[i];
  }

  return {
    timings,
    resultHash: xorResult.toString(16).padStart(8, '0'),
  };
}

/**
 * Runs the arithmetic throughput test.
 */
async function runArithmeticTest(
  device: GPUDevice,
): Promise<{ timings: number[]; resultHash: string }> {
  const pipeline = createPipeline(device, ARITHMETIC_SHADER, 'arithmetic_test');

  const outputBuffer = device.createBuffer({
    size: TOTAL_THREADS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const readBuffer = device.createBuffer({
    size: TOTAL_THREADS * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: outputBuffer } }],
  });

  const timings: number[] = [];
  for (let i = 0; i < TIMING_SAMPLES; i++) {
    const time = await runTimedCompute(device, pipeline, bindGroup, NUM_WORKGROUPS);
    timings.push(time);
  }

  // Read results
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, TOTAL_THREADS * 4);
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const results = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();

  outputBuffer.destroy();
  readBuffer.destroy();

  // Sum for fingerprint (float results)
  let sum = 0;
  for (let i = 0; i < results.length; i++) {
    sum += results[i];
  }

  return {
    timings,
    resultHash: hashMini(sum),
  };
}

/**
 * Runs the memory bandwidth test.
 */
async function runMemoryTest(
  device: GPUDevice,
): Promise<{ timings: number[]; resultHash: string }> {
  const pipeline = createPipeline(device, MEMORY_SHADER, 'memory_test');

  // Create input buffer with pseudo-random data
  const inputSize = 1024 * 64; // 64KB
  const inputData = new Uint32Array(inputSize);
  for (let i = 0; i < inputSize; i++) {
    inputData[i] = (i * 2654435761) >>> 0; // Knuth multiplicative hash
  }

  const inputBuffer = device.createBuffer({
    size: inputSize * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputBuffer, 0, inputData);

  const outputBuffer = device.createBuffer({
    size: TOTAL_THREADS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const readBuffer = device.createBuffer({
    size: TOTAL_THREADS * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inputBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
    ],
  });

  const timings: number[] = [];
  for (let i = 0; i < TIMING_SAMPLES; i++) {
    const time = await runTimedCompute(device, pipeline, bindGroup, NUM_WORKGROUPS);
    timings.push(time);
  }

  // Read results
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, TOTAL_THREADS * 4);
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const results = new Uint32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();

  inputBuffer.destroy();
  outputBuffer.destroy();
  readBuffer.destroy();

  let xorResult = 0;
  for (let i = 0; i < results.length; i++) {
    xorResult ^= results[i];
  }

  return {
    timings,
    resultHash: xorResult.toString(16).padStart(8, '0'),
  };
}

/**
 * Computes timing statistics from samples.
 */
function computeTimingStats(timings: number[]): {
  mean: number;
  variance: number;
  min: number;
  max: number;
} {
  const n = timings.length;
  const mean = timings.reduce((a, b) => a + b, 0) / n;
  const variance = timings.reduce((acc, t) => acc + (t - mean) ** 2, 0) / n;
  const min = Math.min(...timings);
  const max = Math.max(...timings);

  return {
    mean: Math.round(mean * 1000) / 1000,
    variance: Math.round(variance * 1000) / 1000,
    min: Math.round(min * 1000) / 1000,
    max: Math.round(max * 1000) / 1000,
  };
}

/**
 * Main entry point: Collects WebGPU compute fingerprint.
 *
 * Runs multiple compute shader tests that stress different GPU subsystems,
 * collecting timing signatures that reflect the hardware's characteristics.
 */
export default async function getWebGpuCompute(): Promise<
  WebGpuComputeFingerprint | undefined
> {
  try {
    const timer = createTimer();
    await queueEvent(timer);

    // Check WebGPU support (not available in Firefox as of 2025)
    if (!('gpu' in navigator)) {
      logTestResult({ test: 'webgpu-compute', passed: true }); // Not a failure, just unsupported
      return { supported: false, $hash: 'unsupported' };
    }

    // Request adapter
    // @ts-expect-error WebGPU types may not be available
    const gpu = navigator.gpu;
    if (!gpu || typeof gpu.requestAdapter !== 'function') {
      logTestResult({ test: 'webgpu-compute', passed: true });
      return { supported: false, $hash: 'unsupported' };
    }

    const adapter: GPUAdapter | null = await gpu.requestAdapter();
    if (!adapter) {
      logTestResult({ test: 'webgpu-compute', passed: true });
      return { supported: false, $hash: 'no-adapter' };
    }

    // Request device
    const device = await adapter.requestDevice();
    if (!device) {
      logTestResult({ test: 'webgpu-compute', passed: true });
      return { supported: false, $hash: 'no-device' };
    }

    // Run tests
    const [contentionResult, arithmeticResult, memoryResult] = await Promise.all([
      runContentionTest(device),
      runArithmeticTest(device),
      runMemoryTest(device),
    ]);

    // Compute timing statistics
    const contentionStats = computeTimingStats(contentionResult.timings);
    const arithmeticStats = computeTimingStats(arithmeticResult.timings);
    const memoryStats = computeTimingStats(memoryResult.timings);

    // Build timing ratios - these are more stable than absolute times
    const ratios = {
      contentionToArithmetic:
        Math.round((contentionStats.mean / arithmeticStats.mean) * 1000) / 1000,
      memoryToArithmetic:
        Math.round((memoryStats.mean / arithmeticStats.mean) * 1000) / 1000,
      contentionToMemory:
        Math.round((contentionStats.mean / memoryStats.mean) * 1000) / 1000,
    };

    // Cleanup
    device.destroy();

    logTestResult({ time: timer.stop(), test: 'webgpu-compute', passed: true });

    return {
      supported: true,

      // Result hashes (deterministic for same GPU)
      contentionHash: contentionResult.resultHash,
      arithmeticHash: arithmeticResult.resultHash,
      memoryHash: memoryResult.resultHash,

      // Timing statistics (hardware-dependent)
      timings: {
        contention: contentionStats,
        arithmetic: arithmeticStats,
        memory: memoryStats,
      },

      // Timing ratios (more stable across browser versions)
      ratios,

      // Combined fingerprint hash
      $hash: hashMini({
        c: contentionResult.resultHash,
        a: arithmeticResult.resultHash,
        m: memoryResult.resultHash,
        r: ratios,
      }),
    };
  } catch (error) {
    logTestResult({ test: 'webgpu-compute', passed: false });
    captureError(error);
    return undefined;
  }
}
