/**
 * CSS Fingerprinting Constants
 *
 * System color and font keywords for fingerprinting.
 */

/**
 * CSS system color keywords.
 *
 * These colors are defined by the OS and vary by platform:
 * - Windows uses different colors than macOS
 * - Light/dark mode affects values
 * - High contrast modes have distinct values
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/system-color
 */
export const SYSTEM_COLORS = [
  'ActiveBorder',
  'ActiveCaption',
  'ActiveText',
  'AppWorkspace',
  'Background',
  'ButtonBorder',
  'ButtonFace',
  'ButtonHighlight',
  'ButtonShadow',
  'ButtonText',
  'Canvas',
  'CanvasText',
  'CaptionText',
  'Field',
  'FieldText',
  'GrayText',
  'Highlight',
  'HighlightText',
  'InactiveBorder',
  'InactiveCaption',
  'InactiveCaptionText',
  'InfoBackground',
  'InfoText',
  'LinkText',
  'Mark',
  'MarkText',
  'Menu',
  'MenuText',
  'Scrollbar',
  'ThreeDDarkShadow',
  'ThreeDFace',
  'ThreeDHighlight',
  'ThreeDLightShadow',
  'ThreeDShadow',
  'VisitedText',
  'Window',
  'WindowFrame',
  'WindowText',
] as const;

/**
 * CSS system font keywords.
 *
 * These shorthand keywords resolve to OS-specific font settings:
 * - Different fonts on Windows vs macOS vs Linux
 * - Font size may vary by DPI/display settings
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font
 */
export const SYSTEM_FONTS = [
  'caption',
  'icon',
  'menu',
  'message-box',
  'small-caption',
  'status-bar',
] as const;

/**
 * Named CSS color keywords for resolution fingerprinting.
 *
 * Browsers may resolve these to slightly different computed RGB values
 * depending on color profile, rendering engine, and OS color management.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/named-color
 */
export const NAMED_CSS_COLORS = [
  'rebeccapurple',
  'aliceblue',
  'antiquewhite',
  'aquamarine',
  'blanchedalmond',
  'chartreuse',
  'cornsilk',
  'darkgoldenrod',
  'darkolivegreen',
  'darkslategray',
  'deeppink',
  'dimgray',
  'floralwhite',
  'gainsboro',
  'ghostwhite',
  'honeydew',
  'indianred',
  'lavenderblush',
  'lemonchiffon',
  'lightcoral',
  'lightgoldenrodyellow',
  'lightskyblue',
  'limegreen',
  'mediumaquamarine',
  'mediumslateblue',
  'midnightblue',
  'navajowhite',
  'oldlace',
  'olivedrab',
  'papayawhip',
] as const;

/**
 * Regex to match CSS custom properties (variables).
 */
export const CSS_VAR_REGEX = /^--.*$/;

/**
 * Regex to match capital letters (for camelCase detection).
 */
export const CAPS_REGEX = /[A-Z]/g;
