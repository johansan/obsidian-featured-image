/**
 * Checks if the URL is valid and that the protocol is HTTPS.
 * @param {string} url - The URL to check.
 * @returns {boolean} True if the URL is valid, false otherwise.
 */
export const isValidHttpsUrl = (url: string): boolean => {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'https:';
    } catch {
        return false;
    }
};
