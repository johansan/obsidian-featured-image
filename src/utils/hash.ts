import { createHash } from 'crypto';

/**
 * Generates an MD5 hash for the given input.
 * @param {string} input - Value to hash.
 * @returns {string} Hex digest.
 */
export const md5 = (input: string): string => {
    return createHash('md5').update(input).digest('hex');
};
