/**
 * Audio Fingerprinting Types
 *
 * Type definitions for audio fingerprinting data structures.
 */

/**
 * Raw audio data extracted from rendered audio buffer.
 * Contains frequency analysis, time domain data, and compression metrics.
 */
export interface AudioRenderData {
  /** Float32Array of frequency bin magnitudes in decibels */
  floatFrequencyData: Float32Array;

  /** Float32Array of time domain waveform data */
  floatTimeDomainData: Float32Array;

  /** The rendered audio buffer containing raw PCM samples */
  buffer: AudioBuffer;

  /**
   * The gain reduction applied by the dynamics compressor.
   * This value varies by browser engine and is a key fingerprint component.
   * - Blink: around -20.5
   * - Gecko: around -31.5
   * - WebKit: around -29.8
   */
  compressorGainReduction: number;
}

/**
 * Audio node parameter values collected for fingerprinting.
 * These values can vary between browser implementations.
 */
export interface AudioNodeValues {
  'AnalyserNode.channelCount': number | undefined;
  'AnalyserNode.channelCountMode': string | undefined;
  'AnalyserNode.channelInterpretation': string | undefined;
  'AnalyserNode.context.sampleRate': number | undefined;
  'AnalyserNode.fftSize': number | undefined;
  'AnalyserNode.frequencyBinCount': number | undefined;
  'AnalyserNode.maxDecibels': number | undefined;
  'AnalyserNode.minDecibels': number | undefined;
  'AnalyserNode.numberOfInputs': number | undefined;
  'AnalyserNode.numberOfOutputs': number | undefined;
  'AnalyserNode.smoothingTimeConstant': number | undefined;
  'AnalyserNode.context.listener.forwardX.maxValue': number | undefined;
  'BiquadFilterNode.gain.maxValue': number | undefined;
  'BiquadFilterNode.frequency.defaultValue': number | undefined;
  'BiquadFilterNode.frequency.maxValue': number | undefined;
  'DynamicsCompressorNode.attack.defaultValue': number | undefined;
  'DynamicsCompressorNode.knee.defaultValue': number | undefined;
  'DynamicsCompressorNode.knee.maxValue': number | undefined;
  'DynamicsCompressorNode.ratio.defaultValue': number | undefined;
  'DynamicsCompressorNode.ratio.maxValue': number | undefined;
  'DynamicsCompressorNode.release.defaultValue': number | undefined;
  'DynamicsCompressorNode.release.maxValue': number | undefined;
  'DynamicsCompressorNode.threshold.defaultValue': number | undefined;
  'DynamicsCompressorNode.threshold.minValue': number | undefined;
  'OscillatorNode.detune.maxValue': number | undefined;
  'OscillatorNode.detune.minValue': number | undefined;
  'OscillatorNode.frequency.defaultValue': number | undefined;
  'OscillatorNode.frequency.maxValue': number | undefined;
  'OscillatorNode.frequency.minValue': number | undefined;
}

/**
 * Complete audio fingerprint result.
 */
export interface AudioFingerprint {
  /**
   * Number of unique sample values in the rendered buffer.
   * Extremely high uniqueness (equal to buffer length) may indicate tampering.
   */
  totalUniqueSamples: number;

  /**
   * Gain reduction from the dynamics compressor.
   * Key identifier for browser engine.
   */
  compressorGainReduction: number | undefined;

  /**
   * Sum of absolute values in the frequency data array.
   * Used in pattern matching for fingerprint validation.
   */
  floatFrequencyDataSum: number;

  /**
   * Sum of absolute values in the time domain data array.
   * Used in pattern matching for fingerprint validation.
   */
  floatTimeDomainDataSum: number;

  /**
   * Sum of samples from index 4500 to buffer end.
   * Primary fingerprint value - should match known patterns.
   */
  sampleSum: number;

  /**
   * Sample values from getChannelData (indices 4500-4600).
   * Used for cross-validation with copyFromChannel.
   */
  binsSample: number[];

  /**
   * Sample values from copyFromChannel (indices 4500-4600).
   * Should match binsSample - mismatch indicates tampering.
   */
  copySample: (number | undefined)[];

  /**
   * Collection of audio node parameter values.
   */
  values: AudioNodeValues;

  /**
   * Detected noise in the audio buffer.
   * Non-zero value indicates potential tampering or modification.
   */
  noise: number;

  /**
   * Whether tampering/lies were detected in the audio API.
   */
  lied: boolean;
}
