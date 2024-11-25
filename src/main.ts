// Obsidian imports
import { normalizePath, Plugin, Notice, TFile, requestUrl, RequestUrlResponse, debounce, Debouncer } from 'obsidian';

// Styles
import '../styles.css';

// Internal imports
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab } from './settings'
import { ConfirmationModal } from './modals';

// External imports
import { createHash } from 'crypto';

/**
 * FeaturedImage plugin for Obsidian.
 * This plugin automatically sets featured images for markdown files based on their content.
 */
export default class FeaturedImage extends Plugin {
	settings: FeaturedImageSettings;
	private isRunningBulkUpdate: boolean = false;
    private updatingFiles: Set<string> = new Set();

    // Combined regex pattern
    private combinedLineRegex: RegExp;
    private autoCardImageRegex: RegExp;
    private codeBlockStartRegex: RegExp;

	/**
	 * Loads the plugin, initializes settings, and sets up event listeners.
	 */
	async onload() {
		await this.loadSettings();
		this.debugLog('Plugin loaded, debug mode:', this.settings.debugMode, 'dry run:', this.settings.dryRun);

        // Pre-compile regex patterns
        this.compileRegexPatterns();

		// Add command for updating all featured images
        this.addCommand({
            id: 'featured-image-update-all',
            name: 'Set featured images in all files',
            callback: () => this.updateAllFeaturedImages(),
        });

		// Add command for updating all featured images in current folder
		this.addCommand({
			id: 'featured-image-update-folder',
			name: 'Set featured images in current folder',
			callback: () => this.updateFolderFeaturedImages(),
		});

        // Add command for removing all featured images
        this.addCommand({
            id: 'featured-image-remove-all',
            name: 'Remove featured images in all files',
            callback: () => this.removeAllFeaturedImages(),
        });

		// Watch for metadata changes and update the featured image if the file is a markdown file
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (
                    file instanceof TFile &&
                    file.extension === 'md' &&
                    !this.updatingFiles.has(file.path) &&
                    !this.isRunningBulkUpdate
                ) {
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
	private debugLog(...args: any[]) {
		if (this.settings.debugMode) {
			const timestamp = new Date().toTimeString().split(' ')[0];
			console.log(`${timestamp}`, ...args);
		}
	}

    /**
     * Logs error messages.
     * @param {...any} args - The arguments to log.
     */
    private errorLog(...args: any[]) {
        const timestamp = new Date().toTimeString().split(' ')[0];
        console.error(`${timestamp}`, ...args);
    }

    /**
     * Called when the plugin is being disabled.
     */
    onunload() {
    }

    /**
     * Loads the plugin settings.
     */
	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

    /**
     * Saves the plugin settings.
     */
	async saveSettings() {
		await this.saveData(this.settings);
        // Recompile regex patterns
        this.compileRegexPatterns();
	}

    /**
     * Sets the featured image for a given file.
     * @param {TFile} file - The file to process.
     * @returns {Promise<boolean>} True if the featured image was updated, false otherwise.
     */
    async setFeaturedImage(file: TFile): Promise<boolean> {
        const currentFeature = this.getFeatureFromFrontmatter(file);

        if (this.shouldSkipProcessing(file, currentFeature)) {
            return false;
        }

        const fileContent = await this.app.vault.cachedRead(file);
        const newFeature = await this.getFeatureFromDocument(fileContent, currentFeature);

        if (currentFeature !== newFeature) {
            await this.updateFrontmatter(file, newFeature);
            this.debugLog(`FEATURE UPDATED\n- File: ${file.path}\n- Current feature: ${currentFeature}\n- New feature: ${newFeature}`);
            return true;
        } else {
            return false;
        }
    }

    /**
     * Get the current featured image from the file's frontmatter.
     * @param {TFile} file - The file to check.
     * @returns {string | undefined} The current featured image, if any.
     */
    private getFeatureFromFrontmatter(file: TFile): string | undefined {
        const cache = this.app.metadataCache.getFileCache(file);
        const feature = cache?.frontmatter?.[this.settings.frontmatterProperty];
        
        if (feature) {
            // Attempt to extract the image path from wiki-style link
            const match = feature.match(/!\[\[(.*?)\]\]/);
            if (match) {
                return match[1];
            } else {
                // Return the feature as-is if it's not a wiki-style link
                return feature;
            }
        }
        
        return undefined;
    }

    /**
     * Check if the file should be skipped for processing.
     * @param {TFile} file - The file to check.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {boolean} True if the file should be skipped, false otherwise.
     */
    private shouldSkipProcessing(file: TFile, currentFeature: string | undefined): boolean {
        const cache = this.app.metadataCache.getFileCache(file);
        const tags = cache?.frontmatter?.tags ?? [];

        // Skip processing if the file has the 'excalidraw' tag
        if (tags.includes('excalidraw')) {
            return true;
        }

        const shouldSkip = (
            (this.settings.onlyUpdateExisting && !currentFeature) ||
            this.settings.excludedFolders.some((folder: string) => file.path.startsWith(folder + '/'))
        );
        return shouldSkip;
    }

    /**
     * Compiles the regular expressions used in getFeatureFromDocument.
     */
    private compileRegexPatterns() {
        const imageExtensionsPattern = this.settings.imageExtensions.join('|');

        const wikiImagePattern = `!\\[\\[(?<wikiImage>[^\\]]+\\.(${imageExtensionsPattern}))(?:\\|[^\\]]*)?\\]\\]`;
        const mdImagePattern = `!\\[.*?\\]\\((?<mdImage>[^)]+\\.(${imageExtensionsPattern}))\\)`;
        const youtubePattern = `${this.settings.requireExclamationForYouTube ? '!' : '!?'}\\[.*?\\]\\((?<youtube>https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\\S+)\\)`;
    
        // Create individual patterns for line-by-line processing
        this.combinedLineRegex = new RegExp(`${wikiImagePattern}|${mdImagePattern}|${youtubePattern}`, 'i');
        this.autoCardImageRegex = /image:\s*(?<autoCardImage>.+?)(?:\n|$)/i;
        this.codeBlockStartRegex = /^[\s]*```[\s]*(\w+)?[\s]*$/;
    }

    /**
     * Finds the featured image in the document content.
     * @param {string} content - The document content to search.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {Promise<string | undefined>} The found featured image, if any.
     */
    private async getFeatureFromDocument(content: string, currentFeature: string | undefined): Promise<string | undefined> {
        // Remove frontmatter section from processing
        let contentWithoutFrontmatter = content;
        if (content.startsWith('---\n')) {
            const frontmatterEnd = content.indexOf('\n---\n', 4);
            if (frontmatterEnd !== -1) {
                contentWithoutFrontmatter = content.substring(frontmatterEnd + 5);
            }
        }

        const lines = contentWithoutFrontmatter.split('\n');
        let inCodeBlock = false;
        let codeBlockLanguage = '';
        let codeBlockBuffer = '';

        for (const line of lines) {
            const codeBlockMatch = this.codeBlockStartRegex.exec(line);
            if (codeBlockMatch) {
                if (!inCodeBlock) {
                    inCodeBlock = true;
                    codeBlockLanguage = (codeBlockMatch[1] || '').toLowerCase();
                    codeBlockBuffer = '';
                    continue;
                } else {
                    if (codeBlockLanguage === 'cardlink') {
                        const imageMatch = this.autoCardImageRegex.exec(codeBlockBuffer);
                        if (imageMatch?.groups?.autoCardImage) {
                            this.debugLog('Auto Card Link image found:', imageMatch.groups.autoCardImage);
                            return await this.processAutoCardLinkImage(imageMatch.groups.autoCardImage, currentFeature);
                        }
                    }
                    inCodeBlock = false;
                    codeBlockLanguage = '';
                    continue;
                }
            }

            if (inCodeBlock && codeBlockLanguage === 'cardlink') {
                codeBlockBuffer += line + '\n';
                continue;
            }

            // Process regular lines for images and YouTube links
            const match = this.combinedLineRegex.exec(line);
            if (match) {
                if (match.groups?.wikiImage) {
                    return decodeURIComponent(match.groups.wikiImage);
                }
                if (match.groups?.mdImage) {
                    return decodeURIComponent(match.groups.mdImage);
                }
                if (match.groups?.youtube) {
                    const videoId = this.getVideoId(match.groups.youtube);
                    if (videoId) {
                        return await this.downloadThumbnail(videoId, currentFeature);
                    }
                }
            }
        }
        
        return undefined;
    }

    /**
     * Processes an Auto Card Link image.
     * @param {string} imagePath - The image path from the Auto Card Link.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {Promise<string | undefined>} The processed image path.
     */
    private async processAutoCardLinkImage(imagePath: string, currentFeature: string | undefined): Promise<string | undefined> {
        imagePath = imagePath.trim();
    
        // Auto Card Link always embeds local images within quotes
        if (imagePath.startsWith('"') && imagePath.endsWith('"')) {
            // Remove quotes
            let localPath = imagePath.slice(1, -1).trim();
            // Remove [[ and ]] if present
            localPath = localPath.replace(/^\[\[|\]\]$/g, '');
            // Check if the file exists
            const fileExists = await this.app.vault.adapter.exists(localPath);
            if (!fileExists) {
                this.errorLog('Local image not found:', localPath);
                return undefined;
            }
            return localPath;
        }
    
        // Check if the image path is a valid URL
        if (!this.isValidUrl(imagePath)) {
            this.errorLog('Invalid Auto Card Link URL:', imagePath);
            return undefined;
        }
    
        // Generate unique local filename from image path (without extension)
        const hashedFilename = this.generateHashedFilenameFromUrl(imagePath);
        if (!hashedFilename) {
            this.errorLog('Failed to generate hashed filename for:', imagePath);
            return undefined;
        }
    
        // Prepare the Auto Card Link folder path
        const autoCardLinkFolder = normalizePath(`${this.settings.thumbnailDownloadFolder}/autocardlink`);
    
        if (this.settings.dryRun) {
            this.debugLog('Dry run: Skipping Auto Card Link image download, using mock path');
            // Assuming JPEG as default extension in dry run
            return `${autoCardLinkFolder}/${hashedFilename}.jpg`;
        }
    
        try {
            // Create the Auto Card Link directory if it doesn't exist
            if (!(await this.app.vault.adapter.exists(autoCardLinkFolder))) {
                await this.app.vault.adapter.mkdir(autoCardLinkFolder);
            }
    
            // Check if the image already exists with any known image extension
            const existingFilePath = await this.findExistingImageFile(autoCardLinkFolder, hashedFilename);
            if (existingFilePath) {
                this.debugLog('Auto Card Link image already exists, skipping download');
                return existingFilePath;
            }
    
            // Proceed to download the image
            const response = await requestUrl({
                url: imagePath,
                method: 'GET',
            });
    
            // Determine the file extension from Content-Type
            const contentType = response.headers['content-type'];
            const extension = this.getExtensionFromContentType(contentType);
            if (!extension) {
                this.errorLog('Unknown Content-Type for image:', contentType);
                return undefined;
            }
    
            const downloadPath = `${autoCardLinkFolder}/${hashedFilename}.${extension}`;
    
            // Save the image to the determined path
            await this.app.vault.adapter.writeBinary(downloadPath, response.arrayBuffer);
            return downloadPath;
        } catch (error) {
            this.errorLog('Failed to download Auto Card Link image, error:', error);
            return undefined;
        }
    }

    /**
     * Checks if an image file with the hashed filename and any known extension exists.
     * @param {string} folderPath - The folder to search in.
     * @param {string} hashedFilename - The hashed filename without extension.
     * @returns {Promise<string | undefined>} The path to the existing file, or undefined if not found.
     */
    private async findExistingImageFile(folderPath: string, hashedFilename: string): Promise<string | undefined> {
        const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']; // List of known image extensions

        for (const ext of extensions) {
            const filePath = `${folderPath}/${hashedFilename}.${ext}`;
            if (await this.app.vault.adapter.exists(filePath)) {
                return filePath;
            }
        }
        return undefined;
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
        try {
          const parsedUrl = new URL(url);
          return parsedUrl.protocol === 'https:';
        } catch (error) {
          return false;
        }
    }

    /**
     * Generates a hashed filename from a URL.
     * @param {string} url - The URL to hash.
     * @returns {string | undefined} The hashed filename.
     */
    private generateHashedFilenameFromUrl(url: string): string {
        const hash = createHash('md5').update(url).digest('hex');
        return hash;
    }

    /**
     * Updates the frontmatter of a file with the new featured image.
     * @param {TFile} file - The file to update.
     * @param {string | undefined} newFeature - The new featured image.
     */
    private async updateFrontmatter(file: TFile, newFeature: string | undefined) {
        if (!this.isRunningBulkUpdate) {
            this.updatingFiles.add(file.path);
        }
        
        try {
            if (this.settings.dryRun) {
                this.debugLog('Dry run: Skipping frontmatter update');
                if (!this.isRunningBulkUpdate && this.settings.showNotificationsOnUpdate) {
                    new Notice(newFeature ? `Dry run: Would change featured image to: ${newFeature}` : `Dry run: Would remove featured image`);
                }
            } else {
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    if (newFeature) {
                        // Convert to wiki link format if useMediaLinks is enabled
                        const featureValue = this.settings.useMediaLinks ? `![[${newFeature}]]` : newFeature;
                        frontmatter[this.settings.frontmatterProperty] = featureValue;
                    } else {
                        delete frontmatter[this.settings.frontmatterProperty];
                    }
                });

                if (!this.isRunningBulkUpdate && this.settings.showNotificationsOnUpdate) {
                    new Notice(newFeature ? `Featured image set to ${newFeature}` : 'Featured image removed');
                }
            }
        } finally {
            if (!this.isRunningBulkUpdate) {
                setTimeout(() => {
                    this.updatingFiles.delete(file.path);
                }, 100); // Just enough time for the cache to update
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
        // Normalize YouTube folder path
        const youtubeFolder = normalizePath(`${this.settings.thumbnailDownloadFolder}/youtube`);
        const expectedPath = `${youtubeFolder}/${videoId}`;
        
        // If we already have a feature set to the expected path, return it
        if (currentFeature && currentFeature.startsWith(expectedPath)) {
            return currentFeature;
        }
        
        // Create the YouTube thumbnail directory if it doesn't exist
        if (!(await this.app.vault.adapter.exists(youtubeFolder))) {
            await this.app.vault.adapter.mkdir(youtubeFolder);
        }

        // Check if WebP thumbnail already exists
        const webpFilename = `${videoId}.webp`;
        const webpFilePath = `${youtubeFolder}/${webpFilename}`;
        if (await this.app.vault.adapter.exists(webpFilePath)) {
            return webpFilePath;
        }

        // Check if JPG thumbnail already exists
        const jpgFilename = `${videoId}.jpg`;
        const jpgFilePath = `${youtubeFolder}/${jpgFilename}`;
        if (await this.app.vault.adapter.exists(jpgFilePath)) {
            return jpgFilePath;
        }

        if (this.settings.dryRun) {
            this.debugLog('Dry run: Skipping thumbnail download, using mock path');
            return `${youtubeFolder}/${videoId}.webp`; // Return a mock path
        }

        // Try to download the thumbnail in WebP format if enabled
        if (this.settings.downloadWebP) {
            try {
                const webpResponse = await this.fetchThumbnail(videoId, 'maxresdefault.webp');
                if (webpResponse?.status === 200) {
                    await this.app.vault.adapter.writeBinary(webpFilePath, webpResponse.arrayBuffer);
                    return webpFilePath;
                }
            } catch (error) {
                this.debugLog('Failed to download WebP thumbnail');
            }
        }

        // Fall back to JPG versions
        try {
            const maxResResponse = await this.fetchThumbnail(videoId, 'maxresdefault.jpg');
            if (maxResResponse?.status === 200) {
                await this.app.vault.adapter.writeBinary(jpgFilePath, maxResResponse.arrayBuffer);
                return jpgFilePath;
            }
        } catch (error) {
            this.debugLog('Failed to download maxresdefault.jpg');
        }

        try {
            const hqDefaultResponse = await this.fetchThumbnail(videoId, 'hqdefault.jpg');
            if (hqDefaultResponse?.status === 200) {
                await this.app.vault.adapter.writeBinary(jpgFilePath, hqDefaultResponse.arrayBuffer);
                return jpgFilePath;
            }
        } catch (error) {
            this.debugLog('Failed to download hqdefault.jpg:');
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
            throw new Error('Invalid YouTube thumbnail URL: ' + url);
        }
        return await requestUrl({
            url: url,
            method: 'GET',
            headers: { 'Accept': isWebp ? 'image/webp' : 'image/jpeg' }
        });
    }

    /**
     * Extracts the video ID from a YouTube URL.
     * @param {string} url - The YouTube URL.
     * @returns {string | null} The extracted video ID, or null if not found.
     */
    getVideoId(url: string): string | null {
        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname;
            const pathname = parsedUrl.pathname;
            const searchParams = parsedUrl.searchParams;
        
            // Handle mobile URLs by normalizing the hostname
            const normalizedHostname = hostname.replace('m.youtube.com', 'youtube.com');
        
            if (hostname.includes('youtu.be')) {
                // Short URLs: https://youtu.be/dQw4w9WgXcQ
                return pathname.slice(1);
            }
            
            if (normalizedHostname.includes('youtube.com')) {
                // Standard watch URLs: https://www.youtube.com/watch?v=dQw4w9WgXcQ
                // Mobile URLs: https://m.youtube.com/watch?v=dQw4w9WgXcQ
                if (pathname === '/watch') {
                    return searchParams.get('v');
                }
                
                // Embed URLs: https://www.youtube.com/embed/dQw4w9WgXcQ
                // Direct video URLs: https://www.youtube.com/v/dQw4w9WgXcQ
                // Shortened URLs: https://www.youtube.com/shorts/dQw4w9WgXcQ
                if (pathname.startsWith('/embed/') || 
                    pathname.startsWith('/v/') || 
                    pathname.startsWith('/shorts/')) {
                    return pathname.split('/')[2];
                }
                
                // Playlist with specific video: https://www.youtube.com/playlist?v=dQw4w9WgXcQ
                if (pathname === '/playlist') {
                    return searchParams.get('v');
                }
            }
            return null;
        } catch (error) {
            this.errorLog('Invalid YouTube URL:', url);
            return null;
        }
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
        await this.processFilesWithProgress(
            files,
            'bulk update of featured images',
            'updating featured images'
        );
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
            return file.path.startsWith(currentFolder + '/');
        });
    
        await this.processFilesWithProgress(
            folderFiles,
            'bulk update of featured images in folder',
            'updating featured images'
        );
    }

    /**
     * Process a list of files with progress notifications.
     * @param {TFile[]} files - The files to process.
     * @param {string} operationName - Name of the operation for notifications.
     * @param {string} progressText - Text to show in progress notifications.
     */
    private async processFilesWithProgress(
        files: TFile[],
        operationName: string,
        progressText: string
    ) {
        this.isRunningBulkUpdate = true;
        const batchSize = 5;
        new Notice(`Starting ${this.settings.dryRun ? 'dry run of ' : ''}${operationName}...`);

        let updatedCount = 0;
        let errorCount = 0;
        let totalFiles = files.length;
        let lastNotificationTime = Date.now();

        try {
            for (let i = 0; i < files.length; i += batchSize) {
                const batch = files.slice(i, i + batchSize);
                const results = await Promise.all(batch.map(async file => {
                    try {
                        // Store original mtime before modification
                        const originalMtime = file.stat.mtime;
                        const wasUpdated = await this.setFeaturedImage(file);
                        
                        // If file was updated and not in dry run mode, restore the original mtime
                        if (wasUpdated && !this.settings.dryRun) {
                            await this.app.vault.modify(file, await this.app.vault.read(file), {
                                mtime: originalMtime
                            });
                        }
                        return { success: true, updated: wasUpdated };
                    } catch (error) {
                        this.errorLog(`Error processing file ${file.path}:`, error);
                        return { success: false, updated: false };
                    }
                }));

                updatedCount += results.filter(result => result.success && result.updated).length;
                errorCount += results.filter(result => !result.success).length;

                // Show notification every 5 seconds
                const currentTime = Date.now();
                if (currentTime - lastNotificationTime >= 5000) {
                    const progressMessage = `Processed ${i + 1} of ${totalFiles} files. Updated ${updatedCount} featured images${errorCount > 0 ? `. Errors: ${errorCount}` : ''}`;
                    new Notice(progressMessage);
                    lastNotificationTime = currentTime;
                }
            }
        } finally {
            setTimeout(() => {
                this.isRunningBulkUpdate = false;
                const completionMessage = `Finished ${this.settings.dryRun ? 'dry run of ' : ''}${progressText}. Updated: ${updatedCount} files${errorCount > 0 ? `. Errors: ${errorCount}` : ''}`;
                new Notice(completionMessage);
            }, 100);
        }
    }

    /**
     * Removes featured images from all markdown files in the vault.
     */
    async removeAllFeaturedImages() {
        const confirmation = await this.showConfirmationModal(
            'Remove all featured images',
            `This will remove the "${this.settings.frontmatterProperty}" property from the frontmatter of all markdown files in your vault. Proceed?`
        );
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
            
            // If file was modified and not in dry run mode, restore the original mtime
            if (wasRemoved && !this.settings.dryRun) {
                await this.app.vault.modify(file, await this.app.vault.read(file), {
                    mtime: originalMtime
                });
            }
            
            if (wasRemoved) {
                removedCount++;
            }
        }

        setTimeout(() => {
            this.isRunningBulkUpdate = false;
            new Notice(`Finished ${this.settings.dryRun ? 'dry run of ' : ''}removing featured images from ${removedCount} files.`);
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

        this.debugLog('FEATURE REMOVED\n- File: ', file.path);
        await this.updateFrontmatter(file, undefined);
        return true;
    }

    /**
     * Shows a confirmation modal to the user.
     * @param {string} title - The title of the modal.
     * @param {string} message - The message to display in the modal.
     * @returns {Promise<boolean>} True if the user confirms, false otherwise.
     */
    private async showConfirmationModal(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            new ConfirmationModal(this.app, title, message, (result) => {
                resolve(result);
            }).open();
        });
    }

}
