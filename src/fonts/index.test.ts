import { describe, it, expect } from 'vitest';
import {
  WINDOWS_FONTS_BY_VERSION,
  MACOS_FONTS_BY_VERSION,
  DESKTOP_APP_FONTS,
  LINUX_FONTS,
  ANDROID_FONTS,
  APPLE_FONTS,
  WINDOWS_FONTS,
  ALL_DESKTOP_APP_FONTS,
  FONT_LIST,
  WINDOWS_INDICATOR_FONTS,
  APPLE_INDICATOR_FONTS,
  LINUX_INDICATOR_FONTS,
  WINDOWS_VERSION_MAP,
  MACOS_VERSION_MAP,
} from './constants';

describe('fonts constants', () => {
  describe('WINDOWS_FONTS_BY_VERSION', () => {
    it('is an object', () => {
      expect(typeof WINDOWS_FONTS_BY_VERSION).toBe('object');
    });

    it('has Windows 7 fonts', () => {
      expect(WINDOWS_FONTS_BY_VERSION['7']).toBeDefined();
      expect(WINDOWS_FONTS_BY_VERSION['7']).toContain('Cambria Math');
    });

    it('has Windows 8 fonts', () => {
      expect(WINDOWS_FONTS_BY_VERSION['8']).toBeDefined();
      expect(WINDOWS_FONTS_BY_VERSION['8']).toContain('Nirmala UI');
    });

    it('has Windows 8.1 fonts', () => {
      expect(WINDOWS_FONTS_BY_VERSION['8.1']).toBeDefined();
      expect(WINDOWS_FONTS_BY_VERSION['8.1']).toContain('Segoe UI Emoji');
    });

    it('has Windows 10 fonts', () => {
      expect(WINDOWS_FONTS_BY_VERSION['10']).toBeDefined();
      expect(WINDOWS_FONTS_BY_VERSION['10']).toContain('Bahnschrift');
    });

    it('has Windows 11 fonts', () => {
      expect(WINDOWS_FONTS_BY_VERSION['11']).toBeDefined();
      expect(WINDOWS_FONTS_BY_VERSION['11']).toContain('Segoe Fluent Icons');
    });
  });

  describe('MACOS_FONTS_BY_VERSION', () => {
    it('is an object', () => {
      expect(typeof MACOS_FONTS_BY_VERSION).toBe('object');
    });

    it('has Mavericks fonts (10.9)', () => {
      expect(MACOS_FONTS_BY_VERSION['10.9']).toBeDefined();
      expect(MACOS_FONTS_BY_VERSION['10.9']).toContain('Helvetica Neue');
    });

    it('has Sierra fonts (10.12)', () => {
      expect(MACOS_FONTS_BY_VERSION['10.12']).toBeDefined();
      expect(MACOS_FONTS_BY_VERSION['10.12']).toContain('Futura Bold');
    });

    it('has Monterey fonts (12)', () => {
      expect(MACOS_FONTS_BY_VERSION['12']).toBeDefined();
      expect(MACOS_FONTS_BY_VERSION['12'].length).toBeGreaterThan(0);
    });

    it('has Ventura fonts (13)', () => {
      expect(MACOS_FONTS_BY_VERSION['13']).toBeDefined();
      expect(MACOS_FONTS_BY_VERSION['13'].length).toBeGreaterThan(0);
    });
  });

  describe('DESKTOP_APP_FONTS', () => {
    it('has Microsoft Outlook fonts', () => {
      expect(DESKTOP_APP_FONTS['Microsoft Outlook']).toContain('MS Outlook');
    });

    it('has Adobe Acrobat fonts', () => {
      expect(DESKTOP_APP_FONTS['Adobe Acrobat']).toContain('ZWAdobeF');
    });

    it('has LibreOffice fonts', () => {
      expect(DESKTOP_APP_FONTS['LibreOffice']).toContain('Liberation Mono');
    });

    it('has OpenOffice fonts', () => {
      expect(DESKTOP_APP_FONTS['OpenOffice']).toContain('OpenSymbol');
    });
  });

  describe('LINUX_FONTS', () => {
    it('is an array', () => {
      expect(Array.isArray(LINUX_FONTS)).toBe(true);
    });

    it('has 7 Linux fonts', () => {
      expect(LINUX_FONTS.length).toBe(7);
    });

    it('includes Ubuntu font', () => {
      expect(LINUX_FONTS).toContain('Ubuntu');
    });

    it('includes Noto Color Emoji', () => {
      expect(LINUX_FONTS).toContain('Noto Color Emoji');
    });
  });

  describe('ANDROID_FONTS', () => {
    it('is an array', () => {
      expect(Array.isArray(ANDROID_FONTS)).toBe(true);
    });

    it('has 3 Android fonts', () => {
      expect(ANDROID_FONTS.length).toBe(3);
    });

    it('includes Roboto', () => {
      expect(ANDROID_FONTS).toContain('Roboto');
    });

    it('includes Droid Sans Mono', () => {
      expect(ANDROID_FONTS).toContain('Droid Sans Mono');
    });
  });

  describe('flattened arrays', () => {
    it('APPLE_FONTS contains all macOS version fonts', () => {
      expect(APPLE_FONTS).toContain('Helvetica Neue');
      expect(APPLE_FONTS).toContain('Luminari');
      expect(APPLE_FONTS).toContain('Galvji');
    });

    it('WINDOWS_FONTS contains all Windows version fonts', () => {
      expect(WINDOWS_FONTS).toContain('Cambria Math');
      expect(WINDOWS_FONTS).toContain('Segoe UI Emoji');
      expect(WINDOWS_FONTS).toContain('Segoe Fluent Icons');
    });

    it('ALL_DESKTOP_APP_FONTS contains app fonts', () => {
      expect(ALL_DESKTOP_APP_FONTS).toContain('MS Outlook');
      expect(ALL_DESKTOP_APP_FONTS).toContain('ZWAdobeF');
    });
  });

  describe('FONT_LIST', () => {
    it('is an array', () => {
      expect(Array.isArray(FONT_LIST)).toBe(true);
    });

    it('has many fonts', () => {
      expect(FONT_LIST.length).toBeGreaterThan(40);
    });

    it('is sorted alphabetically', () => {
      const sorted = [...FONT_LIST].sort();
      expect(FONT_LIST).toEqual(sorted);
    });

    it('contains fonts from all platforms', () => {
      // Windows
      expect(FONT_LIST).toContain('Cambria Math');
      // macOS
      expect(FONT_LIST).toContain('Helvetica Neue');
      // Linux
      expect(FONT_LIST).toContain('Ubuntu');
      // Android
      expect(FONT_LIST).toContain('Roboto');
    });
  });

  describe('indicator fonts', () => {
    it('WINDOWS_INDICATOR_FONTS are Windows-specific', () => {
      expect(WINDOWS_INDICATOR_FONTS).toContain('Cambria Math');
      expect(WINDOWS_INDICATOR_FONTS).toContain('Segoe Fluent Icons');
    });

    it('APPLE_INDICATOR_FONTS are Apple-specific', () => {
      expect(APPLE_INDICATOR_FONTS).toContain('Helvetica Neue');
      expect(APPLE_INDICATOR_FONTS).toContain('Luminari');
    });

    it('LINUX_INDICATOR_FONTS are Linux-specific', () => {
      expect(LINUX_INDICATOR_FONTS).toContain('Ubuntu');
      expect(LINUX_INDICATOR_FONTS).toContain('Droid Sans Mono');
    });
  });

  describe('WINDOWS_VERSION_MAP', () => {
    it('maps full set to Windows 11', () => {
      expect(WINDOWS_VERSION_MAP['10,11,7,8,8.1']).toBe('11');
    });

    it('maps without 11 to Windows 10', () => {
      expect(WINDOWS_VERSION_MAP['10,7,8,8.1']).toBe('10');
    });

    it('maps without 10 to Windows 8.1', () => {
      expect(WINDOWS_VERSION_MAP['7,8,8.1']).toBe('8.1');
    });

    it('maps just 7 to Windows 7', () => {
      expect(WINDOWS_VERSION_MAP['7']).toBe('7');
    });
  });

  describe('MACOS_VERSION_MAP', () => {
    it('maps full set to Ventura', () => {
      expect(
        MACOS_VERSION_MAP['10.10,10.11,10.12,10.13-10.14,10.15-11,10.9,12,13'],
      ).toBe('Ventura');
    });

    it('maps without 13 to Monterey', () => {
      expect(
        MACOS_VERSION_MAP['10.10,10.11,10.12,10.13-10.14,10.15-11,10.9,12'],
      ).toBe('Monterey');
    });

    it('maps just 10.9 to Mavericks', () => {
      expect(MACOS_VERSION_MAP['10.9']).toBe('Mavericks');
    });
  });
});

// Test OS detection patterns
describe('font OS detection patterns', () => {
  describe('Windows version detection', () => {
    it('can detect Windows version from fonts', () => {
      const detectWindowsVersion = (detectedVersions: string[]) => {
        const key = detectedVersions.sort().join(',');
        return WINDOWS_VERSION_MAP[key];
      };

      expect(detectWindowsVersion(['7', '8', '8.1', '10', '11'])).toBe('11');
      expect(detectWindowsVersion(['7', '8', '8.1', '10'])).toBe('10');
      expect(detectWindowsVersion(['7'])).toBe('7');
    });
  });

  describe('macOS version detection', () => {
    it('can detect macOS version from fonts', () => {
      const detectMacOSVersion = (detectedVersions: string[]) => {
        const key = detectedVersions.sort().join(',');
        return MACOS_VERSION_MAP[key];
      };

      expect(
        detectMacOSVersion([
          '10.9',
          '10.10',
          '10.11',
          '10.12',
          '10.13-10.14',
          '10.15-11',
          '12',
          '13',
        ]),
      ).toBe('Ventura');
      expect(detectMacOSVersion(['10.9'])).toBe('Mavericks');
    });
  });

  describe('OS platform detection', () => {
    it('can detect OS from indicator fonts', () => {
      const detectOS = (fonts: string[]) => {
        if (fonts.some((f) => WINDOWS_INDICATOR_FONTS.includes(f)))
          return 'Windows';
        if (fonts.some((f) => APPLE_INDICATOR_FONTS.includes(f)))
          return 'Apple';
        if (fonts.some((f) => LINUX_INDICATOR_FONTS.includes(f)))
          return 'Linux';
        return 'Unknown';
      };

      expect(detectOS(['Cambria Math', 'Arial'])).toBe('Windows');
      expect(detectOS(['Helvetica Neue', 'San Francisco'])).toBe('Apple');
      expect(detectOS(['Ubuntu', 'DejaVu Sans'])).toBe('Linux');
      expect(detectOS(['Unknown Font'])).toBe('Unknown');
    });
  });
});
