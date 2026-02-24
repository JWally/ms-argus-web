/**
 * Ad Blocker Detection Constants
 *
 * CSS class/id selectors known to be targeted by major filter lists.
 * Each filter list category has multiple probe selectors.
 */

/**
 * Filter list probes.
 *
 * Each entry is [listName, probeSelectors[]].
 * Probes use class names or IDs known to be hidden by that filter list.
 */
export const FILTER_LIST_PROBES: [
  string,
  { className?: string; id?: string }[],
][] = [
  [
    'easylist',
    [
      { className: 'ad-banner' },
      { className: 'ad-placeholder' },
      { id: 'ad-container' },
      { className: 'adsbox' },
    ],
  ],
  [
    'adguard-base',
    [
      { className: 'adguard-ads' },
      { id: 'adguard-banner' },
      { className: 'ad_wrapper' },
    ],
  ],
  [
    'adguard-tracking',
    [
      { className: 'tracking-pixel' },
      { id: 'tracking-container' },
      { className: 'tracker-wrapper' },
    ],
  ],
  [
    'fanboy-annoyances',
    [
      { className: 'newsletter-popup' },
      { id: 'cookie-banner' },
      { className: 'push-notification-prompt' },
      { className: 'social-share-popup' },
    ],
  ],
  [
    'fanboy-social',
    [
      { className: 'social-widget' },
      { id: 'social-buttons' },
      { className: 'fb-like-box' },
    ],
  ],
  [
    'ublock-filters',
    [
      { className: 'ubo-test-ad' },
      { id: 'ublock-ad-marker' },
      { className: 'sponsored-content' },
      { className: 'ad-slot' },
    ],
  ],
];
