/**
 * Ad Blocker Detection Module
 *
 * Detects ad blockers by probing CSS selectors known to be targeted
 * by major filter lists (EasyList, AdGuard, Fanboy, uBlock).
 *
 * Technique: Create DOM elements with class names / IDs that appear
 * on popular filter lists, give the browser one animation frame to
 * apply cosmetic filter rules, then check which elements were hidden.
 *
 * The combination of blocked/unblocked elements reveals which specific
 * filter lists are active, creating a fingerprint signature.
 *
 * @module adblock
 */

import { captureError } from '../errors';
import { hashMini } from '../utils/crypto';
import { createTimer, queueEvent, logTestResult } from '../utils/helpers';
import { FILTER_LIST_PROBES } from './constants';
import type { AdBlockFingerprint } from './types';

/**
 * Collects ad blocker detection fingerprint.
 *
 * Creates offscreen elements matching known filter list selectors,
 * waits one frame for ad blocker rules to apply, then checks visibility.
 *
 * @returns Ad blocker fingerprint data or undefined on error
 */
export default async function getAdBlock(): Promise<
  AdBlockFingerprint | undefined
> {
  try {
    const timer = createTimer();
    await queueEvent(timer);

    // Create offscreen container
    const container = document.createElement('div');
    container.style.cssText =
      'position:absolute;top:-10000px;left:-10000px;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(container);

    // Create all probe elements
    const probeElements: { listName: string; el: HTMLDivElement }[] = [];
    let totalTested = 0;

    for (const [listName, selectors] of FILTER_LIST_PROBES) {
      for (const selector of selectors) {
        const el = document.createElement('div');
        el.style.cssText = 'width:1px;height:1px;';
        if (selector.className) el.className = selector.className;
        if (selector.id) el.id = selector.id;
        container.appendChild(el);
        probeElements.push({ listName, el });
        totalTested++;
      }
    }

    // Give ad blocker one frame to apply cosmetic rules
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );

    // Check each element
    let blockedCount = 0;
    const listBlockCounts: Record<string, number> = {};
    const listTotalCounts: Record<string, number> = {};

    for (const { listName, el } of probeElements) {
      listTotalCounts[listName] = (listTotalCounts[listName] || 0) + 1;

      const isHidden =
        el.offsetHeight === 0 ||
        el.offsetWidth === 0 ||
        getComputedStyle(el).display === 'none' ||
        getComputedStyle(el).visibility === 'hidden';

      if (isHidden) {
        blockedCount++;
        listBlockCounts[listName] = (listBlockCounts[listName] || 0) + 1;
      }
    }

    // Build per-list detection results
    const lists: Record<string, boolean> = {};
    let bitmask = 0;

    for (let i = 0; i < FILTER_LIST_PROBES.length; i++) {
      const listName = FILTER_LIST_PROBES[i][0];
      const blocked = (listBlockCounts[listName] || 0) > 0;
      lists[listName] = blocked;
      if (blocked) bitmask |= 1 << i;
    }

    const filterListSignature = hashMini(bitmask);

    // Cleanup
    container.parentNode?.removeChild(container);

    logTestResult({ time: timer.stop(), test: 'adblock', passed: true });

    return {
      detected: blockedCount > 0,
      blockedCount,
      totalTested,
      filterListSignature,
      lists,
    };
  } catch (error) {
    logTestResult({ test: 'adblock', passed: false });
    captureError(error);
    return undefined;
  }
}
