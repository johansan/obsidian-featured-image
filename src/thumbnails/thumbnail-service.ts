import { App, TFile, normalizePath } from 'obsidian';
import { FeaturedImageSettings } from '../settings';
import { extractFrontmatterStringValues, extractWikiLinkTarget, stripLinkMetadata } from '../utils/frontmatter';
import { md5 } from '../utils/hash';
import { resolveLocalImagePath } from '../utils/obsidian';

interface ThumbnailServiceDeps {
    debugLog: (...args: unknown[]) => void;
    errorLog: (...args: unknown[]) => void;
}

/**
 * Handles creation and cleanup of resized thumbnails.
 */
export class ThumbnailService {
    private settings: FeaturedImageSettings;
    private canvas: HTMLCanvasElement | null;
    private bulkThumbnailReferenceOverrides: Map<string, string | undefined> | null = null;
    private pendingBulkThumbnailDeletions = new Set<string>();

    constructor(
        private readonly app: App,
        settings: FeaturedImageSettings,
        private readonly deps: ThumbnailServiceDeps
    ) {
        this.settings = settings;
        this.canvas = settings.createResizedThumbnail ? createEl('canvas') : null;
    }

    /**
     * Updates service configuration when settings change.
     * @param {FeaturedImageSettings} settings - Latest plugin settings.
     */
    setSettings(settings: FeaturedImageSettings): void {
        this.settings = settings;

        if (settings.createResizedThumbnail && !this.canvas) {
            this.canvas = createEl('canvas');
        } else if (!settings.createResizedThumbnail) {
            this.canvas = null;
        }
    }

    /**
     * Starts tracking thumbnail reference changes during a bulk update.
     */
    beginBulkReferenceTracking(): void {
        this.pendingBulkThumbnailDeletions.clear();

        if (this.settings.dryRun || !this.settings.createResizedThumbnail) {
            this.bulkThumbnailReferenceOverrides = null;
            return;
        }

        this.bulkThumbnailReferenceOverrides = new Map<string, string | undefined>();
    }

    /**
     * Records a file's final thumbnail reference during a bulk update.
     * @param {TFile} file - File whose thumbnail property changed.
     * @param {string | undefined} nextThumbnail - Thumbnail path after the update.
     */
    recordThumbnailReferenceChange(file: TFile, nextThumbnail: string | undefined): void {
        const overrides = this.bulkThumbnailReferenceOverrides;
        if (!overrides) {
            return;
        }

        overrides.set(file.path, this.normalizeThumbnailReference(nextThumbnail, file));
    }

    /**
     * Deletes queued thumbnails that have no references after a bulk update.
     */
    async endBulkReferenceTracking(): Promise<void> {
        const overrides = this.bulkThumbnailReferenceOverrides;
        const pendingDeletions = Array.from(this.pendingBulkThumbnailDeletions);

        this.bulkThumbnailReferenceOverrides = null;
        this.pendingBulkThumbnailDeletions.clear();

        if (!overrides || pendingDeletions.length === 0) {
            return;
        }

        const referencedThumbnails = new Set<string>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (overrides.has(file.path)) {
                const thumbnailPath = overrides.get(file.path);
                if (thumbnailPath) {
                    referencedThumbnails.add(thumbnailPath);
                }
                continue;
            }

            for (const thumbnailPath of this.getThumbnailReferences(file)) {
                referencedThumbnails.add(thumbnailPath);
            }
        }

        for (const thumbnailPath of pendingDeletions) {
            if (referencedThumbnails.has(thumbnailPath)) {
                continue;
            }

            try {
                if (await this.app.vault.adapter.exists(thumbnailPath)) {
                    await this.trashThumbnail(thumbnailPath);
                }
            } catch (error) {
                this.deps.errorLog('Failed to delete orphaned thumbnail:', thumbnailPath, error);
            }
        }
    }

    /**
     * Creates a resized thumbnail of an image.
     * @param {string} imagePath - Path to the original image.
     * @returns {Promise<string | undefined>} Path to the resized image or undefined if skipped.
     */
    async createThumbnail(imagePath: string): Promise<string | undefined> {
        if (!this.settings.createResizedThumbnail || (this.settings.maxResizedWidth === 0 && this.settings.maxResizedHeight === 0)) {
            return undefined;
        }

        // SVGs are vector-based; avoid rasterizing to canvas (can taint if external refs exist).
        // Reuse the original SVG path as the "thumbnail".
        if (imagePath.toLowerCase().endsWith('.svg')) {
            return imagePath;
        }

        try {
            const settingsHash = md5(
                `${this.settings.maxResizedWidth}_${this.settings.maxResizedHeight}_${this.settings.fillResizedDimensions}`
            ).substring(0, 8);
            const sourceHash = md5(imagePath);
            const hashedName = `${sourceHash}_${settingsHash}`;

            const resizedFolder = normalizePath(`${this.settings.thumbnailsFolder}/resized`);
            const thumbnailPath = `${resizedFolder}/${hashedName}.webp`;

            if (await this.app.vault.adapter.exists(thumbnailPath)) {
                this.deps.debugLog('Resized thumbnail already exists:', thumbnailPath);
                return thumbnailPath;
            }

            if (this.settings.dryRun) {
                this.deps.debugLog('Dry run: Skipping thumbnail creation, using mock path');
                return thumbnailPath;
            }

            if (!(await this.app.vault.adapter.exists(imagePath))) {
                this.deps.errorLog('Source image not found:', imagePath);
                return undefined;
            }

            if (!(await this.app.vault.adapter.exists(resizedFolder))) {
                await this.app.vault.adapter.mkdir(resizedFolder);
            }

            const imageBuffer = await this.app.vault.adapter.readBinary(imagePath);
            const blob = new Blob([imageBuffer]);
            const imageUrl = URL.createObjectURL(blob);

            try {
                const image = await this.loadImage(imageUrl);
                const sourceWidth = image.naturalWidth || image.width || 0;
                const sourceHeight = image.naturalHeight || image.height || 0;

                if (sourceWidth <= 0 || sourceHeight <= 0) {
                    this.deps.errorLog('Unable to determine source image dimensions:', imagePath);
                    return undefined;
                }

                const { width, height } = this.calculateThumbnailDimensions(
                    sourceWidth,
                    sourceHeight,
                    this.settings.maxResizedWidth,
                    this.settings.maxResizedHeight,
                    this.settings.fillResizedDimensions
                );

                const resizedImageData = await this.resizeImage(image, width, height, this.settings.fillResizedDimensions);

                await this.app.vault.adapter.writeBinary(thumbnailPath, resizedImageData);
                return thumbnailPath;
            } finally {
                URL.revokeObjectURL(imageUrl);
            }
        } catch (error) {
            this.deps.errorLog('Error creating thumbnail:', error);
            return undefined;
        }
    }

    /**
     * Deletes an orphaned thumbnail file if it's not used elsewhere.
     * @param {string} thumbnailPath - Path to the thumbnail to potentially delete.
     * @param {TFile} currentFile - File currently being updated.
     */
    async deleteOrphanedThumbnail(thumbnailPath: string, currentFile: TFile): Promise<void> {
        if (!thumbnailPath || this.settings.dryRun) return;

        const normalizedPath = normalizePath(thumbnailPath);
        const resizedFolder = normalizePath(`${this.settings.thumbnailsFolder}/resized`);
        if (!normalizedPath.startsWith(`${resizedFolder}/`)) {
            return;
        }

        if (this.bulkThumbnailReferenceOverrides) {
            this.pendingBulkThumbnailDeletions.add(normalizedPath);
            return;
        }

        if (!(await this.app.vault.adapter.exists(normalizedPath))) {
            return;
        }

        const isUsedElsewhere = await this.isThumbnailUsedElsewhere(normalizedPath, currentFile);
        if (!isUsedElsewhere) {
            await this.trashThumbnail(normalizedPath);
        }
    }

    /**
     * Loads an image from a URL.
     * @param {string} url - URL of the image to load.
     * @returns {Promise<HTMLImageElement>} Loaded image element.
     */
    private loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
            img.src = url;
        });
    }

    /**
     * Calculates the dimensions for the thumbnail based on max constraints and fill mode.
     * @param {number} srcWidth - Original image width.
     * @param {number} srcHeight - Original image height.
     * @param {number} maxWidth - Maximum thumbnail width constraint.
     * @param {number} maxHeight - Maximum thumbnail height constraint.
     * @param {boolean} fillMax - Whether to fill the max dimensions exactly.
     * @returns {{width: number, height: number}} Calculated thumbnail dimensions.
     */
    private calculateThumbnailDimensions(
        srcWidth: number,
        srcHeight: number,
        maxWidth: number,
        maxHeight: number,
        fillMax: boolean
    ): { width: number; height: number } {
        let width = srcWidth;
        let height = srcHeight;

        if (maxWidth === 0 && maxHeight === 0) {
            return { width, height };
        }

        if (fillMax && maxWidth > 0 && maxHeight > 0) {
            return { width: maxWidth, height: maxHeight };
        }

        const aspectRatio = srcWidth / srcHeight;

        if (maxWidth > 0 && maxHeight > 0) {
            if (srcWidth > maxWidth || srcHeight > maxHeight) {
                if (maxWidth / maxHeight > aspectRatio) {
                    height = maxHeight;
                    width = Math.round(height * aspectRatio);
                } else {
                    width = maxWidth;
                    height = Math.round(width / aspectRatio);
                }
            }
        } else if (maxWidth > 0) {
            if (srcWidth > maxWidth) {
                width = maxWidth;
                height = Math.round(width / aspectRatio);
            }
        } else if (maxHeight > 0) {
            if (srcHeight > maxHeight) {
                height = maxHeight;
                width = Math.round(height * aspectRatio);
            }
        }

        return { width, height };
    }

    /**
     * Resizes an image using the configured alignment settings.
     * @param {HTMLImageElement} img - Source image element.
     * @param {number} width - Target width for the resized image.
     * @param {number} height - Target height for the resized image.
     * @param {boolean} fillMax - Whether to crop and fill exact dimensions.
     * @returns {Promise<ArrayBuffer>} WebP image data as ArrayBuffer.
     */
    private async resizeImage(img: HTMLImageElement, width: number, height: number, fillMax: boolean): Promise<ArrayBuffer> {
        const canvas = this.ensureCanvas();
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('Failed to get 2D context for thumbnail resize');
        }

        canvas.width = width;
        canvas.height = height;

        let sourceX = 0;
        let sourceY = 0;
        const originalWidth = img.naturalWidth || img.width;
        const originalHeight = img.naturalHeight || img.height;
        let sourceWidth = originalWidth;
        let sourceHeight = originalHeight;

        if (fillMax && width > 0 && height > 0) {
            const aspectRatio = originalWidth / originalHeight;
            const targetRatio = width / height;

            if (aspectRatio > targetRatio) {
                sourceWidth = originalHeight * targetRatio;

                switch (this.settings.resizedHorizontalAlign) {
                    case 'left':
                        sourceX = 0;
                        break;
                    case 'right':
                        sourceX = originalWidth - sourceWidth;
                        break;
                    case 'center':
                    default:
                        sourceX = (originalWidth - sourceWidth) / 2;
                        break;
                }
            } else if (aspectRatio < targetRatio) {
                sourceHeight = originalWidth / targetRatio;

                switch (this.settings.resizedVerticalAlign) {
                    case 'top':
                        sourceY = 0;
                        break;
                    case 'bottom':
                        sourceY = originalHeight - sourceHeight;
                        break;
                    case 'center':
                    default:
                        sourceY = (originalHeight - sourceHeight) / 2;
                        break;
                }
            }
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);

        return new Promise((resolve, reject) => {
            canvas.toBlob(
                blob => {
                    if (!blob) {
                        reject(new Error('Failed to create blob from canvas'));
                        return;
                    }

                    const reader = new FileReader();
                    reader.onloadend = () => {
                        if (reader.result instanceof ArrayBuffer) {
                            resolve(reader.result);
                        } else {
                            reject(new Error('Failed to convert blob to array buffer'));
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(blob);
                },
                'image/webp',
                0.85
            );
        });
    }

    /**
     * Ensures a canvas element exists for image manipulation.
     * @returns {HTMLCanvasElement} Canvas element for image resizing.
     */
    private ensureCanvas(): HTMLCanvasElement {
        if (!this.canvas) {
            this.canvas = createEl('canvas');
        }
        return this.canvas;
    }

    private getThumbnailReferences(file: TFile): Set<string> {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter: Record<string, unknown> | undefined = cache?.frontmatter;
        const thumbnail = frontmatter?.[this.settings.resizedFrontmatterProperty];
        const references = new Set<string>();

        for (const candidate of extractFrontmatterStringValues(thumbnail)) {
            const normalizedReference = this.normalizeThumbnailReference(candidate, file);
            if (normalizedReference) {
                references.add(normalizedReference);
            }
        }

        return references;
    }

    private normalizeThumbnailReference(thumbnailPath: string | undefined, contextFile?: TFile): string | undefined {
        if (!thumbnailPath) {
            return undefined;
        }

        const wikiTarget = extractWikiLinkTarget(thumbnailPath);
        const path = stripLinkMetadata(wikiTarget ?? thumbnailPath);
        if (!path) {
            return undefined;
        }

        const resolvedPath = contextFile ? resolveLocalImagePath(this.app, path, contextFile) : undefined;
        return normalizePath(resolvedPath ?? path);
    }

    private async trashThumbnail(thumbnailPath: string): Promise<void> {
        const abstractFile = this.app.vault.getAbstractFileByPath(thumbnailPath);
        if (!(abstractFile instanceof TFile)) {
            this.deps.debugLog('Thumbnail not found when attempting to trash:', thumbnailPath);
            return;
        }

        try {
            await this.app.fileManager.trashFile(abstractFile);
            this.deps.debugLog('Deleted orphaned thumbnail:', thumbnailPath);
        } catch (error) {
            this.deps.errorLog('Failed to delete orphaned thumbnail:', thumbnailPath, error);
        }
    }

    /**
     * Checks if a thumbnail is referenced by any file other than the provided one.
     * @param {string} thumbnailPath - Path to the thumbnail to check.
     * @param {TFile} excludeFile - File to exclude from the check.
     * @returns {Promise<boolean>} True if the thumbnail is used elsewhere.
     */
    private async isThumbnailUsedElsewhere(thumbnailPath: string, excludeFile?: TFile): Promise<boolean> {
        if (!thumbnailPath) return false;

        const normalizedThumbnailPath = normalizePath(thumbnailPath);
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            if (excludeFile && file.path === excludeFile.path) continue;

            if (this.getThumbnailReferences(file).has(normalizedThumbnailPath)) {
                return true;
            }
        }
        return false;
    }
}
