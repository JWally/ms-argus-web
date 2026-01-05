/**
 * Font Fingerprinting Constants
 *
 * Font lists organized by operating system and version for fingerprinting
 * and OS detection. Each OS has unique fonts that ship with specific versions,
 * allowing us to identify the OS and even its version from installed fonts.
 */

import { PlatformClassifier } from '../utils/types';

/**
 * Windows fonts by version.
 *
 * Each Windows release adds new fonts that can be used to identify the version.
 * @see https://docs.microsoft.com/en-us/typography/fonts/windows_11_font_list
 */
export const WINDOWS_FONTS_BY_VERSION: Record<string, string[]> = {
  '7': ['Cambria Math', 'Lucida Console'],
  '8': ['Aldhabi', 'Gadugi', 'Myanmar Text', 'Nirmala UI'],
  '8.1': ['Leelawadee UI', 'Javanese Text', 'Segoe UI Emoji'],
  '10': [
    'HoloLens MDL2 Assets', // 10 (v1507)+
    'Segoe MDL2 Assets', // 10 (v1507)+
    'Bahnschrift', // 10 (v1709)
    'Ink Free', // 10 (v1803)
  ],
  '11': ['Segoe Fluent Icons'],
};

/**
 * macOS fonts by version.
 *
 * Apple adds fonts with each macOS release, enabling version detection.
 * @see https://support.apple.com/en-us/HT210192 (Catalina)
 * @see https://support.apple.com/en-sg/HT211240 (Big Sur)
 * @see https://support.apple.com/en-us/HT212587 (Monterey)
 * @see https://support.apple.com/en-us/HT213266 (Ventura)
 */
export const MACOS_FONTS_BY_VERSION: Record<string, string[]> = {
  '10.9': ['Helvetica Neue', 'Geneva'], // Mavericks (Geneva is Mac-only, not iOS)
  '10.10': ['Kohinoor Devanagari Medium', 'Luminari'], // Yosemite
  '10.11': ['PingFang HK Light'], // El Capitan
  '10.12': [
    'American Typewriter Semibold',
    'Futura Bold',
    'SignPainter-HouseScript Semibold',
  ], // Sierra
  '10.13-10.14': ['InaiMathi Bold'], // High Sierra, Mojave
  '10.15-11': ['Galvji', 'MuktaMahee Regular'], // Catalina, Big Sur
  '12': [
    'Noto Sans Gunjala Gondi Regular',
    'Noto Sans Masaram Gondi Regular',
    'Noto Serif Yezidi Regular',
  ], // Monterey
  '13': [
    'Apple SD Gothic Neo ExtraBold',
    'STIX Two Math Regular',
    'STIX Two Text Regular',
    'Noto Sans Canadian Aboriginal Regular',
  ], // Ventura
};

/**
 * Desktop application fonts.
 *
 * Some desktop apps install their own fonts, revealing installed software.
 */
export const DESKTOP_APP_FONTS: Record<string, string[]> = {
  'Microsoft Outlook': ['MS Outlook'],
  'Adobe Acrobat': ['ZWAdobeF'],
  LibreOffice: ['Amiri', 'KACSTOffice', 'Liberation Mono', 'Source Code Pro'],
  OpenOffice: ['DejaVu Sans', 'Gentium Book Basic', 'OpenSymbol'],
};

/**
 * Linux-specific fonts.
 *
 * Common fonts found on Linux distributions and Chrome OS.
 */
export const LINUX_FONTS = [
  'Arimo', // Ubuntu, Chrome OS
  'Chilanka', // Ubuntu
  'Cousine', // Ubuntu, Chrome OS
  'Jomolhari', // Chrome OS
  'MONO', // Ubuntu, Chrome OS
  'Noto Color Emoji', // Linux
  'Ubuntu', // Ubuntu
];

/**
 * Android-specific fonts.
 */
export const ANDROID_FONTS = [
  'Dancing Script', // Android
  'Droid Sans Mono', // Android
  'Roboto', // Android, Chrome OS
];

/**
 * Flattened font arrays for quick access.
 */
export const APPLE_FONTS = Object.values(MACOS_FONTS_BY_VERSION).flat();
export const WINDOWS_FONTS = Object.values(WINDOWS_FONTS_BY_VERSION).flat();
export const ALL_DESKTOP_APP_FONTS = Object.values(DESKTOP_APP_FONTS).flat();

/**
 * Complete font list for fingerprinting.
 *
 * Combined and sorted list of all platform-specific fonts.
 * Total: ~50 fonts
 */
export const FONT_LIST = [
  ...APPLE_FONTS,
  ...WINDOWS_FONTS,
  ...LINUX_FONTS,
  ...ANDROID_FONTS,
  ...ALL_DESKTOP_APP_FONTS,
].sort();

/**
 * Fonts that indicate Windows OS.
 */
export const WINDOWS_INDICATOR_FONTS = [
  'Cambria Math',
  'Nirmala UI',
  'Leelawadee UI',
  'HoloLens MDL2 Assets',
  'Segoe Fluent Icons',
];

/**
 * Fonts that indicate Apple OS (macOS/iOS).
 */
export const APPLE_INDICATOR_FONTS = [
  'Helvetica Neue',
  'Luminari',
  'PingFang HK Light',
  'InaiMathi Bold',
  'Galvji',
  'Chakra Petch',
];

/**
 * Fonts that indicate Linux OS.
 */
export const LINUX_INDICATOR_FONTS = [
  'Arimo',
  'MONO',
  'Ubuntu',
  'Noto Color Emoji',
  'Dancing Script',
  'Droid Sans Mono',
];

/**
 * Windows version detection hash map.
 *
 * Maps font version signatures to Windows versions.
 * The signature is a sorted, comma-joined list of detected version keys.
 */
export const WINDOWS_VERSION_MAP: Record<string, string> = {
  '10,11,7,8,8.1': '11',
  '10,7,8,8.1': '10',
  '7,8,8.1': '8.1',
  '11,7,8,8.1': '8.1', // missing 10
  '7,8': '8',
  '10,7,8': '8', // missing 8.1
  '10,11,7,8': '8', // missing 8.1
  '7': '7',
  '7,8.1': '7',
  '10,7,8.1': '7', // missing 8
  '10,11,7,8.1': '7', // missing 8
};

/**
 * macOS version detection hash map.
 *
 * Maps font version signatures to macOS version names.
 */
export const MACOS_VERSION_MAP: Record<string, string> = {
  '10.10,10.11,10.12,10.13-10.14,10.15-11,10.9,12,13': 'Ventura',
  '10.10,10.11,10.12,10.13-10.14,10.15-11,10.9,12': 'Monterey',
  '10.10,10.11,10.12,10.13-10.14,10.15-11,10.9': '10.15-11',
  '10.10,10.11,10.12,10.13-10.14,10.9': '10.13-10.14',
  '10.10,10.11,10.12,10.9': 'Sierra',
  '10.10,10.11,10.9': 'El Capitan',
  '10.10,10.9': 'Yosemite',
  '10.9': 'Mavericks',
};
