import { getLanguage } from 'obsidian';

/**
 * Central export point for internationalization
 * Dynamically loads the appropriate language based on Obsidian's language setting
 */
import { STRINGS_EN } from './locales/en';
import { STRINGS_DE } from './locales/de';
import { STRINGS_ES } from './locales/es';
import { STRINGS_FR } from './locales/fr';
import { STRINGS_JA } from './locales/ja';
import { STRINGS_ZH } from './locales/zh';

// Type for the translation strings structure
type TranslationStrings = typeof STRINGS_EN;

// Map of supported languages to their translation modules
const LANGUAGE_MAP: Record<string, TranslationStrings> = {
    en: STRINGS_EN,
    de: STRINGS_DE,
    es: STRINGS_ES,
    fr: STRINGS_FR,
    ja: STRINGS_JA,
    zh: STRINGS_ZH
};

/**
 * Gets the current language setting from Obsidian
 */
export function getCurrentLanguage(): string {
    return getLanguage();
}

/**
 * Detects the current Obsidian language setting
 * Falls back to English if the language is not supported
 */
function getObsidianLanguage(): string {
    const locale = getCurrentLanguage();

    // Check if the detected language is supported
    if (locale && locale in LANGUAGE_MAP) {
        return locale;
    }

    // Fallback to English
    return 'en';
}

// Export the appropriate language strings based on Obsidian's setting
export const strings: TranslationStrings = LANGUAGE_MAP[getObsidianLanguage()];
