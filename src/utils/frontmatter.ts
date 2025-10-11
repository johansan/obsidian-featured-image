import type { FeaturedImageSettings } from '../settings';

type MediaLinkFormat = FeaturedImageSettings['mediaLinkFormat'];

/**
 * Configuration for updating a media-related frontmatter property.
 */
interface MediaPropertyOptions {
    property: string; // Frontmatter property name to update
    value: string | undefined; // New value for the property (path or URL)
    format: MediaLinkFormat; // Format style for the value
    keepEmpty: boolean; // Whether to keep empty properties
}

/**
 * Formats a media link according to the selected frontmatter output style.
 * @param {string} value - The path or URL to format.
 * @param {MediaLinkFormat} format - Desired media link format.
 * @returns {string} Formatted media link value.
 */
const formatMediaLinkValue = (value: string, format: MediaLinkFormat): string => {
    switch (format) {
        case 'wiki':
            return `[[${value}]]`;
        case 'embed':
            return `![[${value}]]`;
        case 'plain':
        default:
            return value;
    }
};

/**
 * Applies a media property update to the provided frontmatter object.
 * Handles formatting and property removal when necessary.
 * @param {Record<string, unknown>} frontmatter - The frontmatter object to mutate.
 * @param {MediaPropertyOptions} options - Update configuration.
 */
export const applyMediaProperty = (frontmatter: Record<string, unknown>, options: MediaPropertyOptions): void => {
    const { property, value, format, keepEmpty } = options;

    if (value) {
        frontmatter[property] = formatMediaLinkValue(value, format);
        return;
    }

    if (keepEmpty) {
        frontmatter[property] = '';
    } else {
        delete frontmatter[property];
    }
};
