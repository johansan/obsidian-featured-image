import { normalizePath, Plugin, Notice, TFile, requestUrl, RequestUrlResponse, debounce, Modal, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab } from './settings'
import { ConfirmationModal, WelcomeModal } from './modals';
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

		// Show welcome modal if it's the first time
		if (!this.settings.hasShownWelcomeModal) {
			this.showWelcomeModal();
			this.settings.hasShownWelcomeModal = true;
			await this.saveSettings();
		}

		// Make sure setFeaturedImage is not called too often
		this.setFeaturedImageDebounced = debounce(this.setFeaturedImage.bind(this), 500, true);

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
			console.log(`${timestamp} [FeaturedImage]`, ...args);
		}
	}

    /**
     * Logs error messages.
     * @param {...any} args - The arguments to log.
     */
    private errorLog(...args: any[]) {
        const timestamp = new Date().toTimeString().split(' ')[0];
        console.error(`${timestamp} [FeaturedImage]`, ...args);
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
	}

    /**
     * Sets the featured image for a given file.
     * @param {TFile} file - The file to process.
     * @returns {Promise<boolean>} True if the featured image was updated, false otherwise.
     */
    async setFeaturedImage(file: TFile): Promise<boolean> {
        const currentFeature = this.getCurrentFeature(file);
        
        if (await this.shouldSkipProcessing(file, currentFeature)) {
            return false;
        }

        const fileContent = await this.app.vault.cachedRead(file);
        const newFeature = await this.findFeaturedImageInDocument(fileContent);

        if (currentFeature !== newFeature) {
            this.debugLog(`FEATURE UPDATED\n- File: ${file.path}\n- Current feature: ${currentFeature}\n- New feature: ${newFeature}`);
            await this.updateFrontmatter(file, newFeature);
            return true;
        } else {
            return false;
        }
    }

    /**
     * Gets the current featured image from the file's frontmatter.
     * @param {TFile} file - The file to check.
     * @returns {string | undefined} The current featured image, if any.
     */
    private getCurrentFeature(file: TFile): string | undefined {
        const cache = this.app.metadataCache.getFileCache(file);
        const feature = cache?.frontmatter?.[this.settings.frontmatterProperty];
        return feature;
    }

    /**
     * Determines if a file should be skipped for processing.
     * @param {TFile} file - The file to check.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {Promise<boolean>} True if the file should be skipped, false otherwise.
     */
    private async shouldSkipProcessing(file: TFile, currentFeature: string | undefined): Promise<boolean> {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

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
     * @returns {Promise<string | undefined>} The found featured image, if any.
     */
    private async findFeaturedImageInDocument(content: string): Promise<string | undefined> {
        // Define individual regex patterns with named groups
        const wikiStyleImageRegex = `!\\[\\[(?<wikiImage>[^\\]]+\\.(${this.settings.imageExtensions.join('|')}))(?:\\|[^\\]]*)?\\]\\]`;
        const markdownStyleImageRegex = `!\\[.*?\\]\\((?<mdImage>[^)]+\\.(${this.settings.imageExtensions.join('|')}))\\)`;
        const youtubeRegex = `${this.settings.requireExclamationForYoutube ? '!' : '!?'}\\[.*?\\]\\((?<youtube>https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\\S+)\\)`;
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
                return videoId ? await this.downloadThumbnail(videoId, this.settings.thumbnailDownloadFolder) : undefined;
            } else if (groups?.autoCardImage) {
                // It's an Auto Card Link image
                return await this.processAutoCardLinkImage(groups?.autoCardImage);
            }
        }

        return undefined;
    }

    /**
     * Processes an Auto Card Link image.
     * @param {string} imagePath - The image path from the Auto Card Link.
     * @returns {Promise<string | undefined>} The processed image path.
     */
    private async processAutoCardLinkImage(imagePath: string): Promise<string | undefined> {
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
    
        // Download remote image to thumbnail folder
        const filename = this.getFilenameFromUrl(imagePath);
        const downloadPath = `${this.settings.thumbnailDownloadFolder}/${filename}`;
        
        if (this.settings.dryRun) {
            this.debugLog('Dry run: Skipping Auto Card Link image download, using mock path');
            return downloadPath;
        }
    
        try {
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
     * Validates a URL.
     * @param {string} url - The URL to validate.
     * @returns {boolean} True if the URL is valid, false otherwise.
     */
    private isValidUrl(url: string): boolean {
        try {
          const parsedUrl = new URL(url);
          // In the future we might want to enforce HTTPS
          // return parsedUrl.protocol === 'https:';
        } catch (error) {
          return false;
        }
        return true;
    }

    /**
     * Extracts the filename from a URL.
     * @param {string} url - The URL to process.
     * @returns {string | undefined} The extracted filename.
     */
    private getFilenameFromUrl(url: string): string | undefined {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
    
        // Get the original filename from the URL
        let originalFilename = pathname.split('/').pop();
        
        // If there's no filename or no extension, return undefined
        if (!originalFilename || !originalFilename.includes('.')) {
            return undefined;
        }
    
        const extension = originalFilename.split('.').pop() || '';
        
        // Create a hash of the full URL
        const hash = createHash('md5').update(url).digest('hex').slice(0, 8);
        
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
     * @returns {Promise<string | undefined>} The path to the downloaded thumbnail.
     */
    async downloadThumbnail(videoId: string, thumbnailFolder: string): Promise<string | undefined> {
        
        // Create the thumbnail directory if it doesn't exist
        if (!(await this.app.vault.adapter.exists(thumbnailFolder))) {
            await this.app.vault.adapter.mkdir(thumbnailFolder);
        }

        // Check if WebP thumbnail already exists
        const webpFilename = `${videoId}.webp`;
        const webpFilePath = normalizePath(`${thumbnailFolder}/${webpFilename}`);
        if (await this.app.vault.adapter.exists(webpFilePath)) {
            return webpFilePath;
        }

        // Check if JPG thumbnail already exists
        const jpgFilename = `${videoId}.jpg`;
        const jpgFilePath = normalizePath(`${thumbnailFolder}/${jpgFilename}`);
        if (await this.app.vault.adapter.exists(jpgFilePath)) {
            return jpgFilePath;
        }

        if (this.settings.dryRun) {
            this.debugLog('Dry run: Skipping thumbnail download, using mock path');
            return `${thumbnailFolder}/${videoId}.webp`; // Return a mock path
        }

        // Try to download the thumbnail in WebP format if enabled
        if (this.settings.downloadWebP) {
            try {
                const webpResponse = await this.fetchThumbnail(videoId, 'maxresdefault.webp');
                if (webpResponse?.status === 200) {
                    const result = await this.saveThumbnail(webpResponse, webpFilePath, thumbnailFolder, webpFilename);
                    return result;
                }
            } catch (error) {
                this.debugLog('Failed to download WebP thumbnail');
            }
        }

        // Fall back to JPG versions
        try {
            const maxResResponse = await this.fetchThumbnail(videoId, 'maxresdefault.jpg');
            if (maxResResponse?.status === 200) {
                const result = await this.saveThumbnail(maxResResponse, jpgFilePath, thumbnailFolder, jpgFilename);
                return result;
            }
        } catch (error) {
            this.debugLog('Failed to download maxresdefault.jpg');
        }

        try {
            const hqDefaultResponse = await this.fetchThumbnail(videoId, 'hqdefault.jpg');
            if (hqDefaultResponse?.status === 200) {
                const result = await this.saveThumbnail(hqDefaultResponse, jpgFilePath, thumbnailFolder, jpgFilename);
                return result;
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
            throw new Error('Invalid Youtube thumbnail URL: ' + url);
        }
        return await requestUrl({
            url: url,
            method: 'GET',
            headers: { 'Accept': isWebp ? 'image/webp' : 'image/jpeg' },
        });
    }

    /**
     * Saves a downloaded thumbnail.
     * @param {object} response - The response containing the thumbnail data.
     * @param {string} fullFilePath - The full path to save the thumbnail.
     * @param {string} thumbnailFolder - The folder to save the thumbnail.
     * @param {string} filename - The filename for the thumbnail.
     * @returns {Promise<string | undefined>} The path to the saved thumbnail.
     */
    private async saveThumbnail(response: { arrayBuffer: ArrayBuffer }, fullFilePath: string, thumbnailFolder: string, filename: string) {
        
        try {
            // Save thumbnail using Obsidian's API
            await this.app.vault.adapter.writeBinary(fullFilePath, response.arrayBuffer);
            return normalizePath(`${thumbnailFolder}/${filename}`);
        } catch (error) {
            this.errorLog(`Error writing file: ${error}`);
            return undefined;
        }
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
            return pathname.slice(1);
          }
      
          if (hostname.includes('youtube.com')) {
            if (pathname === '/watch') {
              return searchParams.get('v');
            }
            if (pathname.startsWith('/embed/') || pathname.startsWith('/v/')) {
              return pathname.split('/')[2];
            }
          }
          return null;
        } catch (error) {
          this.errorLog('Invalid Youtube URL:', url);
          return null;
        }
      }

    /**
     * Updates featured images for all markdown files in the vault.
     */
    async updateAllFeaturedImages() {
        const confirmation = await this.showConfirmationModal(
            'Update All Featured Images',
            'This will scan all markdown files in your vault and update or add featured images based on the first image or YouTube link found in each file. Proceed?'
        );
        if (!confirmation) return;

        this.isRunningBulkUpdate = true;
        new Notice(`Starting ${this.settings.dryRun ? 'dry run of ' : ''}bulk update of featured images...`);

        const files = this.app.vault.getMarkdownFiles();
        let updatedCount = 0;

        for (const file of files) {
            const wasUpdated = await this.setFeaturedImage(file);
            if (wasUpdated) {
                updatedCount++;
            }
        }

        this.isRunningBulkUpdate = false;
        new Notice(`Finished ${this.settings.dryRun ? 'dry run of ' : ''}updating featured images for ${updatedCount} files.`);
    }

    /**
     * Removes featured images from all markdown files in the vault.
     */
    async removeAllFeaturedImages() {
        const confirmation = await this.showConfirmationModal(
            'Remove All Featured Images',
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
        const currentFeature = this.getCurrentFeature(file);
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

    /**
     * Shows the welcome modal to the user.
     */
    private showWelcomeModal() {
        new WelcomeModal(this.app, this.settings).open();
    }

}
