/**
 * Argus Lite - External Data Version
 *
 * This entry point uses external JSON files for fingerprinting data,
 * resulting in a smaller initial bundle that loads data on demand.
 *
 * Usage:
 *   import { collectFingerprint, setDataBasePath } from 'argus/lite';
 *
 *   // Optional: Set custom data path
 *   setDataBasePath('/my-custom-path/data');
 *
 *   // Collect fingerprint (data loaded automatically)
 *   const fp = await collectFingerprint();
 */

// Re-export the main fingerprint function
export { collectFingerprint } from './fingerprint';

// Export data loader utilities
export {
  setDataBasePath,
  getDataBasePath,
  preloadAllData,
  clearDataCache,
} from './utils/data-loader';

// Export types
export type { FingerprintResult } from './fingerprint';
