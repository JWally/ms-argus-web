/**
 * Speech Synthesis Fingerprinting Module
 *
 * Enumerates available speech synthesis voices for fingerprinting.
 * Voice data provides unique fingerprinting signals because:
 *
 * 1. **OS Differences**: Each OS ships different voices (Siri on macOS,
 *    Google voices on Android, Microsoft voices on Windows).
 *
 * 2. **Language Configuration**: Available voices depend on installed
 *    language packs and user settings.
 *
 * 3. **Local vs Remote**: Some voices are local (offline), others require
 *    network access. This reveals device capabilities.
 *
 * 4. **Default Voice**: The default voice correlates with system locale,
 *    providing a cross-validation point.
 *
 * @see https://wicg.github.io/speech-api/#speechsynthesisvoice-attributes
 * @module speech
 */

import { captureError } from '../errors';
import { lieProps } from '../lies';
import {
  createTimer,
  queueEvent,
  logTestResult,
  IS_BLINK,
  Analysis,
  LowerEntropy,
} from '../utils/helpers';
import { VOICE_LOAD_DELAY_MS, VOICE_TIMEOUT_MS } from './constants';
import type { SpeechFingerprint } from './types';

/**
 * Filters voices to unique voiceURI values.
 *
 * Some browsers return duplicate voices with the same voiceURI.
 * This keeps only the first occurrence of each unique URI.
 */
function getUniques(
  data: SpeechSynthesisVoice[],
  voiceURISet: Set<string>,
): SpeechSynthesisVoice[] {
  return data.filter((voice) => {
    if (!voiceURISet.has(voice.voiceURI)) {
      voiceURISet.add(voice.voiceURI);
      return true;
    }
    return false;
  });
}

/**
 * Extracts fingerprint data from voice list.
 */
function processVoices(data: SpeechSynthesisVoice[]): {
  local: string[];
  remote: string[];
  languages: string[];
  defaultVoiceName: string;
  defaultVoiceLang: string;
} {
  const dataUnique = getUniques(data, new Set());

  // Separate local and remote voices
  const local = dataUnique.filter((x) => x.localService).map((x) => x.name);
  const remote = dataUnique.filter((x) => !x.localService).map((x) => x.name);

  // Get unique languages
  const languages = [...new Set(dataUnique.map((x) => x.lang))];

  // Get default local voice
  const defaultLocalVoices = dataUnique.filter(
    (x) => x.default && x.localService,
  );

  let defaultVoiceName = '';
  let defaultVoiceLang = '';

  if (defaultLocalVoices.length === 1) {
    const { name, lang } = defaultLocalVoices[0];
    defaultVoiceName = name;
    defaultVoiceLang = (lang || '').replace(/_/, '-');
  }

  return { local, remote, languages, defaultVoiceName, defaultVoiceLang };
}

/**
 * Checks if voice language mismatches system locale.
 *
 * If the default voice language doesn't match the Intl locale,
 * it may indicate spoofing or misconfiguration.
 */
function checkVoiceLangMismatch(defaultVoiceLang: string): void {
  if (!defaultVoiceLang) return;

  const { locale: localeLang } = Intl.DateTimeFormat().resolvedOptions();
  if (defaultVoiceLang.split('-')[0] !== localeLang.split('-')[0]) {
    Analysis.voiceLangMismatch = true;
    LowerEntropy.TIME_ZONE = true;
  }
}

/**
 * Collects speech synthesis fingerprint data.
 *
 * Enumerates available speech synthesis voices. This is asynchronous
 * because voices may not be immediately available and require waiting
 * for the 'voiceschanged' event.
 *
 * @returns Speech fingerprint data or null if unsupported/timeout
 */
export default async function getVoices(): Promise<SpeechFingerprint | null> {
  // Wait for services to load
  await new Promise((resolve) => setTimeout(resolve, VOICE_LOAD_DELAY_MS));

  /** Resolves with speech fingerprint data or null on failure/timeout. */
  return new Promise(async (resolve) => {
    try {
      const timer = createTimer();
      await queueEvent(timer);

      // Check browser support (use window, iframe is unstable in FF)
      const supported = 'speechSynthesis' in window;
      if (supported) speechSynthesis.getVoices(); // warm up

      if (!supported) {
        logTestResult({ test: 'speech', passed: false });
        return resolve(null);
      }

      // Check for API tampering
      const lied = !!lieProps['SpeechSynthesis.getVoices'];

      // Set timeout for voice loading
      /** Resolves null if voices fail to load within the timeout window. */
      const giveUpOnVoices = setTimeout(() => {
        logTestResult({ test: 'speech', passed: false });
        return resolve(null);
      }, VOICE_TIMEOUT_MS);

      /**
       * Attempts to retrieve and process available speech synthesis voices.
       * Called immediately and again on the 'voiceschanged' event, since
       * voices may not be available synchronously in all browsers.
       */
      const fetchVoices = (): void => {
        const data = speechSynthesis.getVoices();
        const localServiceDidLoad = (data || []).find((x) => x.localService);

        // In Blink, wait for local service to load
        if (!data || !data.length || (IS_BLINK && !localServiceDidLoad)) {
          return;
        }

        clearTimeout(giveUpOnVoices);

        const { local, remote, languages, defaultVoiceName, defaultVoiceLang } =
          processVoices(data);

        // Check for locale mismatch
        checkVoiceLangMismatch(defaultVoiceLang);

        logTestResult({ time: timer.stop(), test: 'speech', passed: true });
        return resolve({
          local,
          remote,
          languages,
          defaultVoiceName,
          defaultVoiceLang,
          lied,
        });
      };

      // Try immediately
      fetchVoices();

      // Also listen for voiceschanged event
      if (speechSynthesis.addEventListener) {
        speechSynthesis.addEventListener('voiceschanged', fetchVoices);
      } else {
        speechSynthesis.onvoiceschanged = fetchVoices;
      }
    } catch (error) {
      logTestResult({ test: 'speech', passed: false });
      captureError(error);
      return resolve(null);
    }
  });
}
