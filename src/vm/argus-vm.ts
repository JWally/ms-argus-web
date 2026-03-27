/**
 * Argus-Web VM orchestrator.
 *
 * Ported from ms-argus-bio/src/vm/tripwire.ts.
 * Loads XOR-scrambled bytecode, descrambles, runs async VM.
 * The VM does bot detection + sigint probes + ECDH encrypt + POST.
 *
 * Returns:
 *   - tampered: bot signals were detected
 *   - sessionId: returned by /v1/collect after successful POST
 *   - vmSignals: individual signal names (for diagnostics)
 */

import { decode } from './decoder';
import { executeAsync } from './interpreter';
import { createArgusVmBridge } from './bridge';
import type { ArgusVmContext } from './bridge';
import type { SigintConfig } from '../utils/sigint';
import type { FingerprintResult } from '../fingerprint';
import type { EvercookieData } from '../utils/evercookie';
import type { CryptoKeys } from '../utils/get-crypto-id';
import { buildPayload } from '../telemetry/payload';

let bytecodeCache: { bytecode: string; key: string; secret: string } | null =
  null;

/** Module-level prefetch slot — populated by prefetchArgusVm(), consumed by runArgusVm() */
let _prefetchSlot: Promise<{
  modules: NonNullable<Awaited<ReturnType<typeof loadBytecodeModules>>>;
  handshake: NonNullable<Awaited<ReturnType<typeof _fetchHandshake>>>;
} | null> | null = null;

async function loadBytecodeModules() {
  if (bytecodeCache) return bytecodeCache;
  try {
    const mod = await import('./bytecode-modules');
    bytecodeCache = {
      bytecode: mod.VM_BYTECODE,
      key: mod.VM_KEY,
      secret: mod.DEPLOY_SECRET,
    };
    return bytecodeCache;
  } catch {
    return null;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function xorDescramble(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

function base64ToBytes(b64: string): Uint8Array {
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

// Raw P-256 uncompressed public key = 65 bytes = 88 chars base64 (with padding)
const SERVER_PUBKEY_B64_LEN = 88;

/**
 * Perform the handshake with /v1/handshake.
 *
 * Generates a throw-away P-256 keypair, sends the public key as X-Argus-Origin
 * (quid-pro-quo: show yours to get ours), and extracts the server public key
 * from the last 88 chars of the opaque token in the response.
 *
 * The token looks like a single opaque blob — the server pubkey is buried at
 * the end with no label. Returns null on any failure.
 */
async function _fetchHandshake(
  apiBase: string,
): Promise<{ serverPubKey: string; sessionToken: string } | null> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
    const rawPub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const clientPubKeyB64 = btoa(
      String.fromCharCode(...new Uint8Array(rawPub)),
    );

    const res = await fetch(`${apiBase}/v1/handshake`, {
      headers: { 'X-Argus-Origin': clientPubKeyB64 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { token?: string };
    const token = data.token;
    if (!token || token.length < SERVER_PUBKEY_B64_LEN) return null;

    return {
      serverPubKey: token.slice(-SERVER_PUBKEY_B64_LEN),
      sessionToken: token,
    };
  } catch {
    return null;
  }
}

/**
 * Pre-warm: start handshake + bytecode load immediately, before fingerprint collection.
 * Call this as early as possible. runArgusVm() will consume the result automatically.
 */
export function prefetchArgusVm(apiBase: string): void {
  _prefetchSlot = Promise.all([
    loadBytecodeModules(),
    _fetchHandshake(apiBase),
  ]).then(([modules, handshake]) =>
    modules && handshake ? { modules, handshake } : null,
  );
}

export interface ArgusVmResult {
  tampered: boolean;
  sessionId: string;
  vmSignals: string[];
  vmHash: string;
}

/**
 * Run the argus-web VM.
 *
 * @param fingerprint - Collected fingerprint data to submit
 * @param apiBase - API base URL, e.g. "https://api.argus.pw"
 * @param sigintConfig - Optional sigint config for TCP/H2/TLS probes
 * @returns VM result including sessionId returned by the API
 */
export async function runArgusVm(
  fingerprint: FingerprintResult,
  apiBase: string,
  sigintConfig?: SigintConfig,
  evercookieData?: EvercookieData | null,
  cryptoIdData?: CryptoKeys | null,
): Promise<ArgusVmResult> {
  const fallback: ArgusVmResult = {
    tampered: false,
    sessionId: '',
    vmSignals: [],
    vmHash: '',
  };

  // Consume prefetch slot if available (started by prefetchArgusVm() before fingerprint collection),
  // otherwise fall back to fetching now.
  const prefetched = _prefetchSlot;
  _prefetchSlot = null;

  let modules: Awaited<ReturnType<typeof loadBytecodeModules>>;
  let handshake: Awaited<ReturnType<typeof _fetchHandshake>>;

  if (prefetched) {
    const result = await prefetched;
    if (!result) return fallback;
    modules = result.modules;
    handshake = result.handshake;
  } else {
    [modules, handshake] = await Promise.all([
      loadBytecodeModules(),
      _fetchHandshake(apiBase),
    ]);
    if (!modules || !handshake) return fallback;
  }

  try {
    const scrambled = base64ToBytes(modules.bytecode);
    const key = hexToBytes(modules.key);
    const binary = xorDescramble(scrambled, key);
    const mod = decode(binary.buffer as ArrayBuffer);

    let immolateSignals: string[] | null = null;
    const ctx: ArgusVmContext = {
      getPayload: () => {
        return buildPayload(
          {
            fingerprint,
            evercookie: evercookieData ?? undefined,
            cryptoId: cryptoIdData ?? undefined,
          },
          crypto.randomUUID(),
        ) as unknown as Record<string, unknown>;
      },
      getStableHash: () => fingerprint.hashes.stable,
      getServerPubKey: () => handshake.serverPubKey,
      onImmolate: (signals) => {
        immolateSignals = signals;
      },
      sigintConfig,
      apiEndpoint: `${apiBase}/v1/collect`,
      sessionToken: handshake.sessionToken,
    };
    const bridge = createArgusVmBridge(ctx);

    const result = await executeAsync(mod, bridge);

    const vmResult = result.value as
      | {
          tampered: boolean;
          signals: string[];
          hash: string;
          sessionId: string;
          publicKeyB64?: string;
        }
      | undefined;

    if (!vmResult) return fallback;

    return {
      tampered: vmResult.tampered || immolateSignals !== null,
      sessionId: vmResult.sessionId ?? '',
      vmSignals: immolateSignals ?? vmResult.signals,
      vmHash: vmResult.hash,
    };
  } catch {
    return fallback;
  }
}
