/**
 * Telemetry helper functions
 * URL detection, session ID generation, gzip compression
 */

import type { TelemetryConfig } from './types';

/**
 * Build API base URL from config
 */
export function buildApiBase(config: TelemetryConfig): string {
  const { baseDomain, stagePrefix = '' } = config;
  const stage = stagePrefix.replace(/-$/, '');
  return stage
    ? `https://api-${stage}.${baseDomain}`
    : `https://api.${baseDomain}`;
}

/**
 * Auto-detect stage from current hostname
 * static-dev-jw.argus.pw -> 'dev-jw-'
 * static.argus.pw -> '' (prod)
 */
export function detectStageFromHostname(): string {
  if (typeof window === 'undefined') return '';
  const hostname = window.location?.hostname || '';
  const match = hostname.match(/^static-([^.]+)\./);
  if (match) return match[1] + '-';
  if (hostname.startsWith('static.')) return '';
  return 'dev-jw-'; // Default to dev
}

/**
 * Auto-detect API base from hostname
 */
export function detectApiBaseFromHostname(baseDomain: string): string {
  if (typeof window === 'undefined') {
    return `https://api.${baseDomain}`;
  }

  const hostname = window.location?.hostname || '';

  // If on argus.pw subdomain, derive API base from hostname
  if (hostname.includes('argus.pw')) {
    const hostParts = hostname.split('.');
    let stage = hostParts.length > 2 ? hostParts[0] : '';
    // Strip static- or demo- prefix to get the stage name
    if (stage.startsWith('static-')) {
      stage = stage.replace('static-', '');
    } else if (stage.startsWith('demo-')) {
      stage = stage.replace('demo-', '');
    } else if (stage === 'static' || stage === 'demo') {
      stage = '';
    }
    return stage ? `https://api-${stage}.argus.pw` : `https://api.argus.pw`;
  }

  // Otherwise use config
  const stagePrefix = detectStageFromHostname();
  const stage = stagePrefix.replace(/-$/, '');
  return stage
    ? `https://api-${stage}.${baseDomain}`
    : `https://api.${baseDomain}`;
}

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
  return 'demo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

/**
 * AR-91: Check if browser supports CompressionStream API for gzip
 * Chrome 80+, Firefox 113+, Safari 16.4+
 */
export function supportsGzipCompression(): boolean {
  return typeof CompressionStream !== 'undefined';
}

/**
 * AR-91: Gzip compress a string and return as Uint8Array (raw binary)
 * Uses browser's CompressionStream API
 */
export async function gzipCompress(data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(data);

  const compressionStream = new CompressionStream('gzip');
  const writer = compressionStream.writable.getWriter();
  writer.write(inputBytes);
  writer.close();

  const compressedStream = compressionStream.readable;
  const reader = compressedStream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine chunks into single Uint8Array
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined;
}
