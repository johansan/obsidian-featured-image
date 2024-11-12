// Obsidian imports
import { normalizePath, Plugin, Notice, TFile, requestUrl, RequestUrlResponse, debounce, Modal, Setting } from 'obsidian';

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
	private setFeaturedImageDebounced: (file: TFile) => void;
	private isUpdatingFrontmatter: boolean = false;
	private isRunningBulkUpdate: boolean = false;

	/**
	 * Loads the plugin, initializes settings, and sets up event listeners.
	 */
	async onload() {
		await this.loadSettings();
		this.debugLog('Plugin loaded, debug mode:', this.settings.debugMode, 'dry run:', this.settings.dryRun);

		// Make sure setFeaturedImage is not called too often
		this.setFeaturedImageDebounced = debounce(this.setFeaturedImage.bind(this), 500, false);

		// Add command for updating all featured images in current folder
		this.addCommand({
			id: 'featured-image-update-folder',
			name: 'Set featured images in current folder',
			callback: () => this.updateFolderFeaturedImages(),
		});

        // Add command for updating all featured images
        this.addCommand({
            id: 'featured-image-update-all',
            name: 'Set featured images in all files',
            callback: () => this.updateAllFeaturedImages(),
        });

        // Add command for removing all featured images
        this.addCommand({
            id: 'featured-image-remove-all',
            name: 'Remove featured images in all files',
            callback: () => this.removeAllFeaturedImages(),
        });

		// Watch for file changes and update the featured image if the file is a markdown file
		this.registerEvent(
			this.app.vault.on('modify', (file: TFile) => {
                // Ignore all file changes if we are currently updating the frontmatter section or running a bulk update
				if (file instanceof TFile && file.extension === 'md' && !this.isUpdatingFrontmatter && !this.isRunningBulkUpdate) {
					this.setFeaturedImageDebounced(file);
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
        // Clean up debounced function
        if (this.setFeaturedImageDebounced) {
            // @ts-ignore - Access private property
            this.setFeaturedImageDebounced.cancel();
        }
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
	}

    /**
     * Sets the featured image for a given file.
     * @param {TFile} file - The file to process.
     * @returns {Promise<boolean>} True if the featured image was updated, false otherwise.
     */
    async setFeaturedImage(file: TFile): Promise<boolean> {
        if (this.shouldSkipProcessing(file)) {
            return false;
        }

        const currentFeature = this.getFeatureFromFrontmatterCache(file);
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
    private getFeatureFromFrontmatterCache(file: TFile): string | undefined {
        const cache = this.app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.[this.settings.frontmatterProperty];
    }

    /**
     * Check if the file should be skipped for processing.
     * @param {TFile} file - The file to check.
     * @returns {boolean} True if the file should be skipped, false otherwise.
     */
    private shouldSkipProcessing(file: TFile): boolean {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        const currentFeature = frontmatter?.[this.settings.frontmatterProperty];

        // Check for excalidraw tag
        let hasExcalidrawTag = false;
        const tags = frontmatter?.tags;
        
        if (Array.isArray(tags)) {
          hasExcalidrawTag = tags.includes('excalidraw');
        } else if (typeof tags === 'string') {
          hasExcalidrawTag = tags.split(',').map(tag => tag.trim()).includes('excalidraw');
        }

        const shouldSkip = (
            hasExcalidrawTag ||
            (this.settings.onlyUpdateExisting && !currentFeature) ||
            this.settings.excludedFolders.some((folder: string) => file.path.startsWith(folder + '/'))
        );
        return shouldSkip;
    }

    /**
     * Finds the featured image in the document content.
     * @param {string} content - The document content to search.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {Promise<string | undefined>} The found featured image, if any.
     */
    private async getFeatureFromDocument(content: string, currentFeature: string | undefined): Promise<string | undefined> {
        // Define individual regex patterns with named groups
        const wikiStyleImageRegex = `!\\[\\[(?<wikiImage>[^\\]]+\\.(${this.settings.imageExtensions.join('|')}))(?:\\|[^\\]]*)?\\]\\]`;
        const markdownStyleImageRegex = `!\\[.*?\\]\\((?<mdImage>[^)]+\\.(${this.settings.imageExtensions.join('|')}))\\)`;
        const youtubeRegex = `${this.settings.requireExclamationForYouTube ? '!' : '!?'}\\[.*?\\]\\((?<youtube>https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\\S+)\\)`;
        const autoCardLinkRegex = /```cardlink[\s\S]*?image:\s*(?<autoCardImage>.+?)(?=\s*[\n}])/;
        
        // Combine all regex patterns
        const combinedRegex = new RegExp(
            `(${wikiStyleImageRegex}|${markdownStyleImageRegex}|${youtubeRegex}|${autoCardLinkRegex.source})`,
            'i'
        );
        
        const match = content.match(combinedRegex);
        if (match) {
            const { groups } = match ?? {};
            if (groups?.wikiImage || groups?.mdImage) {
                // It's an image link (wiki-style or Markdown-style)
                const imagePath = groups.wikiImage || groups.mdImage;
                return imagePath ? decodeURIComponent(imagePath) : undefined;
            } else if (groups?.youtube) {
                // It's a YouTube link
                const videoId = this.getVideoId(groups.youtube);
                if (videoId) {
                    return await this.downloadThumbnail(videoId, currentFeature);
                }
            } else if (groups?.autoCardImage) {
                // It's an Auto Card Link image
                return await this.processAutoCardLinkImage(groups?.autoCardImage, currentFeature);
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
            return localPath;
        }

        // Check if the image path is a valid URL
        if (!this.isValidUrl(imagePath)) {
            this.errorLog('Invalid Auto Card Link URL:', imagePath);
            return undefined;
        }            

        // Generate unique local filename from image path
        const hashedFilename = this.generateHashedFilenameFromUrl(imagePath);
        if (!hashedFilename) {
            this.errorLog('Failed to generate hashed filename for:', imagePath);
            return undefined;
        }

        // Normalize Auto Card Link path
        const autoCardLinkFolder = normalizePath(`${this.settings.thumbnailDownloadFolder}/autocardlink`);
        const downloadPath = `${autoCardLinkFolder}/${hashedFilename}`;

        // If currentFeature matches the downloadPath, return it without downloading
        if (currentFeature === downloadPath) {
            this.debugLog('Auto Card Link image already exists, skipping download');
            return currentFeature;
        }

        if (this.settings.dryRun) {
            this.debugLog('Dry run: Skipping Auto Card Link image download, using mock path');
            return downloadPath;
        }

        try {
            // Create the Auto Card Link directory if it doesn't exist
            if (!(await this.app.vault.adapter.exists(autoCardLinkFolder))) {
                await this.app.vault.adapter.mkdir(autoCardLinkFolder);
            }

            const response = await requestUrl({
                url: imagePath,
                method: 'GET',
            });

            await this.app.vault.adapter.writeBinary(downloadPath, response.arrayBuffer);
            return downloadPath;
        } catch (error) {
            this.errorLog('Failed to download Auto Card Link image, error:', error);
            return undefined;
        }
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
     * Generate a hashed filename from a URL.
     * @param {string} url - The URL to hash.
     * @returns {string | undefined} The hashed filename.
     */
    private generateHashedFilenameFromUrl(url: string): string | undefined {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
    
        // Get the original filename from the URL
        let originalFilename = pathname.split('/').pop();
        
        // If there's no filename or no extension, return undefined
        if (!originalFilename || !originalFilename.includes('.')) {
            return undefined;
        }
    
        const extension = originalFilename.split('.').pop() || '';
        if (!extension) {
            return undefined;
        }
        
        // Create a hash of the full URL
        const hash = createHash('md5').update(url).digest('hex');
        
        // Construct the new filename, hash + extension
        return `${hash}.${extension}`;
    }

    /**
     * Updates the frontmatter of a file with the new featured image.
     * @param {TFile} file - The file to update.
     * @param {string | undefined} newFeature - The new featured image.
     */
    private async updateFrontmatter(file: TFile, newFeature: string | undefined) {
        this.isUpdatingFrontmatter = true;
        try {
            if (this.settings.dryRun) {
                this.debugLog('Dry run: Skipping frontmatter update');
                if (!this.isRunningBulkUpdate && this.settings.showNotificationsOnUpdate) {
                    new Notice(`Dry run: Would ${newFeature ? 'set' : 'remove'} featured image ${newFeature ? `to ${newFeature}` : ''}`);
                }
            } else {
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    if (newFeature) {
                        frontmatter[this.settings.frontmatterProperty] = newFeature;
                        if (!this.isRunningBulkUpdate && this.settings.showNotificationsOnUpdate) {
                            new Notice(`Featured image set to ${newFeature}`);
                        }
                    } else {
                        delete frontmatter[this.settings.frontmatterProperty];
                        if (!this.isRunningBulkUpdate && this.settings.showNotificationsOnUpdate) {
                            new Notice('Featured image removed');
                        }
                    }
                });
            }
        } finally {
            this.isUpdatingFrontmatter = false;
        }
    }

    /**
     * Downloads a YouTube video thumbnail.
     * @param {string} videoId - The YouTube video ID.
     * @param {string} thumbnailFolder - The folder to save the thumbnail.
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
            headers: { 'Accept': isWebp ? 'image/webp' : 'image/jpeg' },
            throw: false  // Don't throw on non-200 responses
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
      
          if (hostname.includes('youtu.be')) {
            // Example URL: https://youtu.be/dQw4w9WgXcQ
            return pathname.slice(1);
          }
          
          if (hostname.includes('youtube.com')) {
            // Example URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ
            if (pathname === '/watch') {
              return searchParams.get('v');
            }
            // Example URLs: https://www.youtube.com/embed/dQw4w9WgXcQ and https://www.youtube.com/v/dQw4w9WgXcQ
            if (pathname.startsWith('/embed/') || pathname.startsWith('/v/')) {
              return pathname.split('/')[2];
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

        const currentFolder = activeFile.parent?.path || '';
        
        const confirmation = await this.showConfirmationModal(
            'Update folder featured images',
            `This will scan all markdown files in "${currentFolder}" and its subfolders, and update or add featured images based on the first image, YouTube link, or Auto Card Link image found in each file. Proceed?`
        );
        if (!confirmation) return;

        const allFiles = this.app.vault.getMarkdownFiles();
        const folderFiles = allFiles.filter(file => {
            // Include files in current folder and subfolders, but handle root folder case
            return currentFolder === '' 
                ? file.path === file.name  // For root folder, only include files in root
                : file.path.startsWith(currentFolder + '/');
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
        const batchSize = 5; // Process 5 files at a time
        new Notice(`Starting ${this.settings.dryRun ? 'dry run of ' : ''}${operationName}...`);

        let updatedCount = 0;
        let totalFiles = files.length;
        let lastNotificationTime = Date.now();

        try {
            for (let i = 0; i < files.length; i += batchSize) {
                const batch = files.slice(i, i + batchSize);
                const results = await Promise.all(batch.map(file => this.setFeaturedImage(file)));
                updatedCount += results.filter(result => result).length;

                // Show notification every 5 seconds
                const currentTime = Date.now();
                if (currentTime - lastNotificationTime >= 5000) {
                    new Notice(`Processed ${i + 1} of ${totalFiles} files. Updated ${updatedCount} featured images.`);
                    lastNotificationTime = currentTime;
                }
            }
        } finally {
            this.isRunningBulkUpdate = false;
            new Notice(`Finished ${this.settings.dryRun ? 'dry run of ' : ''}${progressText} for ${updatedCount} files.`);
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
            const wasRemoved = await this.removeFeaturedImage(file);
            if (wasRemoved) {
                removedCount++;
            }
        }

        this.isRunningBulkUpdate = false;
        new Notice(`Finished ${this.settings.dryRun ? 'dry run of ' : ''}removing featured images from ${removedCount} files.`);
    }

    /**
     * Removes the featured image from a specific file.
     * @param {TFile} file - The file to remove the featured image from.
     * @returns {Promise<boolean>} True if the featured image was removed, false otherwise.
     */
    async removeFeaturedImage(file: TFile): Promise<boolean> {
        const currentFeature = this.getFeatureFromFrontmatterCache(file);
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
