// Obsidian imports
import { normalizePath, Plugin, Notice, TAbstractFile, TFile, requestUrl, RequestUrlResponse } from 'obsidian';

// Styles
import '../styles.css';

// Internal imports
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab, SUPPORTED_IMAGE_EXTENSIONS } from './settings';
import { ConfirmationModal } from './modals';
import { strings } from './i18n';
import { FeatureScanner } from './features/feature-scanner';
import { ThumbnailService } from './thumbnails/thumbnail-service';
import { ImageMaintenanceService } from './features/image-maintenance';

// Utilities
import type { Logger } from './utils/logging';
import { applyMediaProperty } from './utils/frontmatter';
import { md5 } from './utils/hash';
import { createDebugLogger, createErrorLogger } from './utils/logging';
import { restoreMtimeWithOffset } from './utils/mtime';
import { isTFile as isTFileGuard } from './utils/obsidian';
import { isValidHttpsUrl } from './utils/urls';

/**
 * FeaturedImage plugin for Obsidian.
 * This plugin automatically sets featured images for markdown files based on their content.
 */
export default class FeaturedImage extends Plugin {
    settings: FeaturedImageSettings;
    private isRunningBulkUpdate: boolean = false;
    private updatingFiles: Set<string> = new Set();
    private debugLogger: Logger = createDebugLogger(false);
    private errorLogger: Logger = createErrorLogger();

    private featureScanner: FeatureScanner;
    private thumbnailService: ThumbnailService;
    private imageMaintenance: ImageMaintenanceService;

    // Placeholder image data for failed downloads (1x1 transparent PNG)
    // prettier-ignore
    private static readonly FAILED_IMAGE_DATA = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d,                         // IHDR chunk length
        0x49, 0x48, 0x44, 0x52,                         // "IHDR"
        0x00, 0x00, 0x00, 0x01,                         // width: 1
        0x00, 0x00, 0x00, 0x01,                         // height: 1
        0x08, 0x06, 0x00, 0x00, 0x00,                   // bit depth, color type, compression, filter, interlace
        0x1f, 0x15, 0xc4, 0x89,                         // IHDR CRC
        0x00, 0x00, 0x00, 0x0a,                         // IDAT chunk length
        0x49, 0x44, 0x41, 0x54,                         // "IDAT"
        0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // compressed data
        0xe5, 0x27, 0xde, 0xfc,                         // IDAT CRC
        0x00, 0x00, 0x00, 0x00,                         // IEND chunk length
        0x49, 0x45, 0x4e, 0x44,                         // "IEND"
        0xae, 0x42, 0x60, 0x82                          // IEND CRC
    ]);

    /**
     * Loads the plugin, initializes settings, and sets up event listeners.
     */
    async onload() {
        await this.loadSettings();
        this.debugLog('Plugin loaded, debug mode:', this.settings.debugMode, 'dry run:', this.settings.dryRun);

        this.thumbnailService = new ThumbnailService(this.app, this.settings, {
            debugLog: this.debugLog.bind(this),
            errorLog: this.errorLog.bind(this)
        });

        this.featureScanner = new FeatureScanner(this.app, this.settings, {
            downloadExternalImage: this.downloadExternalImage.bind(this),
            downloadYoutubeThumbnail: this.downloadThumbnail.bind(this),
            debugLog: this.debugLog.bind(this),
            errorLog: this.errorLog.bind(this)
        });

        this.imageMaintenance = new ImageMaintenanceService(this.app, this.settings, {
            featureScanner: this.featureScanner,
            thumbnailService: this.thumbnailService,
            debugLog: this.debugLog.bind(this),
            errorLog: this.errorLog.bind(this),
            trashFileAtPath: this.trashFileAtPath.bind(this)
        });

        // Add command for updating all featured images
        this.addCommand({
            id: 'update-all',
            name:
                this.settings.createResizedThumbnail && this.settings.resizedFrontmatterProperty
                    ? strings.commands.updateAll
                    : strings.commands.updateAllNoThumbnail,
            callback: () => this.updateAllFeaturedImages()
        });

        // Add command for updating all featured images in current folder
        this.addCommand({
            id: 'update-folder',
            name:
                this.settings.createResizedThumbnail && this.settings.resizedFrontmatterProperty
                    ? strings.commands.updateFolder
                    : strings.commands.updateFolderNoThumbnail,
            callback: () => this.updateFolderFeaturedImages()
        });

        // Add command for removing all featured images
        this.addCommand({
            id: 'remove-all',
            name:
                this.settings.createResizedThumbnail && this.settings.resizedFrontmatterProperty
                    ? strings.commands.removeAll
                    : strings.commands.removeAllNoThumbnail,
            callback: () => this.removeAllFeaturedImages()
        });

        // Add command for cleaning up unused images
        this.addCommand({
            id: 'cleanup-unused',
            name: strings.commands.cleanupUnused,
            callback: () => this.cleanupUnusedImages()
        });

        // Add command for re-rendering all resized thumbnails
        this.addCommand({
            id: 'rerender-thumbnails',
            name: strings.commands.rerenderThumbnails,
            callback: () => this.rerenderAllResizedThumbnails()
        });

        // Watch for metadata changes and update the featured image if the file is a markdown file
        this.registerEvent(
            this.app.metadataCache.on('changed', file => {
                if (file instanceof TFile && file.extension === 'md' && !this.updatingFiles.has(file.path) && !this.isRunningBulkUpdate) {
                    this.setFeaturedImage(file);
                }
            })
        );

        this.addSettingTab(new FeaturedImageSettingsTab(this.app, this));
    }

    /**
     * Logs debug messages if debug mode is enabled.
     * @param {...any} args - The arguments to log.
     */
    private debugLog(...args: unknown[]) {
        if (this.settings.debugMode) {
            this.debugLogger(...args);
        }
    }

    /**
     * Logs error messages.
     * @param {...any} args - The arguments to log.
     */
    private errorLog(...args: unknown[]) {
        this.errorLogger(...args);
    }

    /**
     * Type guard for TFile instances.
     * @param {TAbstractFile | null} file - The file to check.
     * @returns {file is TFile} True when the file is a TFile instance.
     */
    private isTFile(file: TAbstractFile | null): file is TFile {
        return isTFileGuard(file);
    }

    /**
     * Called when the plugin is being disabled.
     */
    onunload() {}

    /**
     * Loads the plugin settings.
     */
    async loadSettings() {
        this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
        this.debugLogger = createDebugLogger(this.settings.debugMode);
        if (this.featureScanner) {
            this.featureScanner.setSettings(this.settings);
        }
        if (this.thumbnailService) {
            this.thumbnailService.setSettings(this.settings);
        }
        if (this.imageMaintenance) {
            this.imageMaintenance.setSettings(this.settings);
        }

        // Migration: Set initial mediaLinkFormat based on legacy useMediaLinks setting
        // The only time useMediaLinks is true and mediaLinkFormat is 'plain' is when the plugin was updated to the new format
        // TODO: Remove this code March 1, 2025
        if (this.settings.useMediaLinks && this.settings.mediaLinkFormat === 'plain') {
            this.settings.mediaLinkFormat = 'embed'; // Since the old version used embedded links
            await this.saveData(this.settings);
        }
    }

    /**
     * Saves the plugin settings.
     */
    async saveSettings() {
        await this.saveData(this.settings);
        this.debugLogger = createDebugLogger(this.settings.debugMode);
        if (this.featureScanner) {
            this.featureScanner.setSettings(this.settings);
        }
        if (this.thumbnailService) {
            this.thumbnailService.setSettings(this.settings);
        }
        if (this.imageMaintenance) {
            this.imageMaintenance.setSettings(this.settings);
        }
    }

    /**
     * Sets the featured image for a given file.
     * @param {TFile} file - The file to process.
     * @returns {Promise<boolean>} True if the featured image was updated, false otherwise.
     */
    async setFeaturedImage(file: TFile): Promise<boolean> {
        if (!this.featureScanner) {
            this.errorLog('Feature scanner not initialized, skipping featured image update for', file.path);
            return false;
        }

        if (!this.thumbnailService) {
            this.errorLog('Thumbnail service not initialized, skipping featured image update for', file.path);
            return false;
        }

        // Extract detailed information about the current featured image from frontmatter
        const currentFeatureInfo = this.featureScanner.getFrontmatterImageInfo(file, this.settings.frontmatterProperty);
        const currentFeature = currentFeatureInfo?.resolvedPath;
        // Extract detailed information about the current thumbnail if thumbnails are enabled
        const currentThumbnailInfo = this.settings.createResizedThumbnail
            ? this.featureScanner.getFrontmatterImageInfo(file, this.settings.resizedFrontmatterProperty)
            : undefined;
        const currentThumbnail = currentThumbnailInfo?.resolvedPath;

        if (this.shouldSkipProcessing(file)) {
            return false;
        }

        const fileContent = await this.app.vault.cachedRead(file);
        const newFeature = await this.featureScanner.getFeatureFromDocument(fileContent, file, currentFeature);

        // Generate thumbnail if feature image has changed and thumbnails are enabled
        let newThumbnail = currentThumbnail;
        let oldThumbnailToDelete: string | undefined = undefined;

        if (newFeature && newFeature !== currentFeature && this.settings.createResizedThumbnail) {
            // Feature changed, create new thumbnail
            newThumbnail = await this.thumbnailService.createThumbnail(newFeature);
            this.debugLog(`THUMBNAIL GENERATED\n- File: ${file.path}\n- Original: ${newFeature}\n- Thumbnail: ${newThumbnail}`);

            // Mark old thumbnail for deletion if it's different from the new one
            if (currentThumbnail && currentThumbnail !== newThumbnail) {
                oldThumbnailToDelete = currentThumbnail;
            }
        } else if (!newFeature) {
            // Clear thumbnail if no feature image
            newThumbnail = undefined;
            // Mark current thumbnail for deletion
            if (currentThumbnail) {
                oldThumbnailToDelete = currentThumbnail;
            }
        }

        // Normalize local paths but keep URLs unchanged
        const finalNewFeature = newFeature && !this.isValidUrl(newFeature) ? normalizePath(newFeature) : newFeature;
        const finalNewThumbnail = newThumbnail && !this.isValidUrl(newThumbnail) ? normalizePath(newThumbnail) : newThumbnail;
        newThumbnail = finalNewThumbnail;

        // Determine if frontmatter needs updating by comparing paths semantically
        const featureChanged = finalNewFeature
            ? !this.featureScanner.isFrontmatterPathEqual(currentFeatureInfo, finalNewFeature)
            : Boolean(currentFeatureInfo?.rawValue);
        const thumbnailChanged = newThumbnail
            ? !this.featureScanner.isFrontmatterPathEqual(currentThumbnailInfo, newThumbnail)
            : Boolean(currentThumbnailInfo?.rawValue);

        if (featureChanged || thumbnailChanged) {
            await this.updateFrontmatter(file, finalNewFeature, newThumbnail);

            // Delete orphaned thumbnail after updating frontmatter
            if (oldThumbnailToDelete) {
                await this.thumbnailService.deleteOrphanedThumbnail(oldThumbnailToDelete, file);
            }

            this.debugLog(
                `FEATURE UPDATED\n- File: ${file.path}\n- Current feature: ${currentFeature}\n- New feature: ${finalNewFeature}\n- Thumbnail: ${newThumbnail}`
            );
            return true;
        }
        return false;
    }

    /**
     * Get the current featured image from the file's frontmatter.
     * @param {TFile} file - The file to check.
     * @returns {string | undefined} The current featured image, if any.
     */
    private getFeatureFromFrontmatter(file: TFile): string | undefined {
        if (!this.featureScanner) {
            return undefined;
        }

        const info = this.featureScanner.getFrontmatterImageInfo(file, this.settings.frontmatterProperty);
        return info?.resolvedPath;
    }

    /**
     * Get the current thumbnail from the file's frontmatter.
     * @param {TFile} file - The file to check.
     * @returns {string | undefined} The current thumbnail, if any.
     */
    private getThumbnailFromFrontmatter(file: TFile): string | undefined {
        if (!this.settings.createResizedThumbnail) {
            return undefined;
        }

        if (!this.featureScanner) {
            return undefined;
        }

        const info = this.featureScanner.getFrontmatterImageInfo(file, this.settings.resizedFrontmatterProperty);
        return info?.resolvedPath;
    }

    /**
     * Check if the file should be skipped for processing.
     * @param {TFile} file - The file to check.
     * @returns {boolean} True if the file should be skipped, false otherwise.
     */
    private shouldSkipProcessing(file: TFile): boolean {
        const cache = this.app.metadataCache.getFileCache(file);
        const tags = cache?.frontmatter?.tags ?? [];

        // Skip processing if the file has the 'excalidraw' tag
        if (tags.includes('excalidraw')) {
            return true;
        }

        const propertyExists = this.settings.frontmatterProperty in (cache?.frontmatter || {});
        const folderIsExcluded = this.settings.excludedFolders.some((folder: string) => file.path.startsWith(`${folder}/`));

        const shouldSkip = (this.settings.onlyUpdateExisting && !propertyExists) || folderIsExcluded;

        return shouldSkip;
    }

    /**
     * Downloads an external image and saves it locally.
     * @param {string} imageUrl - The URL of the image to download.
     * @param {string} subfolder - The subfolder to save the image in.
     * @returns {Promise<string | undefined>} The path to the downloaded image.
     */
    private async downloadExternalImage(imageUrl: string, subfolder: string = 'external'): Promise<string | undefined> {
        if (!this.settings.downloadExternalImages) {
            return undefined;
        }

        // Normalize folder path
        const downloadFolder = normalizePath(`${this.settings.thumbnailsFolder}/${subfolder}`);

        // Generate unique local filename from image URL
        const hashedFilename = this.generateHashedFilenameFromUrl(imageUrl);
        if (!hashedFilename) {
            this.errorLog('Failed to generate hashed filename for:', imageUrl);
            return undefined;
        }

        // Check if we already have a failed download marker for this URL
        const failedMarkerPath = `${downloadFolder}/${hashedFilename}.failed.png`;
        if (await this.app.vault.adapter.exists(failedMarkerPath)) {
            // Check if the failed marker is less than 12 hours old
            const stats = await this.app.vault.adapter.stat(failedMarkerPath);
            if (!stats) return undefined;
            const markerAge = Date.now() - stats.mtime;
            const twelveHours = 12 * 60 * 60 * 1000;

            // If the marker is more than 12 hours old, remove it and try again
            if (markerAge < twelveHours) {
                this.debugLog('Skipping recently failed download:', imageUrl);
                return failedMarkerPath;
            }
            this.debugLog('Retrying old failed download:', imageUrl);
            const removed = await this.trashFileAtPath(failedMarkerPath);
            if (!removed) {
                this.debugLog('Failed to remove old failed marker via trash:', failedMarkerPath);
            }
        }

        if (this.settings.dryRun) {
            this.debugLog('Dry run: Skipping image download, using mock path');
            return `${downloadFolder}/${hashedFilename}.jpg`;
        }

        try {
            // Create the download directory if it doesn't exist
            if (!(await this.app.vault.adapter.exists(downloadFolder))) {
                await this.app.vault.adapter.mkdir(downloadFolder);
            }

            // Check if the image already exists with any known extension
            const existingFilePath = await this.findExistingImageFile(downloadFolder, hashedFilename);
            if (existingFilePath) {
                return existingFilePath;
            }

            // Download the image
            const response = await requestUrl({
                url: imageUrl,
                method: 'GET'
            });

            // Determine the file extension from Content-Type
            const contentType = response.headers['content-type'];
            const extension = this.getExtensionFromContentType(contentType);
            if (!extension) {
                throw new Error(`Unknown Content-Type for image: ${contentType}`);
            }

            const downloadPath = `${downloadFolder}/${hashedFilename}.${extension}`;

            // Save the image
            await this.app.vault.adapter.writeBinary(downloadPath, response.arrayBuffer);
            return downloadPath;
        } catch (error) {
            this.errorLog('Failed to download image, error:', error);

            try {
                await this.app.vault.adapter.writeBinary(failedMarkerPath, FeaturedImage.FAILED_IMAGE_DATA.buffer);
                return failedMarkerPath;
            } catch (writeError) {
                this.errorLog('Failed to write placeholder image:', writeError);
                return undefined;
            }
        }
    }

    /**
     * Checks if an image file with the hashed filename and any known extension exists.
     * @param {string} folderPath - The folder to search in.
     * @param {string} hashedFilename - The hashed filename without extension.
     * @returns {Promise<string | undefined>} The path to the existing file, or undefined if not found.
     */
    private async findExistingImageFile(folderPath: string, hashedFilename: string): Promise<string | undefined> {
        for (const ext of SUPPORTED_IMAGE_EXTENSIONS) {
            const filePath = `${folderPath}/${hashedFilename}.${ext}`;
            if (await this.app.vault.adapter.exists(filePath)) {
                return filePath;
            }
        }
        return undefined;
    }

    /**
     * Moves a file to the Obsidian trash if it exists.
     * @param {string} filePath - Path of the file to trash.
     * @returns {Promise<boolean>} True when the file was trashed.
     */
    private async trashFileAtPath(filePath: string): Promise<boolean> {
        const normalizedPath = normalizePath(filePath);
        const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
        if (!this.isTFile(abstractFile)) {
            this.debugLog('Attempted to trash non-file path:', normalizedPath);
            return false;
        }

        try {
            await this.app.fileManager.trashFile(abstractFile);
            return true;
        } catch (error) {
            this.errorLog(`Failed to trash file at ${normalizedPath}:`, error);
            return false;
        }
    }

    /**
     * Maps the Content-Type to a file extension.
     * @param {string} contentType - The Content-Type header value.
     * @returns {string | undefined} The file extension without the dot.
     */
    private getExtensionFromContentType(contentType: string): string | undefined {
        const mimeTypes: { [key: string]: string } = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/svg+xml': 'svg'
        };

        // Handle potential parameters in Content-Type (e.g., "image/jpeg; charset=utf-8")
        const mimeType = contentType.split(';')[0].trim().toLowerCase();

        return mimeTypes[mimeType];
    }

    /**
     * Check if the URL is valid and that the protocol is HTTPS.
     * @param {string} url - The URL to check.
     * @returns {boolean} True if the URL is valid, false otherwise.
     */
    private isValidUrl(url: string): boolean {
        return isValidHttpsUrl(url);
    }

    /**
     * Generates a hashed filename from a URL.
     * @param {string} url - The URL to hash.
     * @returns {string | undefined} The hashed filename.
     */
    private generateHashedFilenameFromUrl(url: string): string {
        return md5(url);
    }

    /**
     * Updates the frontmatter of a file with the new featured image and thumbnail.
     * @param {TFile} file - The file to update.
     * @param {string | undefined} newFeature - The new featured image.
     * @param {string | undefined} newThumbnail - The new thumbnail image.
     */
    private async updateFrontmatter(file: TFile, newFeature: string | undefined, newThumbnail: string | undefined = undefined) {
        if (!this.isRunningBulkUpdate) {
            this.updatingFiles.add(file.path);
        }

        try {
            if (this.settings.dryRun) {
                this.debugLog('Dry run: Skipping frontmatter update');
                if (!this.isRunningBulkUpdate && this.settings.showNotificationsOnUpdate) {
                    const message = newFeature
                        ? `Dry run: Would change featured image to: ${newFeature}`
                        : `Dry run: Would remove featured image`;
                    new Notice(message);
                }
            } else {
                await this.app.fileManager.processFrontMatter(file, frontmatter => {
                    applyMediaProperty(frontmatter, {
                        property: this.settings.frontmatterProperty,
                        value: newFeature,
                        format: this.settings.mediaLinkFormat,
                        keepEmpty: this.settings.keepEmptyProperty
                    });

                    if (this.settings.createResizedThumbnail) {
                        applyMediaProperty(frontmatter, {
                            property: this.settings.resizedFrontmatterProperty,
                            value: newThumbnail,
                            format: this.settings.mediaLinkFormat,
                            keepEmpty: this.settings.keepEmptyProperty
                        });
                    }
                });

                if (!this.isRunningBulkUpdate && this.settings.showNotificationsOnUpdate) {
                    const message = newFeature ? `Featured image set to ${newFeature}` : 'Featured image removed';
                    new Notice(message);
                }
            }
        } finally {
            if (!this.isRunningBulkUpdate) {
                setTimeout(() => {
                    this.updatingFiles.delete(file.path);
                }, 100); // Allow time for metadata cache to fully update
            }
        }
    }

    /**
     * Downloads a YouTube video thumbnail.
     * @param {string} videoId - The YouTube video ID.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {Promise<string | undefined>} The path to the downloaded thumbnail.
     */
    async downloadThumbnail(videoId: string, currentFeature: string | undefined): Promise<string | undefined> {
        if (!this.settings.downloadYoutubeThumbnails) {
            return undefined;
        }

        // Normalize YouTube folder path
        const youtubeFolder = normalizePath(`${this.settings.thumbnailsFolder}/youtube`);
        const expectedPath = `${youtubeFolder}/${videoId}`;

        // If we already have a feature set to the expected path, return it
        if (currentFeature && currentFeature.startsWith(expectedPath)) {
            return currentFeature;
        }

        // Create the YouTube thumbnail directory if it doesn't exist
        if (!(await this.app.vault.adapter.exists(youtubeFolder))) {
            await this.app.vault.adapter.mkdir(youtubeFolder);
        }

        // Reuse existing thumbnail if present
        for (const extension of ['webp', 'jpg']) {
            const existingPath = `${youtubeFolder}/${videoId}.${extension}`;
            if (await this.app.vault.adapter.exists(existingPath)) {
                return existingPath;
            }
        }

        if (this.settings.dryRun) {
            this.debugLog('Dry run: Skipping thumbnail download, using mock path');
            return `${youtubeFolder}/${videoId}.webp`; // Return a mock path
        }

        const candidates: { quality: string; extension: 'webp' | 'jpg' }[] = [
            { quality: 'maxresdefault.webp', extension: 'webp' },
            { quality: 'maxresdefault.jpg', extension: 'jpg' },
            { quality: 'sddefault.jpg', extension: 'jpg' },
            { quality: 'hqdefault.jpg', extension: 'jpg' },
            { quality: 'mqdefault.jpg', extension: 'jpg' },
            { quality: 'default.jpg', extension: 'jpg' }
        ];

        for (const candidate of candidates) {
            const targetPath = `${youtubeFolder}/${videoId}.${candidate.extension}`;
            try {
                const response = await this.fetchThumbnail(videoId, candidate.quality);
                if (response?.status === 200) {
                    await this.app.vault.adapter.writeBinary(targetPath, response.arrayBuffer);
                    if (candidate.extension !== 'webp') {
                        this.debugLog(`YouTube thumbnail fallback used ${candidate.quality} for video ${videoId}, saved as ${targetPath}`);
                    }
                    return targetPath;
                }
                this.debugLog(`YouTube thumbnail request returned status ${response?.status ?? 'unknown'} for ${candidate.quality}`);
            } catch (error) {
                this.debugLog(`Failed to download ${candidate.quality} thumbnail for ${videoId}:`, error);
            }
        }

        this.errorLog(`Thumbnail for video ${videoId} could not be downloaded`);
        return undefined;
    }

    /**
     * Fetches a YouTube thumbnail.
     * @param {string} videoId - The YouTube video ID.
     * @param {string} quality - The quality of the thumbnail to fetch.
     * @returns {Promise<RequestUrlResponse | undefined>} The response from the fetch request.
     * @throws {Error} If the URL is invalid or if the network request fails.
     */
    private async fetchThumbnail(videoId: string, quality: string): Promise<RequestUrlResponse | undefined> {
        const isWebp = quality.endsWith('.webp');
        const baseUrl = isWebp ? 'https://i.ytimg.com/vi_webp' : 'https://img.youtube.com/vi';
        const url = `${baseUrl}/${videoId}/${quality}`;
        if (!this.isValidUrl(url)) {
            throw new Error(`Invalid YouTube thumbnail URL: ${url}`);
        }
        return await requestUrl({
            url: url,
            method: 'GET',
            headers: { Accept: isWebp ? 'image/webp' : 'image/jpeg' }
        });
    }

    /**
     * Updates featured images for all markdown files in the vault.
     */
    async updateAllFeaturedImages() {
        const confirmation = await this.showConfirmationModal(
            'Update all featured images',
            'This will scan all markdown files in your vault and update or add featured images based on the first image, YouTube link, or Auto Card Link image found in each file. Proceed?'
        );
        if (!confirmation) return;

        const files = this.app.vault.getMarkdownFiles();
        await this.processFilesWithProgress(files, 'bulk update of featured images', 'updating featured images');
    }

    /**
     * Updates featured images for all markdown files in the current folder and subfolders.
     */
    async updateFolderFeaturedImages() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No file is currently active');
            return;
        }

        const currentFolder = activeFile.parent?.path || '/';

        const confirmation = await this.showConfirmationModal(
            'Update folder featured images',
            `This will scan all markdown files in "${currentFolder}" and its subfolders, and update or add featured images based on the first image, YouTube link, or Auto Card Link image found in each file. Proceed?`
        );
        if (!confirmation) return;

        const allFiles = this.app.vault.getMarkdownFiles();
        const folderFiles = allFiles.filter(file => {
            if (currentFolder === '/') {
                // For root folder, include all files
                return true;
            }
            return file.path.startsWith(`${currentFolder}/`);
        });

        await this.processFilesWithProgress(folderFiles, 'bulk update of featured images in folder', 'updating featured images');
    }

    /**
     * Process a list of files with progress notifications.
     * @param {TFile[]} files - The files to process.
     * @param {string} operationName - Name of the operation for notifications.
     * @param {string} progressText - Text to show in progress notifications.
     */
    private async processFilesWithProgress(files: TFile[], operationName: string, progressText: string) {
        this.isRunningBulkUpdate = true;
        const batchSize = 5;
        new Notice(`Starting ${this.settings.dryRun ? 'dry run of ' : ''}${operationName}...`);

        let updatedCount = 0;
        let errorCount = 0;
        const totalFiles = files.length;
        let lastNotificationTime = Date.now();

        try {
            for (let i = 0; i < files.length; i += batchSize) {
                const batch = files.slice(i, i + batchSize);
                const results = await Promise.all(
                    batch.map(async file => {
                        try {
                            // Store original mtime before modification
                            const originalMtime = file.stat.mtime;

                            // Process the file
                            const wasUpdated = await this.setFeaturedImage(file);

                            // If file was updated, gently restore mtime (original + 1.5s offset) to preserve ordering
                            if (wasUpdated) {
                                await restoreMtimeWithOffset(this.app, file, originalMtime, {
                                    dryRun: this.settings.dryRun,
                                    errorLog: this.errorLog.bind(this),
                                    context: 'Failed to adjust modification time during bulk update'
                                });
                            }

                            return {
                                success: true,
                                updated: wasUpdated
                            };
                        } catch (error) {
                            this.errorLog(`Error processing file ${file.path}:`, error);
                            return {
                                success: false,
                                updated: false
                            };
                        }
                    })
                );

                updatedCount += results.filter(result => result.success && result.updated).length;
                errorCount += results.filter(result => !result.success).length;

                // Show notification every 5 seconds
                const currentTime = Date.now();
                if (currentTime - lastNotificationTime >= 5000) {
                    let progressMessage = `Processed ${i + batch.length} of ${totalFiles} files. Updated ${updatedCount} featured images`;
                    if (errorCount > 0) {
                        progressMessage += `. Errors: ${errorCount}`;
                    }
                    new Notice(progressMessage);
                    lastNotificationTime = currentTime;
                }
            }
        } finally {
            setTimeout(() => {
                this.isRunningBulkUpdate = false;
                let completionMessage = `Finished ${this.settings.dryRun ? 'dry run of ' : ''}${progressText}. Updated: ${updatedCount} files`;
                if (errorCount > 0) {
                    completionMessage += `. Errors: ${errorCount}`;
                }
                new Notice(completionMessage);
            }, 100);
        }
    }

    /**
     * Removes featured images from all markdown files in the vault.
     */
    async removeAllFeaturedImages() {
        let modalMessage = `This will remove the "${this.settings.frontmatterProperty}" property from the frontmatter of all markdown files in your vault`;
        if (this.settings.createResizedThumbnail) {
            modalMessage += ` and the "${this.settings.resizedFrontmatterProperty}" property if present`;
        }
        modalMessage += `. Proceed?`;

        const confirmation = await this.showConfirmationModal('Remove all featured images', modalMessage);
        if (!confirmation) return;

        this.isRunningBulkUpdate = true;
        new Notice(`Starting ${this.settings.dryRun ? 'dry run of ' : ''}removal of featured images from all files...`);

        const files = this.app.vault.getMarkdownFiles();
        let removedCount = 0;

        for (const file of files) {
            const currentFeature = this.getFeatureFromFrontmatter(file);

            // Store original mtime before modification
            const originalMtime = file.stat.mtime;
            const wasRemoved = await this.removeFeaturedImage(file, currentFeature);

            // If file was modified, gently restore mtime (original + 1.5s offset) to preserve ordering
            if (wasRemoved) {
                await restoreMtimeWithOffset(this.app, file, originalMtime, {
                    dryRun: this.settings.dryRun,
                    errorLog: this.errorLog.bind(this),
                    context: 'Failed to adjust modification time during cleanup'
                });
            }

            if (wasRemoved) {
                removedCount++;
            }
        }

        setTimeout(() => {
            this.isRunningBulkUpdate = false;
            const completionMessage = `Finished ${this.settings.dryRun ? 'dry run of ' : ''}removing featured images from ${removedCount} files.`;
            new Notice(completionMessage);
        }, 100);
    }

    /**
     * Removes the featured image from a specific file.
     * @param {TFile} file - The file to remove the featured image from.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {Promise<boolean>} True if the featured image was removed, false otherwise.
     */
    async removeFeaturedImage(file: TFile, currentFeature: string | undefined): Promise<boolean> {
        if (!currentFeature) {
            return false; // No featured image to remove
        }

        // If preserveTemplateImages is enabled, don't remove the featured image
        if (this.settings.preserveTemplateImages) {
            this.debugLog('Preserving existing featured image:', currentFeature);
            return false;
        }

        // Get current thumbnail for removal
        const currentThumbnail = this.getThumbnailFromFrontmatter(file);

        this.debugLog('FEATURE REMOVED\n- File: ', file.path);
        await this.updateFrontmatter(file, undefined, undefined);

        // Delete orphaned thumbnail after removing from frontmatter
        if (currentThumbnail) {
            if (this.thumbnailService) {
                await this.thumbnailService.deleteOrphanedThumbnail(currentThumbnail, file);
            }
        }

        return true;
    }

    /**
     * Shows a confirmation modal to the user.
     * @param {string} title - The title of the modal.
     * @param {string} message - The message to display in the modal.
     * @param {boolean} showPreservationNote - Whether to show the file preservation note (default: true).
     * @returns {Promise<boolean>} True if the user confirms, false otherwise.
     */
    private async showConfirmationModal(title: string, message: string, showPreservationNote: boolean = true): Promise<boolean> {
        return new Promise(resolve => {
            new ConfirmationModal(
                this.app,
                title,
                message,
                result => {
                    resolve(result);
                },
                showPreservationNote
            ).open();
        });
    }

    /**
     * Cleans up unused downloaded images and thumbnails.
     */
    async cleanupUnusedImages() {
        if (!this.imageMaintenance) {
            this.errorLog('Image maintenance service not initialized.');
            return;
        }

        await this.imageMaintenance.cleanupUnusedImages(this.showConfirmationModal.bind(this));
    }

    /**
     * Re-renders all resized thumbnails based on current settings
     * This is useful when alignment or other resize settings are changed
     */
    async rerenderAllResizedThumbnails() {
        if (!this.imageMaintenance) {
            this.errorLog('Image maintenance service not initialized, unable to re-render thumbnails.');
            return;
        }

        await this.imageMaintenance.rerenderAllResizedThumbnails({
            confirm: this.showConfirmationModal.bind(this),
            startBulkUpdate: () => {
                this.isRunningBulkUpdate = true;
            },
            endBulkUpdate: () => {
                this.isRunningBulkUpdate = false;
            },
            getFeatureFromFrontmatter: this.getFeatureFromFrontmatter.bind(this),
            updateFrontmatter: this.updateFrontmatter.bind(this)
        });
    }
}
