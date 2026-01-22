/**
 * Audio Fingerprinting Module
 *
 * This module generates a unique fingerprint based on how the browser processes
 * audio through the Web Audio API. Different browsers and platforms produce
 * slightly different audio output due to:
 *
 * 1. **Floating-point precision differences** - Different CPU architectures and
 *    JavaScript engines handle floating-point math slightly differently
 *
 * 2. **Audio processing implementation** - The DynamicsCompressorNode, OscillatorNode,
 *    and other audio nodes have implementation-specific behaviors
 *
 * 3. **Sample rate and buffer handling** - How browsers handle audio buffers varies
 *
 * ## How it works:
 *
 * 1. Create an OfflineAudioContext (doesn't produce sound, just processes data)
 * 2. Set up an audio graph: Oscillator → DynamicsCompressor → Analyser → Destination
 * 3. Render the audio and analyze the output
 * 4. Extract fingerprint values from the rendered buffer
 * 5. Compare against known patterns to detect tampering
 *
 * ## Tampering Detection:
 *
 * The module detects several types of audio fingerprint spoofing:
 * - Fake audio data injection
 * - getChannelData/copyFromChannel mismatches
 * - Unusual sample uniqueness (noise injection)
 * - Pattern mismatches against known browser signatures
 *
 * @module audio
 */

import { attempt, caniuse, captureError } from '../errors';
import { documentLie, lieProps } from '../lies';
import { sendToTrash } from '../trash';
import { createTimer, logTestResult, queueEvent } from '../utils/helpers';
import { expectFailure } from '../utils/expected-failure';

import { AUDIO_CONFIG, AUDIO_TRAP } from './constants';
import type {
  AudioFingerprint,
  AudioNodeValues,
  AudioRenderData,
} from './types';

/**
 * Detects if the browser is returning fake/spoofed audio data.
 *
 * This works by creating a silent oscillator (frequency = 0) and checking
 * if the output contains anything other than zeros. Real audio hardware
 * should output pure silence; fake implementations often inject noise.
 *
 * @returns Promise resolving to true if fake audio is detected
 */
async function detectFakeAudio(): Promise<boolean> {
  const context = new OfflineAudioContext(1, 100, AUDIO_CONFIG.SAMPLE_RATE);
  const oscillator = context.createOscillator();

  // Set frequency to 0 - should produce complete silence
  oscillator.frequency.value = 0;
  oscillator.start(0);
  context.startRendering();

  return new Promise((resolve) => {
    context.oncomplete = (event) => {
      const channelData = event.renderedBuffer.getChannelData?.(0);
      if (!channelData) {
        resolve(false);
        return;
      }

      // If we get anything other than all zeros, audio is fake
      const uniqueValues = [...new Set(channelData)];
      const isFake = uniqueValues.toString() !== '0';
      resolve(isFake);
    };
  }).finally(() => oscillator.disconnect()) as Promise<boolean>;
}

/**
 * Collects parameter values from various audio nodes.
 *
 * These values can vary between browser implementations and versions,
 * providing additional fingerprint entropy.
 *
 * @param analyser - AnalyserNode instance
 * @param biquadFilter - BiquadFilterNode instance
 * @param dynamicsCompressor - DynamicsCompressorNode instance
 * @param oscillator - OscillatorNode instance
 * @returns Object containing audio node parameter values
 */
function collectAudioNodeValues(
  analyser: AnalyserNode,
  biquadFilter: BiquadFilterNode,
  dynamicsCompressor: DynamicsCompressorNode,
  oscillator: OscillatorNode,
): AudioNodeValues {
  return {
    'AnalyserNode.channelCount': attempt(() => analyser.channelCount),
    'AnalyserNode.channelCountMode': attempt(() => analyser.channelCountMode),
    'AnalyserNode.channelInterpretation': attempt(
      () => analyser.channelInterpretation,
    ),
    'AnalyserNode.context.sampleRate': attempt(
      () => analyser.context.sampleRate,
    ),
    'AnalyserNode.fftSize': attempt(() => analyser.fftSize),
    'AnalyserNode.frequencyBinCount': attempt(() => analyser.frequencyBinCount),
    'AnalyserNode.maxDecibels': attempt(() => analyser.maxDecibels),
    'AnalyserNode.minDecibels': attempt(() => analyser.minDecibels),
    'AnalyserNode.numberOfInputs': attempt(() => analyser.numberOfInputs),
    'AnalyserNode.numberOfOutputs': attempt(() => analyser.numberOfOutputs),
    'AnalyserNode.smoothingTimeConstant': attempt(
      () => analyser.smoothingTimeConstant,
    ),
    'AnalyserNode.context.listener.forwardX.maxValue': attempt(() =>
      caniuse(() => analyser.context.listener.forwardX.maxValue),
    ),
    'BiquadFilterNode.gain.maxValue': attempt(() => biquadFilter.gain.maxValue),
    'BiquadFilterNode.frequency.defaultValue': attempt(
      () => biquadFilter.frequency.defaultValue,
    ),
    'BiquadFilterNode.frequency.maxValue': attempt(
      () => biquadFilter.frequency.maxValue,
    ),
    'DynamicsCompressorNode.attack.defaultValue': attempt(
      () => dynamicsCompressor.attack.defaultValue,
    ),
    'DynamicsCompressorNode.knee.defaultValue': attempt(
      () => dynamicsCompressor.knee.defaultValue,
    ),
    'DynamicsCompressorNode.knee.maxValue': attempt(
      () => dynamicsCompressor.knee.maxValue,
    ),
    'DynamicsCompressorNode.ratio.defaultValue': attempt(
      () => dynamicsCompressor.ratio.defaultValue,
    ),
    'DynamicsCompressorNode.ratio.maxValue': attempt(
      () => dynamicsCompressor.ratio.maxValue,
    ),
    'DynamicsCompressorNode.release.defaultValue': attempt(
      () => dynamicsCompressor.release.defaultValue,
    ),
    'DynamicsCompressorNode.release.maxValue': attempt(
      () => dynamicsCompressor.release.maxValue,
    ),
    'DynamicsCompressorNode.threshold.defaultValue': attempt(
      () => dynamicsCompressor.threshold.defaultValue,
    ),
    'DynamicsCompressorNode.threshold.minValue': attempt(
      () => dynamicsCompressor.threshold.minValue,
    ),
    'OscillatorNode.detune.maxValue': attempt(() => oscillator.detune.maxValue),
    'OscillatorNode.detune.minValue': attempt(() => oscillator.detune.minValue),
    'OscillatorNode.frequency.defaultValue': attempt(
      () => oscillator.frequency.defaultValue,
    ),
    'OscillatorNode.frequency.maxValue': attempt(
      () => oscillator.frequency.maxValue,
    ),
    'OscillatorNode.frequency.minValue': attempt(
      () => oscillator.frequency.minValue,
    ),
  };
}

/**
 * Renders audio and extracts fingerprint data.
 *
 * Sets up the audio processing graph:
 * Oscillator (triangle wave @ 10kHz) → DynamicsCompressor → Analyser → Destination
 *
 * The compressor settings are chosen to produce consistent, measurable output
 * that varies predictably between browser implementations.
 *
 * @param context - OfflineAudioContext to render
 * @returns Promise resolving to rendered audio data or null on error
 */
function renderAudioBuffer(
  context: OfflineAudioContext,
): Promise<AudioRenderData | null> {
  return new Promise((resolve) => {
    const analyser = context.createAnalyser();
    const oscillator = context.createOscillator();
    const dynamicsCompressor = context.createDynamicsCompressor();

    try {
      // Triangle wave produces more complex harmonics than sine
      oscillator.type = 'triangle';
      oscillator.frequency.value = AUDIO_CONFIG.OSCILLATOR_FREQUENCY;

      // Compressor settings chosen to produce measurable gain reduction
      dynamicsCompressor.threshold.value = AUDIO_CONFIG.COMPRESSOR_THRESHOLD;
      dynamicsCompressor.knee.value = AUDIO_CONFIG.COMPRESSOR_KNEE;
      dynamicsCompressor.attack.value = 0;
    } catch {
      expectFailure(
        'renderAudioBuffer',
        'Browser does not support all compressor settings',
      );
    }

    // Connect the audio graph
    oscillator.connect(dynamicsCompressor);
    dynamicsCompressor.connect(analyser);
    dynamicsCompressor.connect(context.destination);

    oscillator.start(0);
    context.startRendering();

    context.addEventListener('complete', (event) => {
      try {
        // Clean up connections
        dynamicsCompressor.disconnect();
        oscillator.disconnect();

        // Extract frequency domain data
        const floatFrequencyData = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData?.(floatFrequencyData);

        // Extract time domain data
        const floatTimeDomainData = new Float32Array(analyser.fftSize);
        if ('getFloatTimeDomainData' in analyser) {
          analyser.getFloatTimeDomainData(floatTimeDomainData);
        }

        resolve({
          floatFrequencyData,
          floatTimeDomainData,
          buffer: event.renderedBuffer,
          compressorGainReduction:
            // @ts-expect-error WebKit uses .value property
            dynamicsCompressor.reduction.value ?? dynamicsCompressor.reduction,
        });
      } catch {
        expectFailure('renderAudioBuffer', 'Audio data extraction failed');
        resolve(null);
      }
    });
  });
}

/**
 * Extracts a slice of samples from an array.
 *
 * @param arr - Source array
 * @param start - Start index (inclusive)
 * @param end - End index (exclusive)
 * @returns Array slice
 */
function extractSampleSlice(
  arr: number[],
  start: number,
  end: number,
): number[] {
  const slice: number[] = [];
  for (let i = start; i < end; i++) {
    slice.push(arr[i]);
  }
  return slice;
}

/**
 * Calculates the sum of absolute values in an array.
 * Used to create a single comparable value from audio data.
 *
 * @param arr - Float32Array or number array
 * @returns Sum of absolute values
 */
function calculateAbsoluteSum(arr?: Float32Array | number[]): number {
  if (!arr) return 0;
  return [...arr].reduce((sum, val) => sum + Math.abs(val), 0);
}

/**
 * Detects noise injection by writing known values to an audio buffer
 * and checking if they're modified.
 *
 * Privacy tools sometimes inject noise into audio buffers to prevent
 * fingerprinting. This function detects such modifications.
 *
 * @returns Noise factor (0 = no noise detected)
 */
function detectBufferNoise(): number {
  const length = 2000;

  try {
    const buffer = new AudioBuffer({
      length,
      sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
    });
    const copy = new Float32Array(length);

    // Write trap values and check if they're preserved
    const testCopyFrom = (): number[] => {
      const channelData = buffer.getChannelData(0);
      const max = 20;
      const start = Math.floor(Math.random() * (length - max - 276)) + 275;
      const mid = start + max / 2;
      const end = start + max;

      // Write known values
      channelData[start] = AUDIO_TRAP;
      channelData[mid] = AUDIO_TRAP;
      channelData[end] = AUDIO_TRAP;

      buffer.copyFromChannel(copy, 0);

      // Check if values were zeroed (noise injection detected)
      const attacked = [
        channelData[start] === 0 ? Math.random() : 0,
        channelData[mid] === 0 ? Math.random() : 0,
        channelData[end] === 0 ? Math.random() : 0,
      ];

      return [...new Set([...channelData, ...copy, ...attacked])].filter(
        (x) => x !== 0,
      );
    };

    const testCopyTo = (): number[] => {
      const buffer2 = new AudioBuffer({
        length,
        sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
      });
      buffer2.copyToChannel(
        copy.map(() => AUDIO_TRAP),
        0,
      );
      const frequency = buffer2.getChannelData(0)[0];
      return [...buffer2.getChannelData(0)]
        .map((x) => (x !== frequency || !x ? Math.random() : x))
        .filter((x) => x !== frequency);
    };

    const results = [...new Set([...testCopyFrom(), ...testCopyTo()])];

    // If we got more than one unique non-zero value, noise was injected
    return results.length !== 1 ? results.reduce((sum, n) => sum + n, 0) : 0;
  } catch (error) {
    console.error('Audio noise detection failed:', error);
    return 0;
  }
}

/**
 * Detects tampering in the AnalyserNode's getFloatFrequencyData.
 *
 * Before any audio is rendered, frequency data should be all -Infinity (silence).
 * If we get actual frequency values, the API has been tampered with.
 *
 * @param analyser - AnalyserNode to test
 * @returns True if tampering detected
 */
function detectFrequencyDataTampering(analyser: AnalyserNode): boolean {
  const dataArray = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData?.(dataArray);

  const uniqueValueCount = new Set(dataArray).size;

  // Should only have -Infinity (silence) before rendering
  if (uniqueValueCount > 1) {
    documentLie(
      'AnalyserNode.getFloatFrequencyData',
      `expected -Infinity (silence) and got ${uniqueValueCount} frequencies`,
    );
    return true;
  }

  return false;
}

/**
 * Main audio fingerprinting function.
 *
 * Collects audio fingerprint data by:
 * 1. Checking for known API tampering (lies)
 * 2. Collecting audio node parameter values
 * 3. Rendering audio through a compression chain
 * 4. Analyzing the output for fingerprint values
 * 5. Detecting various forms of tampering
 * 6. Validating against known browser patterns
 *
 * @returns Promise resolving to AudioFingerprint or undefined on error
 */
export default async function getOfflineAudioContext(): Promise<
  AudioFingerprint | undefined
> {
  try {
    const timer = createTimer();
    await queueEvent(timer);

    // Ensure OfflineAudioContext is available
    try {
      // @ts-expect-error webkitOfflineAudioContext fallback
      window.OfflineAudioContext =
        OfflineAudioContext || webkitOfflineAudioContext;
    } catch {
      expectFailure(
        'getOfflineAudioContext',
        'OfflineAudioContext not available',
      );
    }

    if (!window.OfflineAudioContext) {
      logTestResult({ test: 'audio', passed: false });
      return undefined;
    }

    // Check for known API lies
    const channelDataLie = lieProps['AudioBuffer.getChannelData'];
    const copyFromChannelLie = lieProps['AudioBuffer.copyFromChannel'];
    let lied = Boolean(channelDataLie || copyFromChannelLie);

    // Create audio nodes for fingerprinting
    const context = new OfflineAudioContext(
      1,
      AUDIO_CONFIG.BUFFER_LENGTH,
      AUDIO_CONFIG.SAMPLE_RATE,
    );
    const analyser = context.createAnalyser();
    const oscillator = context.createOscillator();
    const dynamicsCompressor = context.createDynamicsCompressor();
    const biquadFilter = context.createBiquadFilter();

    // Check for frequency data tampering before rendering
    if (detectFrequencyDataTampering(analyser)) {
      lied = true;
    }

    // Collect audio node parameter values
    const values = collectAudioNodeValues(
      analyser,
      biquadFilter,
      dynamicsCompressor,
      oscillator,
    );

    await queueEvent(timer);

    // Render audio and detect fake audio in parallel
    const [audioData, audioIsFake] = await Promise.all([
      renderAudioBuffer(
        new OfflineAudioContext(
          1,
          AUDIO_CONFIG.BUFFER_LENGTH,
          AUDIO_CONFIG.SAMPLE_RATE,
        ),
      ),
      detectFakeAudio().catch(() => false),
    ]);

    const {
      floatFrequencyData,
      floatTimeDomainData,
      buffer,
      compressorGainReduction,
    } = audioData || {};

    await queueEvent(timer);

    // Calculate sums for pattern matching
    const floatFrequencyDataSum = calculateAbsoluteSum(floatFrequencyData);
    const floatTimeDomainDataSum = calculateAbsoluteSum(floatTimeDomainData);

    // Extract sample data from rendered buffer
    const copy = new Float32Array(AUDIO_CONFIG.BUFFER_LENGTH);
    let bins = new Float32Array();

    if (buffer) {
      buffer.copyFromChannel?.(copy, 0);
      bins = buffer.getChannelData?.(0) || new Float32Array();
    }

    const { SAMPLE_RANGE_START, SAMPLE_RANGE_END, BUFFER_LENGTH } =
      AUDIO_CONFIG;

    const copySample = extractSampleSlice(
      [...copy],
      SAMPLE_RANGE_START,
      SAMPLE_RANGE_END,
    );
    const binsSample = extractSampleSlice(
      [...bins],
      SAMPLE_RANGE_START,
      SAMPLE_RANGE_END,
    );
    const sampleSum = calculateAbsoluteSum(
      extractSampleSlice([...bins], SAMPLE_RANGE_START, BUFFER_LENGTH),
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // TAMPERING DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    // Check for fake audio
    if (audioIsFake) {
      lied = true;
      documentLie('AudioBuffer', 'audio is fake');
    }

    // Check for sample mismatch between getChannelData and copyFromChannel
    const samplesMatch = binsSample.toString() === copySample.toString();
    const copyFromChannelSupported = 'copyFromChannel' in AudioBuffer.prototype;

    if (copyFromChannelSupported && !samplesMatch) {
      lied = true;
      documentLie(
        'AudioBuffer',
        'getChannelData and copyFromChannel samples mismatch',
      );
    }

    // Check for suspiciously high sample uniqueness (noise injection)
    const totalUniqueSamples = new Set([...bins]).size;

    if (totalUniqueSamples === BUFFER_LENGTH) {
      sendToTrash(
        'AudioBuffer',
        `${totalUniqueSamples} unique samples of ${BUFFER_LENGTH} is too high`,
      );
    }

    // Detect noise injection through buffer manipulation
    const noiseFactor = detectBufferNoise();
    const noise =
      noiseFactor ||
      [...new Set(bins.slice(0, 100))].reduce((sum, n) => sum + n, 0);

    if (noise) {
      lied = true;
      documentLie('AudioBuffer', 'sample noise detected');
    }

    logTestResult({ time: timer.stop(), test: 'audio', passed: true });

    return {
      totalUniqueSamples,
      compressorGainReduction,
      floatFrequencyDataSum,
      floatTimeDomainDataSum,
      sampleSum,
      binsSample,
      copySample: copyFromChannelSupported ? copySample : [undefined],
      values,
      noise,
      lied,
    };
  } catch (error) {
    logTestResult({ test: 'audio', passed: false });
    captureError(error, 'OfflineAudioContext failed or blocked by client');
    return undefined;
  }
}
