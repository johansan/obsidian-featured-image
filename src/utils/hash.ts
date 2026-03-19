/**
 * Generates an MD5 hash for the given input.
 *
 * Obsidian desktop runs with Node.js APIs available, but Obsidian mobile does not.
 * We therefore avoid importing Node's `crypto` module and instead use a small
 * self-contained MD5 implementation that works in both environments.
 */
export const md5 = (input: string): string => {
    const bytes = utf8ToBytes(input);
    const digest = md5Bytes(bytes);
    return bytesToHex(digest);
};

const UTF8_ENCODER = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

const MD5_S: readonly number[] = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4,
    11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];

const MD5_K: Uint32Array = (() => {
    const k = new Uint32Array(64);
    for (let i = 0; i < 64; i++) {
        k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
    }
    return k;
})();

const utf8ToBytes = (input: string): Uint8Array => {
    if (!input) {
        return new Uint8Array(0);
    }

    if (UTF8_ENCODER) {
        return UTF8_ENCODER.encode(input);
    }

    const bytes: number[] = [];

    const pushCodePoint = (codePoint: number) => {
        if (codePoint <= 0x7f) {
            bytes.push(codePoint);
        } else if (codePoint <= 0x7ff) {
            bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
        } else if (codePoint <= 0xffff) {
            bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
        } else {
            bytes.push(
                0xf0 | (codePoint >> 18),
                0x80 | ((codePoint >> 12) & 0x3f),
                0x80 | ((codePoint >> 6) & 0x3f),
                0x80 | (codePoint & 0x3f)
            );
        }
    };

    for (let i = 0; i < input.length; i++) {
        const codeUnit = input.charCodeAt(i);

        // Match `TextEncoder` behavior for malformed UTF-16 by replacing unpaired surrogates with U+FFFD.
        if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
            if (i + 1 < input.length) {
                const next = input.charCodeAt(i + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    const codePoint = 0x10000 + ((codeUnit - 0xd800) << 10) + (next - 0xdc00);
                    pushCodePoint(codePoint);
                    i++;
                    continue;
                }
            }

            bytes.push(0xef, 0xbf, 0xbd);
            continue;
        }

        if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
            bytes.push(0xef, 0xbf, 0xbd);
            continue;
        }

        pushCodePoint(codeUnit);
    }

    return new Uint8Array(bytes);
};

const bytesToHex = (bytes: Uint8Array): string => {
    const hex: string[] = new Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        hex[i] = bytes[i].toString(16).padStart(2, '0');
    }
    return hex.join('');
};

const md5Bytes = (message: Uint8Array): Uint8Array => {
    const originalLengthBits = message.length * 8;

    const withPaddingLength = (((message.length + 8) >>> 6) + 1) << 6;
    const buffer = new Uint8Array(withPaddingLength);
    buffer.set(message);
    buffer[message.length] = 0x80;

    const view = new DataView(buffer.buffer);
    view.setUint32(withPaddingLength - 8, originalLengthBits >>> 0, true);
    view.setUint32(withPaddingLength - 4, Math.floor(originalLengthBits / 0x100000000) >>> 0, true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    for (let offset = 0; offset < buffer.length; offset += 64) {
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;

        const m = new Uint32Array(16);
        for (let i = 0; i < 16; i++) {
            m[i] = view.getUint32(offset + i * 4, true);
        }

        for (let i = 0; i < 64; i++) {
            let f = 0;
            let g = 0;

            if (i < 16) {
                f = (b & c) | (~b & d);
                g = i;
            } else if (i < 32) {
                f = (d & b) | (~d & c);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                g = (7 * i) % 16;
            }

            const tmp = d;
            d = c;
            c = b;
            b = add32(b, rotl(add32(add32(a, f), add32(MD5_K[i], m[g])), MD5_S[i]));
            a = tmp;
        }

        a0 = add32(a0, a);
        b0 = add32(b0, b);
        c0 = add32(c0, c);
        d0 = add32(d0, d);
    }

    const out = new Uint8Array(16);
    const outView = new DataView(out.buffer);
    outView.setUint32(0, a0 >>> 0, true);
    outView.setUint32(4, b0 >>> 0, true);
    outView.setUint32(8, c0 >>> 0, true);
    outView.setUint32(12, d0 >>> 0, true);
    return out;
};

const add32 = (a: number, b: number): number => (a + b) >>> 0;

const rotl = (x: number, n: number): number => ((x << n) | (x >>> (32 - n))) >>> 0;
