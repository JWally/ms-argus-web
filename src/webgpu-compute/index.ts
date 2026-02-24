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
 * WGSL vertex + fragment shaders for render pipeline fingerprinting.
 *
 * Draws a colored triangle (red/green/blue vertices) with a uniform
 * rotation transform. The interpolated colors and rasterization differ
 * subtly between GPU implementations.
 */
const RENDER_VERTEX_SHADER = /* wgsl */ `
  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
  }

  @group(0) @binding(0) var<uniform> transform: mat4x4<f32>;

  // Triangle vertices with RGB colors
  const positions = array<vec2<f32>, 3>(
    vec2<f32>(0.0, 0.5),
    vec2<f32>(-0.5, -0.5),
    vec2<f32>(0.5, -0.5),
  );
  const colors = array<vec3<f32>, 3>(
    vec3<f32>(1.0, 0.0, 0.0),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(0.0, 0.0, 1.0),
  );

  @vertex
  fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
    var out: VertexOutput;
    let pos = vec4<f32>(positions[idx], 0.0, 1.0);
    out.position = transform * pos;
    out.color = colors[idx];
    return out;
  }
`;

const RENDER_FRAGMENT_SHADER = /* wgsl */ `
  @fragment
  fn fs_main(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(color, 1.0);
  }
`;

/** Canvas size for render pipeline test */
const RENDER_CANVAS_SIZE = 64;

/** Rotation angles in radians */
const ROTATION_ANGLES = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];

/**
 * Creates a 4×4 rotation matrix around the Z axis.
 */
function makeRotationZ(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Column-major order for WGSL mat4x4
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/**
 * Runs the render pipeline pixel fingerprint test.
 *
 * Renders a colored triangle at multiple rotation angles into a 64×64
 * offscreen texture, reads back pixel data, and hashes each frame.
 *
 * @param device - Active GPUDevice
 * @returns Render pipeline fingerprint or undefined on error
 */
async function runRenderPipelineTest(
  device: GPUDevice,
): Promise<
  | { pixelHash: string; transformHashes: string[]; canvasSize: number }
  | undefined
> {
  try {
    const size = RENDER_CANVAS_SIZE;

    // Create shader module (both stages in one module)
    const shaderModule = device.createShaderModule({
      code: RENDER_VERTEX_SHADER + RENDER_FRAGMENT_SHADER,
    });

    // Create render pipeline
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: 'rgba8unorm' }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // Uniform buffer for transform matrix
    const uniformBuffer = device.createBuffer({
      size: 64, // mat4x4<f32> = 16 floats × 4 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    // Offscreen render texture
    const texture = device.createTexture({
      size: [size, size],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    // Staging buffer for reading pixels
    const bytesPerRow = Math.ceil((size * 4) / 256) * 256;
    const stagingBuffer = device.createBuffer({
      size: bytesPerRow * size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const transformHashes: string[] = [];

    for (const angle of ROTATION_ANGLES) {
      // Write rotation matrix
      device.queue.writeBuffer(uniformBuffer, 0, makeRotationZ(angle));

      const encoder = device.createCommandEncoder();

      // Render pass
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: texture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear' as GPULoadOp,
            storeOp: 'store' as GPUStoreOp,
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();

      // Copy texture to staging buffer
      encoder.copyTextureToBuffer(
        { texture },
        { buffer: stagingBuffer, bytesPerRow },
        [size, size],
      );

      device.queue.submit([encoder.finish()]);

      // Read pixels
      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const data = new Uint8Array(stagingBuffer.getMappedRange().slice(0));
      stagingBuffer.unmap();

      transformHashes.push(hashMini(data));
    }

    // Cleanup
    uniformBuffer.destroy();
    texture.destroy();
    stagingBuffer.destroy();

    return {
      pixelHash: hashMini(transformHashes),
      transformHashes,
      canvasSize: size,
    };
  } catch {
    return undefined;
  }
}

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
 * Creates a standard output + staging buffer pair for GPU readback.
 */
function createOutputBuffers(
  device: GPUDevice,
  size: number,
): { outputBuffer: GPUBuffer; readBuffer: GPUBuffer } {
  const outputBuffer = device.createBuffer({
    size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readBuffer = device.createBuffer({
    size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  return { outputBuffer, readBuffer };
}

/**
 * Collects timing samples by running a compute pipeline repeatedly.
 */
async function collectTimings(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  bindGroup: GPUBindGroup,
): Promise<number[]> {
  const timings: number[] = [];
  for (let i = 0; i < TIMING_SAMPLES; i++) {
    const time = await runTimedCompute(
      device,
      pipeline,
      bindGroup,
      NUM_WORKGROUPS,
    );
    timings.push(time);
  }
  return timings;
}

/**
 * Reads GPU buffer contents back to CPU.
 */
async function readGpuBuffer<T extends Uint32Array | Float32Array>(
  device: GPUDevice,
  outputBuffer: GPUBuffer,
  readBuffer: GPUBuffer,
  size: number,
  TypedArray: { new (buffer: ArrayBuffer): T },
): Promise<T> {
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, size);
  device.queue.submit([encoder.finish()]);
  await readBuffer.mapAsync(GPUMapMode.READ);
  const results = new TypedArray(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();
  return results;
}

/**
 * XOR-reduces a Uint32Array to a hex hash string.
 */
function xorHash(results: Uint32Array): string {
  let xorResult = 0;
  for (let i = 0; i < results.length; i++) {
    xorResult ^= results[i];
  }
  return xorResult.toString(16).padStart(8, '0');
}

/**
 * Runs a single-output-buffer compute test (contention or arithmetic).
 */
async function runSingleBufferTest<T extends Uint32Array | Float32Array>(
  device: GPUDevice,
  shaderCode: string,
  entryPoint: string,
  TypedArray: { new (buffer: ArrayBuffer): T },
  hashFn: (results: T) => string,
): Promise<{ timings: number[]; resultHash: string }> {
  const pipeline = createPipeline(device, shaderCode, entryPoint);
  const bufferSize = TOTAL_THREADS * 4;
  const { outputBuffer, readBuffer } = createOutputBuffers(device, bufferSize);

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: outputBuffer } }],
  });

  const timings = await collectTimings(device, pipeline, bindGroup);
  const results = await readGpuBuffer(
    device,
    outputBuffer,
    readBuffer,
    bufferSize,
    TypedArray,
  );

  outputBuffer.destroy();
  readBuffer.destroy();

  return { timings, resultHash: hashFn(results) };
}

/**
 * Runs the contention test and collects timing samples.
 */
async function runContentionTest(
  device: GPUDevice,
): Promise<{ timings: number[]; resultHash: string }> {
  return runSingleBufferTest(
    device,
    CONTENTION_SHADER,
    'contention_test',
    Uint32Array,
    xorHash,
  );
}

/**
 * Runs the arithmetic throughput test.
 */
async function runArithmeticTest(
  device: GPUDevice,
): Promise<{ timings: number[]; resultHash: string }> {
  return runSingleBufferTest(
    device,
    ARITHMETIC_SHADER,
    'arithmetic_test',
    Float32Array,
    (results) => {
      let sum = 0;
      for (let i = 0; i < results.length; i++) sum += results[i];
      return hashMini(sum);
    },
  );
}

/**
 * Runs the memory bandwidth test.
 */
async function runMemoryTest(
  device: GPUDevice,
): Promise<{ timings: number[]; resultHash: string }> {
  const pipeline = createPipeline(device, MEMORY_SHADER, 'memory_test');
  const bufferSize = TOTAL_THREADS * 4;

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

  const { outputBuffer, readBuffer } = createOutputBuffers(device, bufferSize);

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inputBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
    ],
  });

  const timings = await collectTimings(device, pipeline, bindGroup);
  const results = await readGpuBuffer(
    device,
    outputBuffer,
    readBuffer,
    bufferSize,
    Uint32Array,
  );

  inputBuffer.destroy();
  outputBuffer.destroy();
  readBuffer.destroy();

  return { timings, resultHash: xorHash(results) };
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
    const [contentionResult, arithmeticResult, memoryResult] =
      await Promise.all([
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

    // Run render pipeline pixel fingerprint
    const renderPipeline = await runRenderPipelineTest(device);

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

      // Render pipeline pixel fingerprint
      renderPipeline: renderPipeline || undefined,

      // Combined fingerprint hash
      $hash: hashMini({
        c: contentionResult.resultHash,
        a: arithmeticResult.resultHash,
        m: memoryResult.resultHash,
        r: ratios,
        rp: renderPipeline?.pixelHash,
      }),
    };
  } catch (error) {
    logTestResult({ test: 'webgpu-compute', passed: false });
    captureError(error);
    return undefined;
  }
}
