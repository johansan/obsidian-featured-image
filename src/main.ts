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

    // Placeholder image data for failed downloads (1x1 transparent PNG)
    private static readonly FAILED_IMAGE_DATA = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
        0x49, 0x48, 0x44, 0x52, // "IHDR"
        0x00, 0x00, 0x00, 0x01, // width: 1
        0x00, 0x00, 0x00, 0x01, // height: 1
        0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
        0x1F, 0x15, 0xC4, 0x89, // IHDR CRC
        0x00, 0x00, 0x00, 0x0A, // IDAT chunk length
        0x49, 0x44, 0x41, 0x54, // "IDAT"
        0x78, 0x9C, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // compressed data
        0xE5, 0x27, 0xDE, 0xFC, // IDAT CRC
        0x00, 0x00, 0x00, 0x00, // IEND chunk length
        0x49, 0x45, 0x4E, 0x44, // "IEND"
        0xAE, 0x42, 0x60, 0x82  // IEND CRC
    ]);
    
    // Canvas element for image resizing
    private canvas: HTMLCanvasElement | null = null;

	/**
	 * Loads the plugin, initializes settings, and sets up event listeners.
	 */
	async onload() {
		await this.loadSettings();
		this.debugLog('Plugin loaded, debug mode:', this.settings.debugMode, 'dry run:', this.settings.dryRun);

        // Pre-compile regex patterns
        this.compileRegexPatterns();
        
        // Initialize canvas for image resizing if needed
        if (this.settings.createResizedThumbnail) {
            this.canvas = document.createElement('canvas');
        }

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
        
        // Add command for cleaning up unused images
        this.addCommand({
            id: 'featured-image-cleanup-unused',
            name: 'Remove unused downloaded images and thumbnails',
            callback: () => this.cleanupUnusedImages(),
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

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
        const currentThumbnail = this.getThumbnailFromFrontmatter(file);

        if (this.shouldSkipProcessing(file, currentFeature)) {
            return false;
        }

        const fileContent = await this.app.vault.cachedRead(file);
        const newFeature = await this.getFeatureFromDocument(fileContent, currentFeature);
        
        // Generate thumbnail if feature image has changed and thumbnails are enabled
        let newThumbnail = currentThumbnail;
        if (newFeature && newFeature !== currentFeature && this.settings.createResizedThumbnail) {
            newThumbnail = await this.createThumbnail(newFeature);
            this.debugLog(`THUMBNAIL GENERATED\n- File: ${file.path}\n- Original: ${newFeature}\n- Thumbnail: ${newThumbnail}`);
        } else if (!newFeature) {
            // Clear thumbnail if no feature image
            newThumbnail = undefined;
        }

        if (currentFeature !== newFeature || currentThumbnail !== newThumbnail) {
            await this.updateFrontmatter(file, newFeature, newThumbnail);
            this.debugLog(`FEATURE UPDATED\n- File: ${file.path}\n- Current feature: ${currentFeature}\n- New feature: ${newFeature}\n- Thumbnail: ${newThumbnail}`);
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
            // Attempt to extract the image path from wiki-style and embedded links
            const match = feature.match(/!?\[\[(.*?)\]\]/);
            if (match) {
                return match[1];
            } else {
                // Return the feature as-is if it's not a wiki-style or embedded link
                return feature;
            }
        }
        
        return undefined;
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
        
        const cache = this.app.metadataCache.getFileCache(file);
        const thumbnail = cache?.frontmatter?.[this.settings.resizedFrontmatterProperty];
        
        if (thumbnail) {
            // Attempt to extract the image path from wiki-style and embedded links
            const match = thumbnail.match(/!?\[\[(.*?)\]\]/);
            if (match) {
                return match[1];
            } else {
                // Return the thumbnail as-is if it's not a wiki-style or embedded link
                return thumbnail;
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

        const propertyExists = this.settings.frontmatterProperty in (cache?.frontmatter || {});
        const folderIsExcluded = this.settings.excludedFolders.some((folder: string) => file.path.startsWith(folder + '/'));

        const shouldSkip = (
            (this.settings.onlyUpdateExisting && !propertyExists) ||
            folderIsExcluded
        );
        
        return shouldSkip;
    }

    /**
     * Compiles the regular expressions used in getFeatureFromDocument.
     */
    private compileRegexPatterns() {
        const imageExtensionsPattern = this.settings.imageExtensions.join('|');

        // Wiki image pattern, updated to handle additional selectors and parameters after the image name
        // e.g. ![[image.jpg]], ![[image.jpg|caption]], ![[image.jpg#right|caption|300]]
        const wikiImagePattern = `!\\[\\[(?<wikiImage>[^\\]|#]+\\.(${imageExtensionsPattern}))(?:[#|][^\\]]*)?\\]\\]`;

        // Markdown image pattern, e.g. external ![](https://example.com/imagelink) or local ![](resources/image.jpg)
        const mdImagePattern = `!\\[.*?\\]\\((?<mdImage>(?:https?:\\/\\/(?:[^)(]|\\([^)(]*\\))+|[^)(]+\\.(${imageExtensionsPattern})))\\)`;

        // YouTube pattern, e.g. ![Movie title](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
        const youtubePattern = `${this.settings.requireExclamationForYouTube ? '!' : '!?'}\\[.*?\\]\\((?<youtube>https?:\\/\\/(?:www\\.)?(?:youtube\\.com|youtu\\.be)\\/\\S+)\\)`;

        // IMPORTANT: Put YouTube first in the alternation so it is captured before mdImage
        const combinedRegexString = [
            youtubePattern,    // check youtube group first
            wikiImagePattern,  // then wiki image links
            mdImagePattern     // then markdown image links
        ].join('|');

        this.combinedLineRegex = new RegExp(combinedRegexString, 'i');
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
            // First check for Auto Card Link code blocks
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

            // Check for other images (local or external)
            const match = this.combinedLineRegex.exec(line);

            if (match) {
                // Check for YouTube links, e.g. ![Movie title](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
                if (match.groups?.youtube) {
                    const videoId = this.getVideoId(match.groups.youtube);
                    if (videoId) {
                        return await this.downloadThumbnail(videoId, currentFeature);
                    }
                    continue;
                }

                // Check for local wiki image links, e.g. ![[image.jpg]]
                if (match.groups?.wikiImage) {
                    return decodeURIComponent(match.groups.wikiImage);
                }

                // Check for markdown image links, e.g. ![image.jpg](https://example.com/image.jpg)
                if (match.groups?.mdImage) {
                    const mdImage = decodeURIComponent(match.groups.mdImage);
                    // Check if it's an external URL
                    if (this.isValidUrl(mdImage)) {
                        return await this.downloadExternalImage(mdImage, currentFeature);
                    }
                    return mdImage;
                }
            }
        }
        
        // After all the image searching logic, before returning undefined
        if (this.settings.preserveTemplateImages && currentFeature) {
            this.debugLog('No new image found, preserving existing featured image:', currentFeature);
            return currentFeature;
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
    
        // Handle local images (Auto Card Link always embeds local images within quotes)
        if (imagePath.startsWith('"') && imagePath.endsWith('"')) {
            let localPath = imagePath.slice(1, -1).trim();
            localPath = localPath.replace(/^\[\[|\]\]$/g, '');
            const fileExists = await this.app.vault.adapter.exists(localPath);
            if (!fileExists) {
                this.errorLog('Local image not found:', localPath);
                return undefined;
            }
            return localPath;
        }
    
        // Handle external images
        if (!this.isValidUrl(imagePath)) {
            this.errorLog('Invalid Auto Card Link URL:', imagePath);
            return undefined;
        }
    
        return await this.downloadExternalImage(imagePath, currentFeature, 'autocardlink');
    }

    /**
     * Downloads an external image and saves it locally.
     * @param {string} imageUrl - The URL of the image to download.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {Promise<string | undefined>} The path to the downloaded image.
     */
    private async downloadExternalImage(imageUrl: string, currentFeature: string | undefined, subfolder: string = 'external'): Promise<string | undefined> {
        // Normalize folder path
        const downloadFolder = normalizePath(`${this.settings.thumbnailDownloadFolder}/${subfolder}`);
        
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
            } else {
                this.debugLog('Retrying old failed download:', imageUrl);
                try {
                    await this.app.vault.adapter.remove(failedMarkerPath);
                } catch (error) {
                    this.errorLog('Failed to remove old failed marker:', error);
                }
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
                method: 'GET',
            });

            // Determine the file extension from Content-Type
            const contentType = response.headers['content-type'];
            const extension = this.getExtensionFromContentType(contentType);
            if (!extension) {
                throw new Error('Unknown Content-Type for image: ' + contentType);
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
     * Creates a resized thumbnail of an image
     * @param {string} imagePath - Path to the original image
     * @returns {Promise<string | undefined>} - Path to the resized image or undefined if failed
     */
    private async createThumbnail(imagePath: string): Promise<string | undefined> {
        // Skip if resizing is not enabled or both dimensions are 0
        if (!this.settings.createResizedThumbnail || 
            (this.settings.maxResizedWidth === 0 && this.settings.maxResizedHeight === 0)) {
            return undefined;
        }

        try {
            // Check if the source image exists
            if (!(await this.app.vault.adapter.exists(imagePath))) {
                this.errorLog('Source image not found:', imagePath);
                return undefined;
            }

            // Generate a hashed name based on the source path and resize settings
            const settingsHash = createHash('md5')
                .update(`${this.settings.maxResizedWidth}_${this.settings.maxResizedHeight}_${this.settings.fillResizedDimensions}`)
                .digest('hex')
                .substring(0, 8);
            
            const sourceHash = createHash('md5')
                .update(imagePath)
                .digest('hex');
                
            const hashedName = `${sourceHash}_${settingsHash}`;
            
            // Define paths
            const resizedFolder = normalizePath(`${this.settings.thumbnailDownloadFolder}/resized`);
            const thumbnailPath = `${resizedFolder}/${hashedName}.jpg`;  // We'll always output JPG for consistency
            
            // Check if resized thumbnail already exists
            if (await this.app.vault.adapter.exists(thumbnailPath)) {
                this.debugLog('Resized thumbnail already exists:', thumbnailPath);
                return thumbnailPath;
            }
            
            // Skip actual processing in dry run mode
            if (this.settings.dryRun) {
                this.debugLog('Dry run: Skipping thumbnail creation, using mock path');
                return thumbnailPath;
            }

            // Create the resize directory if it doesn't exist
            if (!(await this.app.vault.adapter.exists(resizedFolder))) {
                await this.app.vault.adapter.mkdir(resizedFolder);
            }

            // Read the image file
            const imageBuffer = await this.app.vault.adapter.readBinary(imagePath);
            
            // Create blob URL from the image buffer
            const blob = new Blob([imageBuffer]);
            const imageUrl = URL.createObjectURL(blob);
            
            // Load the image
            const image = await this.loadImage(imageUrl);
            
            // Initialize canvas if needed
            if (!this.canvas) {
                this.canvas = document.createElement('canvas');
            }
            
            // Calculate new dimensions
            const { width, height } = this.calculateThumbnailDimensions(
                image.width, 
                image.height, 
                this.settings.maxResizedWidth, 
                this.settings.maxResizedHeight,
                this.settings.fillResizedDimensions
            );
            
            // Resize the image
            const resizedImageData = await this.resizeImage(image, width, height);
            
            // Write the resized image to disk
            await this.app.vault.adapter.writeBinary(thumbnailPath, resizedImageData);
            
            // Clean up
            URL.revokeObjectURL(imageUrl);
            
            return thumbnailPath;
            
        } catch (error) {
            this.errorLog('Error creating thumbnail:', error);
            return undefined;
        }
    }
    
    /**
     * Loads an image from a URL
     * @param {string} url - URL of the image to load
     * @returns {Promise<HTMLImageElement>} - Loaded image element
     */
    private loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(e);
            img.src = url;
        });
    }
    
    /**
     * Calculates the dimensions for the thumbnail
     * @param {number} srcWidth - Original image width
     * @param {number} srcHeight - Original image height
     * @param {number} maxWidth - Maximum thumbnail width
     * @param {number} maxHeight - Maximum thumbnail height
     * @param {boolean} fillMax - Whether to fill the max dimensions
     * @returns {Object} - The calculated width and height
     */
    private calculateThumbnailDimensions(
        srcWidth: number, 
        srcHeight: number, 
        maxWidth: number, 
        maxHeight: number,
        fillMax: boolean
    ): {width: number, height: number} {
        let width = srcWidth;
        let height = srcHeight;
        
        if (maxWidth === 0 && maxHeight === 0) {
            // No resizing if both dimensions are 0
            return { width, height };
        }
        
        if (fillMax && maxWidth > 0 && maxHeight > 0) {
            // Fill mode: set to exact dimensions
            return { width: maxWidth, height: maxHeight };
        }
        
        // Calculate aspect ratio
        const aspectRatio = srcWidth / srcHeight;
        
        if (maxWidth > 0 && maxHeight > 0) {
            // Both dimensions specified, fit within the box
            if ((srcWidth > maxWidth) || (srcHeight > maxHeight)) {
                if (maxWidth / maxHeight > aspectRatio) {
                    // Height is the limiting factor
                    height = maxHeight;
                    width = Math.round(height * aspectRatio);
                } else {
                    // Width is the limiting factor
                    width = maxWidth;
                    height = Math.round(width / aspectRatio);
                }
            }
        } else if (maxWidth > 0) {
            // Only width specified
            if (srcWidth > maxWidth) {
                width = maxWidth;
                height = Math.round(width / aspectRatio);
            }
        } else if (maxHeight > 0) {
            // Only height specified
            if (srcHeight > maxHeight) {
                height = maxHeight;
                width = Math.round(height * aspectRatio);
            }
        }
        
        return { width, height };
    }
    
    /**
     * Resizes an image using canvas
     * @param {HTMLImageElement} img - Image element to resize
     * @param {number} width - Target width
     * @param {number} height - Target height
     * @returns {Promise<ArrayBuffer>} - Resized image as array buffer
     */
    private resizeImage(img: HTMLImageElement, width: number, height: number): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            try {
                const canvas = this.canvas!;
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }
                
                // Draw image with smooth scaling
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to blob
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Failed to create blob from canvas'));
                        return;
                    }
                    
                    // Convert blob to array buffer
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
                }, 'image/jpeg', 0.85); // Use JPEG with 85% quality
            } catch (error) {
                reject(error);
            }
        });
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
                    let message = newFeature ? `Dry run: Would change featured image to: ${newFeature}` : `Dry run: Would remove featured image`;
                    new Notice(message);
                }
            } else {
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    // Handle featured image
                    if (newFeature) {
                        // Format the value based on the selected format
                        let featureValue = newFeature;
                        switch (this.settings.mediaLinkFormat) {
                            case 'wiki':
                                featureValue = `[[${newFeature}]]`;
                                break;
                            case 'embed':
                                featureValue = `![[${newFeature}]]`;
                                break;
                            // 'plain' is default, no formatting needed
                        }
                        frontmatter[this.settings.frontmatterProperty] = featureValue;
                    } else {
                        if (this.settings.keepEmptyProperty) {
                            frontmatter[this.settings.frontmatterProperty] = '';
                        } else {
                            delete frontmatter[this.settings.frontmatterProperty];
                        }
                    }
                    
                    // Handle thumbnail if enabled
                    if (this.settings.createResizedThumbnail) {
                        if (newThumbnail) {
                            // Format the value based on the selected format
                            let thumbnailValue = newThumbnail;
                            switch (this.settings.mediaLinkFormat) {
                                case 'wiki':
                                    thumbnailValue = `[[${newThumbnail}]]`;
                                    break;
                                case 'embed':
                                    thumbnailValue = `![[${newThumbnail}]]`;
                                    break;
                                // 'plain' is default, no formatting needed
                            }
                            frontmatter[this.settings.resizedFrontmatterProperty] = thumbnailValue;
                        } else {
                            if (this.settings.keepEmptyProperty) {
                                frontmatter[this.settings.resizedFrontmatterProperty] = '';
                            } else {
                                delete frontmatter[this.settings.resizedFrontmatterProperty];
                            }
                        }
                    }
                });

                if (!this.isRunningBulkUpdate && this.settings.showNotificationsOnUpdate) {
                    let message = newFeature ? `Featured image set to ${newFeature}` : 'Featured image removed';
                    new Notice(message);
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
                        
                        // Get current feature and thumbnail
                        const currentFeature = this.getFeatureFromFrontmatter(file);
                        const currentThumbnail = this.getThumbnailFromFrontmatter(file);
                        
                        // Process the file
                        const wasUpdated = await this.setFeaturedImage(file);
                        
                        // If file was updated and not in dry run mode, restore the original mtime
                        if (wasUpdated && !this.settings.dryRun) {
                            await this.app.vault.modify(file, await this.app.vault.read(file), {
                                mtime: originalMtime
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
                }));

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
        
        const confirmation = await this.showConfirmationModal(
            'Remove all featured images',
            modalMessage
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
            let completionMessage = `Finished ${this.settings.dryRun ? 'dry run of ' : ''}removing featured images from ${removedCount} files.`;
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
     * Cleans up unused downloaded images and thumbnails.
     */
    async cleanupUnusedImages() {
        this.debugLog('Starting cleanup of unused images');
        new Notice('Scanning for unused images...');
        
        // Initialize counters
        let externalImagesCount = 0;
        let youtubeImagesCount = 0;
        let autoCardImagesCount = 0;
        let resizedThumbnailsCount = 0;
        let totalBytes = 0;
        
        // Initialize file path sets
        const externalImages = new Set<string>();
        const youtubeImages = new Set<string>();
        const autoCardImages = new Set<string>();
        const resizedThumbnails = new Set<string>();
        const usedFiles = new Set<string>();
        
        try {
            // Step 1: Collect all target files
            await this.collectImageFiles(
                externalImages, 
                youtubeImages, 
                autoCardImages, 
                resizedThumbnails
            );
            
            this.debugLog(`Collected image files:
                - External: ${externalImages.size}
                - YouTube: ${youtubeImages.size}
                - Auto Card: ${autoCardImages.size}
                - Resized Thumbnails: ${resizedThumbnails.size}`
            );
            
            // Step 2: Build reference map from all markdown files
            await this.buildReferenceMap(usedFiles);
            
            this.debugLog(`Found ${usedFiles.size} unique file references in notes`);
            
            // Step 3: Find unused files
            const unusedExternal = this.findUnusedFiles(externalImages, usedFiles);
            const unusedYoutube = this.findUnusedFiles(youtubeImages, usedFiles);
            const unusedAutoCard = this.findUnusedFiles(autoCardImages, usedFiles);
            const unusedResized = this.findUnusedFiles(resizedThumbnails, usedFiles);
            
            externalImagesCount = unusedExternal.size;
            youtubeImagesCount = unusedYoutube.size;
            autoCardImagesCount = unusedAutoCard.size;
            resizedThumbnailsCount = unusedResized.size;
            
            const totalUnused = externalImagesCount + youtubeImagesCount + 
                autoCardImagesCount + resizedThumbnailsCount;
                
            if (totalUnused === 0) {
                new Notice('No unused images found.');
                return;
            }
            
            // Confirm deletion
            const confirmation = await this.showConfirmationModal(
                'Remove unused images',
                `Found ${totalUnused} unused images. Do you want to delete these files?`
            );
            
            if (!confirmation) {
                new Notice('Cleanup cancelled.');
                return;
            }
            
            // Step 4: Delete unused files
            if (this.settings.dryRun) {
                this.debugLog('Dry run: Would delete unused files');
                new Notice(`Dry run: Would delete ${totalUnused} unused files.`);
                return;
            }
            
            // Delete files in batches
            new Notice(`Deleting ${totalUnused} unused files...`);
            
            // Calculate size before deletion
            totalBytes = await this.calculateFileSizes([
                ...unusedExternal, ...unusedYoutube, 
                ...unusedAutoCard, ...unusedResized
            ]);
            
            // Delete files
            await this.deleteUnusedFiles(unusedExternal, 'external images');
            await this.deleteUnusedFiles(unusedYoutube, 'YouTube thumbnails');
            await this.deleteUnusedFiles(unusedAutoCard, 'Auto Card Link images');
            await this.deleteUnusedFiles(unusedResized, 'resized thumbnails');
            
            // Final report
            const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
            new Notice(`Cleanup complete. Deleted ${totalUnused} unused files (${totalMB} MB).`);
            
            
        } catch (error) {
            this.errorLog('Error during image cleanup:', error);
            new Notice('Error during image cleanup. Check console for details.');
        }
    }
    
    /**
     * Collects all image files in the thumbnail folder.
     * @param {Set<string>} externalImages - Set to store external image paths
     * @param {Set<string>} youtubeImages - Set to store YouTube thumbnail paths
     * @param {Set<string>} autoCardImages - Set to store Auto Card Link image paths
     * @param {Set<string>} resizedThumbnails - Set to store resized thumbnail paths
     */
    private async collectImageFiles(
        externalImages: Set<string>,
        youtubeImages: Set<string>,
        autoCardImages: Set<string>,
        resizedThumbnails: Set<string>
    ): Promise<void> {
        const thumbnailFolder = normalizePath(this.settings.thumbnailDownloadFolder);
        
        // Ensure thumbnail directory exists
        if (!(await this.app.vault.adapter.exists(thumbnailFolder))) {
            this.debugLog(`Thumbnail folder ${thumbnailFolder} does not exist`);
            return;
        }
        
        // Check each subfolder
        const externalFolder = `${thumbnailFolder}/external`;
        const youtubeFolder = `${thumbnailFolder}/youtube`;
        const autoCardFolder = `${thumbnailFolder}/autocardlink`;
        const resizedFolder = `${thumbnailFolder}/resized`;
        
        // Collect external images
        if (await this.app.vault.adapter.exists(externalFolder)) {
            await this.collectFilesInFolder(externalFolder, externalImages, '.failed.png');
        }
        
        // Collect YouTube thumbnails
        if (await this.app.vault.adapter.exists(youtubeFolder)) {
            await this.collectFilesInFolder(youtubeFolder, youtubeImages, '.failed.png');
        }
        
        // Collect Auto Card Link images
        if (await this.app.vault.adapter.exists(autoCardFolder)) {
            await this.collectFilesInFolder(autoCardFolder, autoCardImages, '.failed.png');
        }
        
        // Collect resized thumbnails
        if (await this.app.vault.adapter.exists(resizedFolder)) {
            await this.collectFilesInFolder(resizedFolder, resizedThumbnails, '.failed.png');
        }
    }
    
    /**
     * Collects all files in a folder.
     * @param {string} folderPath - Path to the folder
     * @param {Set<string>} fileSet - Set to store file paths
     * @param {string} excludeExtension - Extension to exclude (e.g., '.failed.png')
     */
    private async collectFilesInFolder(
        folderPath: string, 
        fileSet: Set<string>, 
        excludeExtension: string
    ): Promise<void> {
        try {
            const files = await this.app.vault.adapter.list(folderPath);
            
            // Process regular files (not directories)
            for (const file of files.files) {
                // Skip files with excluded extension
                if (file.endsWith(excludeExtension)) {
                    continue;
                }
                
                fileSet.add(file);
            }
            
            // Process nested directories if any
            for (const dir of files.folders) {
                await this.collectFilesInFolder(dir, fileSet, excludeExtension);
            }
        } catch (error) {
            this.errorLog(`Error collecting files in ${folderPath}:`, error);
        }
    }
    
    /**
     * Builds a map of all file references in markdown files.
     * @param {Set<string>} usedFiles - Set to store all referenced file paths
     */
    private async buildReferenceMap(usedFiles: Set<string>): Promise<void> {
        const markdownFiles = this.app.vault.getMarkdownFiles();
        
        // Process all markdown files
        for (const file of markdownFiles) {
            await this.processFileReferences(file, usedFiles);
        }
    }
    
    /**
     * Processes a file to extract all image references.
     * @param {TFile} file - The file to process
     * @param {Set<string>} usedFiles - Set to store referenced file paths
     */
    private async processFileReferences(file: TFile, usedFiles: Set<string>): Promise<void> {
        try {
            // Get frontmatter references
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter) {
                // Check feature property
                const feature = cache.frontmatter[this.settings.frontmatterProperty];
                if (feature) {
                    this.addNormalizedPath(feature, usedFiles);
                }
                
                // Check thumbnail property if enabled
                if (this.settings.createResizedThumbnail) {
                    const thumbnail = cache.frontmatter[this.settings.resizedFrontmatterProperty];
                    if (thumbnail) {
                        this.addNormalizedPath(thumbnail, usedFiles);
                    }
                }
            }
            
            // Process document body for embedded images
            const content = await this.app.vault.cachedRead(file);
            const lines = content.split('\n');
            
            for (const line of lines) {
                // Use existing regex patterns to find images
                const match = this.combinedLineRegex.exec(line);
                if (match) {
                    // WikiImage links (![[image.jpg]])
                    if (match.groups?.wikiImage) {
                        this.addNormalizedPath(match.groups.wikiImage, usedFiles);
                    }
                    
                    // Markdown image links (![alt](path/to/image.jpg))
                    if (match.groups?.mdImage) {
                        const mdImage = decodeURIComponent(match.groups.mdImage);
                        // Only add if it's a local path (not a URL)
                        if (!this.isValidUrl(mdImage)) {
                            this.addNormalizedPath(mdImage, usedFiles);
                        }
                    }
                    
                    // YouTube links can be skipped as they're processed separately
                }
            }
            
            // Process Auto Card Link codeblocks
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
                                const imagePath = imageMatch.groups.autoCardImage.trim();
                                // Local images in Auto Card Link are quoted
                                if (imagePath.startsWith('"') && imagePath.endsWith('"')) {
                                    const localPath = imagePath.slice(1, -1).trim();
                                    this.addNormalizedPath(localPath, usedFiles);
                                }
                            }
                        }
                        inCodeBlock = false;
                        codeBlockLanguage = '';
                        continue;
                    }
                }
                
                if (inCodeBlock && codeBlockLanguage === 'cardlink') {
                    codeBlockBuffer += line + '\n';
                }
            }
            
        } catch (error) {
            this.errorLog(`Error processing references in ${file.path}:`, error);
        }
    }
    
    /**
     * Adds a normalized path to the used files set.
     * @param {string} path - The path to add
     * @param {Set<string>} usedFiles - Set to store referenced file paths
     */
    private addNormalizedPath(path: string, usedFiles: Set<string>): void {
        // Remove wiki-link or embedded link formatting
        let normalizedPath = path;
        const match = path.match(/!?\[\[(.*?)\]\]/);
        if (match) {
            normalizedPath = match[1];
        }
        
        // Remove any parameters after pipe or hash
        normalizedPath = normalizedPath.split('|')[0].split('#')[0];
        
        // Normalize path
        normalizedPath = normalizePath(normalizedPath);
        
        // Add to the set
        usedFiles.add(normalizedPath);
    }
    
    /**
     * Finds unused files by comparing the file set with the used files set.
     * @param {Set<string>} fileSet - Set of all files in a category
     * @param {Set<string>} usedFiles - Set of all referenced files
     * @returns {Set<string>} Set of unused files
     */
    private findUnusedFiles(fileSet: Set<string>, usedFiles: Set<string>): Set<string> {
        const unusedFiles = new Set<string>();
        
        for (const file of fileSet) {
            // Check if the file is used
            if (!this.isFileReferenced(file, usedFiles)) {
                unusedFiles.add(file);
            }
        }
        
        return unusedFiles;
    }
    
    /**
     * Checks if a file is referenced in the used files set.
     * @param {string} filePath - The file path to check
     * @param {Set<string>} usedFiles - Set of all referenced files
     * @returns {boolean} True if the file is referenced, false otherwise
     */
    private isFileReferenced(filePath: string, usedFiles: Set<string>): boolean {
        // Direct match
        if (usedFiles.has(filePath)) {
            return true;
        }
        
        // Basename match (in case the path differs but filename matches)
        const fileName = filePath.split('/').pop() || '';
        
        for (const usedFile of usedFiles) {
            const usedFileName = usedFile.split('/').pop() || '';
            if (fileName === usedFileName) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Calculates the total size of a list of files.
     * @param {string[]} filePaths - List of file paths
     * @returns {Promise<number>} Total size in bytes
     */
    private async calculateFileSizes(filePaths: string[]): Promise<number> {
        let totalBytes = 0;
        
        for (const filePath of filePaths) {
            try {
                const stat = await this.app.vault.adapter.stat(filePath);
                if (stat) {
                    totalBytes += stat.size;
                }
            } catch (error) {
                this.errorLog(`Error getting file size for ${filePath}:`, error);
            }
        }
        
        return totalBytes;
    }
    
    /**
     * Deletes unused files.
     * @param {Set<string>} unusedFiles - Set of unused file paths
     * @param {string} category - Category name for logging
     */
    private async deleteUnusedFiles(unusedFiles: Set<string>, category: string): Promise<void> {
        let deletedCount = 0;
        
        for (const filePath of unusedFiles) {
            try {
                await this.app.vault.adapter.remove(filePath);
                deletedCount++;
                
                // Show progress every 20 files
                if (deletedCount % 20 === 0) {
                    new Notice(`Deleted ${deletedCount} unused ${category} so far...`);
                }
            } catch (error) {
                this.errorLog(`Error deleting file ${filePath}:`, error);
            }
        }
        
        this.debugLog(`Deleted ${deletedCount} unused ${category}`);
    }
}
