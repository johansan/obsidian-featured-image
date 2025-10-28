import { App, TFile, normalizePath } from 'obsidian';
import { FeaturedImageSettings, SUPPORTED_IMAGE_EXTENSIONS } from '../settings';
import { strings } from '../i18n';
import { resolveLocalImagePath } from '../utils/obsidian';
import { isValidHttpsUrl } from '../utils/urls';

/**
 * Represents parsed image information from frontmatter properties.
 */
interface FrontmatterImageInfo {
    rawValue: string; // Original frontmatter value as written
    rawPath: string; // Extracted path from rawValue (without formatting)
    resolvedPath: string; // Vault-relative path after resolution
    isResolved: boolean; // Whether the path was successfully resolved
}

/**
 * External dependencies required by the feature scanner.
 */
interface FeatureScannerDeps {
    downloadExternalImage: (imageUrl: string, subfolder?: string) => Promise<string | undefined>;
    downloadYoutubeThumbnail: (videoId: string, currentFeature: string | undefined) => Promise<string | undefined>;
    debugLog: (...args: unknown[]) => void;
    errorLog: (...args: unknown[]) => void;
}

/**
 * Result of processing a line for Auto Card Link content.
 */
interface CardLinkProcessResult<T> {
    handled: boolean; // Whether the line was part of a cardlink block
    result?: T; // Optional result from processing the cardlink
}

/**
 * Handles feature image discovery within markdown files.
 */
export class FeatureScanner {
    private settings: FeaturedImageSettings;
    private combinedLineRegex: RegExp;
    private combinedLineGlobalRegex: RegExp;
    private autoCardImageRegex: RegExp;
    private codeBlockStartRegex: RegExp;

    constructor(
        private readonly app: App,
        settings: FeaturedImageSettings,
        private readonly deps: FeatureScannerDeps
    ) {
        this.settings = settings;
        this.compileRegexPatterns();
    }

    /**
     * Updates scanner configuration when plugin settings change.
     * @param {FeaturedImageSettings} settings - Latest plugin settings.
     */
    setSettings(settings: FeaturedImageSettings): void {
        this.settings = settings;
        this.compileRegexPatterns();
    }

    /**
     * Retrieves structured frontmatter image information for the specified property.
     * @param {TFile} file - The file to inspect.
     * @param {string} property - The frontmatter property name.
     * @returns {FrontmatterImageInfo | undefined} Parsed frontmatter information.
     */
    getFrontmatterImageInfo(file: TFile, property: string): FrontmatterImageInfo | undefined {
        const cache = this.app.metadataCache.getFileCache(file);
        const value = cache?.frontmatter?.[property];
        return this.parseFrontmatterImage(value, file);
    }

    /**
     * Checks whether the stored frontmatter entry matches the provided path.
     * @param {FrontmatterImageInfo | undefined} info - Parsed frontmatter information.
     * @param {string | undefined} candidate - The candidate path to compare.
     * @returns {boolean} True when the paths are equivalent.
     */
    isFrontmatterPathEqual(info: FrontmatterImageInfo | undefined, candidate: string | undefined): boolean {
        if (!info?.rawValue || !candidate) {
            return false;
        }

        if (isValidHttpsUrl(candidate)) {
            return info.resolvedPath === candidate;
        }

        const normalizedCandidate = normalizePath(candidate);
        const normalizedStored = info.isResolved ? info.resolvedPath : normalizePath(info.rawPath);

        return normalizedStored === normalizedCandidate;
    }

    /**
     * Finds the featured image in the document content.
     * @param {string} content - The document content to search.
     * @param {TFile} contextFile - The file currently being processed.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {Promise<string | undefined>} The found featured image, if any.
     */
    async getFeatureFromDocument(content: string, contextFile: TFile, currentFeature: string | undefined): Promise<string | undefined> {
        // Remove frontmatter section from processing
        let contentWithoutFrontmatter = content;
        if (content.startsWith('---\n')) {
            const frontmatterEnd = content.indexOf('\n---\n', 4);
            if (frontmatterEnd !== -1) {
                contentWithoutFrontmatter = content.substring(frontmatterEnd + 5);
            }
        }

        const lines = contentWithoutFrontmatter.split('\n');
        const cardLinkProcessor = this.createCardLinkProcessor<string | undefined>(imagePath =>
            this.processAutoCardLinkImage(imagePath, contextFile)
        );

        for (const line of lines) {
            const cardLinkState = await cardLinkProcessor.consume(line);
            if (cardLinkState.result !== undefined) {
                return cardLinkState.result;
            }
            if (cardLinkState.handled) {
                continue;
            }

            // Check for other images (local or external)
            const match = this.combinedLineRegex.exec(line);

            if (match) {
                // Check for YouTube links, e.g. ![Movie title](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
                if (match.groups?.youtube) {
                    const videoId = this.getVideoId(match.groups.youtube);
                    if (videoId) {
                        const youtubeFeature = await this.deps.downloadYoutubeThumbnail(videoId, currentFeature);
                        if (youtubeFeature) {
                            return youtubeFeature;
                        }
                    }
                    continue;
                }

                // Check for local wiki image links, e.g. ![[image.jpg]]
                if (match.groups?.wikiImage) {
                    const wikiImage = this.safeDecodeLinkComponent(match.groups.wikiImage);
                    const resolvedWikiImage = resolveLocalImagePath(this.app, wikiImage, contextFile);
                    if (resolvedWikiImage) {
                        return resolvedWikiImage;
                    }
                    this.deps.errorLog(`Local image not found for featured image: ${wikiImage} (referenced in ${contextFile.path})`);
                    continue;
                }

                // Check for markdown image links, e.g. ![image.jpg](https://example.com/image.jpg)
                if (match.groups?.mdImage) {
                    const decodedMdImage = this.safeDecodeLinkComponent(match.groups.mdImage);
                    const sanitizedMdImage = this.stripMarkdownImageTitle(decodedMdImage);
                    const trimmedMdImage = sanitizedMdImage.trim();
                    if (this.isHttpUrl(trimmedMdImage)) {
                        this.logHttpImageWarning(contextFile.path, trimmedMdImage);
                        continue;
                    }
                    if (isValidHttpsUrl(trimmedMdImage)) {
                        const externalFeature = await this.deps.downloadExternalImage(trimmedMdImage);
                        if (externalFeature) {
                            return externalFeature;
                        }
                        continue;
                    }
                    const resolvedMdImage = resolveLocalImagePath(this.app, trimmedMdImage, contextFile);
                    if (resolvedMdImage) {
                        return resolvedMdImage;
                    }
                    this.deps.errorLog(`Local image not found for featured image: ${trimmedMdImage} (referenced in ${contextFile.path})`);
                    continue;
                }
            }
        }

        if (this.settings.preserveTemplateImages && currentFeature) {
            this.deps.debugLog('No new image found, preserving existing featured image:', currentFeature);
            return currentFeature;
        }

        return undefined;
    }

    /**
     * Parses feature references from a file and adds them to the used files set.
     * @param {TFile} file - The file to process.
     * @param {Set<string>} usedFiles - Set to store referenced file paths.
     */
    async collectFileReferences(file: TFile, usedFiles: Set<string>): Promise<void> {
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter) {
                const feature = cache.frontmatter[this.settings.frontmatterProperty];
                if (feature) {
                    this.addNormalizedPath(feature, usedFiles, file);
                }

                if (this.settings.createResizedThumbnail) {
                    const thumbnail = cache.frontmatter[this.settings.resizedFrontmatterProperty];
                    if (thumbnail) {
                        this.addNormalizedPath(thumbnail, usedFiles, file);
                    }
                }
            }

            const content = await this.app.vault.cachedRead(file);
            const lines = content.split('\n');

            const cardLinkProcessor = this.createCardLinkProcessor<void>(imagePath => {
                const localPath = this.extractAutoCardLinkLocalPath(imagePath);
                if (localPath) {
                    this.addNormalizedPath(localPath, usedFiles, file);
                }
                return undefined;
            });

            for (const line of lines) {
                const cardLinkState = await cardLinkProcessor.consume(line);
                if (cardLinkState.handled) {
                    continue;
                }

                this.combinedLineGlobalRegex.lastIndex = 0;
                let match: RegExpExecArray | null;
                while ((match = this.combinedLineGlobalRegex.exec(line)) !== null) {
                    if (match.groups?.wikiImage) {
                        this.addNormalizedPath(match.groups.wikiImage, usedFiles, file);
                    }

                    if (match.groups?.mdImage) {
                        const decodedMdImage = this.safeDecodeLinkComponent(match.groups.mdImage);
                        const sanitizedMdImage = this.stripMarkdownImageTitle(decodedMdImage);
                        const trimmedMdImage = sanitizedMdImage.trim();
                        if (this.isHttpUrl(trimmedMdImage)) {
                            this.logHttpImageWarning(file.path, trimmedMdImage);
                            continue;
                        }
                        if (!isValidHttpsUrl(trimmedMdImage)) {
                            this.addNormalizedPath(trimmedMdImage, usedFiles, file);
                        }
                    }
                }
            }
        } catch (error) {
            this.deps.errorLog(`Error processing references in ${file.path}:`, error);
        }
    }

    /**
     * Parses a frontmatter image value and resolves it when possible.
     * @param {unknown} value - The raw frontmatter value.
     * @param {TFile} contextFile - The file containing the frontmatter.
     * @returns {FrontmatterImageInfo | undefined} Parsed frontmatter information.
     */
    private parseFrontmatterImage(value: unknown, contextFile: TFile): FrontmatterImageInfo | undefined {
        if (typeof value !== 'string') {
            return undefined;
        }

        const rawValue = value.trim();
        if (!rawValue) {
            return undefined;
        }

        const embedMatch = rawValue.match(/!?\[\[(.*?)\]\]/);
        let rawPath = rawValue;
        if (embedMatch) {
            rawPath = embedMatch[1];
        }

        rawPath = rawPath.split('|')[0].split('#')[0].trim();

        let resolvedPath = rawPath;
        let isResolved = false;

        if (rawPath) {
            if (this.isHttpUrl(rawPath)) {
                this.logHttpImageWarning(contextFile.path, rawPath);
                return {
                    rawValue,
                    rawPath,
                    resolvedPath: rawPath,
                    isResolved: false
                };
            }
            if (isValidHttpsUrl(rawPath)) {
                isResolved = true;
                resolvedPath = rawPath;
            } else {
                const resolved = resolveLocalImagePath(this.app, rawPath, contextFile);
                if (resolved) {
                    resolvedPath = normalizePath(resolved);
                    isResolved = true;
                } else {
                    resolvedPath = normalizePath(rawPath);
                }
            }
        }

        return {
            rawValue,
            rawPath,
            resolvedPath,
            isResolved
        };
    }

    /**
     * Processes an Auto Card Link image reference.
     * @param {string} imagePath - The image path from the Auto Card Link.
     * @param {TFile} contextFile - The file referencing the image.
     * @returns {Promise<string | undefined>} The processed image path.
     */
    private async processAutoCardLinkImage(imagePath: string, contextFile: TFile): Promise<string | undefined> {
        imagePath = imagePath.trim();

        const localPath = this.extractAutoCardLinkLocalPath(imagePath);
        if (localPath) {
            const resolvedLocalPath = resolveLocalImagePath(this.app, localPath, contextFile);
            if (!resolvedLocalPath) {
                this.deps.errorLog(`Local Auto Card Link image not found: ${localPath} (referenced in ${contextFile.path})`);
                return undefined;
            }
            return resolvedLocalPath;
        }

        const normalizedImagePath = imagePath.trim();
        if (this.isHttpUrl(normalizedImagePath)) {
            this.logHttpImageWarning(contextFile.path, normalizedImagePath, 'Auto Card Link');
            return undefined;
        }

        if (!isValidHttpsUrl(normalizedImagePath)) {
            this.deps.errorLog('Invalid Auto Card Link URL:', normalizedImagePath);
            return undefined;
        }

        return await this.deps.downloadExternalImage(normalizedImagePath, 'autocardlink');
    }

    /**
     * Extracts the local target path from an Auto Card Link image entry.
     * @param {string} imagePath - Raw image path value from code block.
     * @returns {string | undefined} Sanitized local path when present.
     */
    private extractAutoCardLinkLocalPath(imagePath: string): string | undefined {
        if (!(imagePath.startsWith('"') && imagePath.endsWith('"'))) {
            return undefined;
        }

        let localPath = imagePath.slice(1, -1).trim();
        localPath = localPath.replace(/^\[\[|\]\]$/g, '');
        return localPath;
    }

    /**
     * Adds a normalized path to the used files set.
     * @param {string} path - The path to add.
     * @param {Set<string>} usedFiles - Set to store referenced file paths.
     * @param {TFile} contextFile - File used for relative resolution.
     */
    private addNormalizedPath(path: string, usedFiles: Set<string>, contextFile: TFile): void {
        let normalizedPath = path;
        const match = path.match(/!?\[\[(.*?)\]\]/);
        if (match) {
            normalizedPath = match[1];
        }

        normalizedPath = normalizedPath.split('|')[0].split('#')[0];

        const resolvedPath = resolveLocalImagePath(this.app, normalizedPath, contextFile);
        if (resolvedPath) {
            usedFiles.add(normalizePath(resolvedPath));
            return;
        }

        usedFiles.add(normalizePath(normalizedPath));
    }

    /**
     * Compiles the regular expressions used for feature detection.
     */
    private compileRegexPatterns(): void {
        const imageExtensionsPattern = SUPPORTED_IMAGE_EXTENSIONS.join('|');

        const wikiImagePattern = `!\\[\\[(?<wikiImage>[^\\]|#]+\\.(${imageExtensionsPattern}))(?:[#|][^\\]]*)?\\]\\]`;
        const mdImagePattern = `!\\[.*?\\]\\((?<mdImage>(?:https?:\\/\\/(?:[^)(]|\\([^)(]*\\))+|[^)(]+\\.(${imageExtensionsPattern})))\\)`;
        const youtubePattern = `${
            this.settings.requireExclamationForYouTube ? '!' : '!?'
        }\\[.*?\\]\\((?<youtube>https?:\\/\\/(?:www\\.)?(?:youtube\\.com|youtu\\.be)\\/\\S+)\\)`;

        const combinedRegexString = [youtubePattern, wikiImagePattern, mdImagePattern].join('|');

        this.combinedLineRegex = new RegExp(combinedRegexString, 'i');
        this.combinedLineGlobalRegex = new RegExp(combinedRegexString, 'gi');
        this.autoCardImageRegex = /image:\s*(?<autoCardImage>.+?)(?:\n|$)/i;
        this.codeBlockStartRegex = /^[\s]*```[\s]*(\w+)?[\s]*$/;
    }

    /**
     * Attempts to decode a link component while tolerating invalid percent sequences.
     * @param {string} value - Raw captured value.
     * @returns {string} Decoded value or the original string when decoding fails.
     */
    private safeDecodeLinkComponent(value: string): string {
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }

    /**
     * Checks whether a URL uses the HTTP protocol.
     * @param {string} url - URL to inspect.
     * @returns {boolean} True when the URL starts with http:// (case-insensitive).
     */
    private isHttpUrl(url: string): boolean {
        return url.trim().toLowerCase().startsWith('http://');
    }

    /**
     * Logs a warning about ignored HTTP image links.
     * @param {string} filePath - File path where the link was found.
     * @param {string} url - URL that was ignored.
     * @param {string | undefined} source - Optional source descriptor for contextual messaging.
     */
    private logHttpImageWarning(filePath: string, url: string, source?: string): void {
        this.deps.errorLog(strings.errors.httpImageLinkIgnored(filePath, url, source));
    }

    /**
     * Removes a trailing Markdown title/caption from an image target.
     * @param {string} value - Raw target string captured from Markdown.
     * @returns {string} Target value without the optional title segment.
     */
    private stripMarkdownImageTitle(value: string): string {
        const trimmedValue = value.trim();
        if (!trimmedValue) {
            return trimmedValue;
        }

        const titlePattern = /\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^)\\]|\\.)*\))\s*$/;
        const match = titlePattern.exec(trimmedValue);
        if (!match) {
            return trimmedValue;
        }

        const candidate = trimmedValue.slice(0, match.index).trimEnd();
        return candidate || trimmedValue;
    }

    /**
     * Extracts the YouTube video ID from a URL.
     * @param {string} url - The YouTube URL.
     * @returns {string | null} The video ID, if found.
     */
    private getVideoId(url: string): string | null {
        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname.toLowerCase();
            const pathname = parsedUrl.pathname;
            const searchParams = parsedUrl.searchParams;

            const normalizedHostname = hostname.replace('m.youtube.com', 'youtube.com');

            if (hostname.includes('youtu.be')) {
                return pathname.slice(1);
            }

            if (normalizedHostname.includes('youtube.com')) {
                if (pathname === '/watch') {
                    return searchParams.get('v');
                }

                if (pathname.startsWith('/embed/') || pathname.startsWith('/v/') || pathname.startsWith('/shorts/')) {
                    return pathname.split('/')[2];
                }

                if (pathname === '/playlist') {
                    return searchParams.get('v');
                }
            }
            return null;
        } catch {
            this.deps.errorLog('Invalid YouTube URL:', url);
            return null;
        }
    }

    /**
     * Creates a stateful processor for handling Auto Card Link code blocks.
     * @param {Function} handler - Function to process extracted image paths.
     * @returns {Object} Processor with consume method for line-by-line processing.
     */
    private createCardLinkProcessor<T>(handler: (imagePath: string) => Promise<T | undefined> | T | undefined): {
        consume: (line: string) => Promise<CardLinkProcessResult<T>>;
    } {
        let inCodeBlock = false;
        let codeBlockLanguage = '';
        let codeBlockBuffer = '';

        return {
            consume: async (line: string): Promise<CardLinkProcessResult<T>> => {
                const codeBlockMatch = this.codeBlockStartRegex.exec(line);
                if (codeBlockMatch) {
                    if (!inCodeBlock) {
                        inCodeBlock = true;
                        codeBlockLanguage = (codeBlockMatch[1] || '').toLowerCase();
                        codeBlockBuffer = '';
                        return { handled: true };
                    }

                    if (codeBlockLanguage === 'cardlink') {
                        const imageMatch = this.autoCardImageRegex.exec(codeBlockBuffer);
                        const imagePath = imageMatch?.groups?.autoCardImage?.trim();
                        inCodeBlock = false;
                        codeBlockLanguage = '';
                        codeBlockBuffer = '';

                        if (imagePath) {
                            const result = await handler(imagePath);
                            if (result !== undefined) {
                                return { handled: true, result };
                            }
                        }
                        return { handled: true };
                    }

                    inCodeBlock = false;
                    codeBlockLanguage = '';
                    codeBlockBuffer = '';
                    return { handled: true };
                }

                if (inCodeBlock && codeBlockLanguage === 'cardlink') {
                    codeBlockBuffer += `${line}\n`;
                    return { handled: true };
                }

                return { handled: false };
            }
        };
    }
}
