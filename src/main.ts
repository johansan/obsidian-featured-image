// Obsidian imports
import { normalizePath, Plugin, Notice, TFile, requestUrl, RequestUrlResponse, debounce, Debouncer } from 'obsidian';

// Styles
import '../styles.css';

// Internal imports
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab } from './settings'
import { ConfirmationModal } from './modals';

// External imports
import { createHash } from 'crypto';
import sharp from 'sharp';

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
        const currentSource = this.getFeatureSourceFromFrontmatter(file);

        if (this.shouldSkipProcessing(file, currentFeature)) {
            return false;
        }

        const fileContent = await this.app.vault.cachedRead(file);
        const result = await this.getFeatureFromDocument(fileContent, currentFeature, currentSource);
        const newFeature = result.feature;
        const newSource = result.source;

        const featureChanged = currentFeature !== newFeature;
        const sourceChanged = currentSource !== newSource;
        
        if (featureChanged || sourceChanged) {
            await this.updateFrontmatter(file, newFeature, newSource);
            this.debugLog(`FEATURE UPDATED\n- File: ${file.path}\n- Current feature: ${currentFeature}\n- New feature: ${newFeature}\n- Current source: ${currentSource}\n- New source: ${newSource}`);
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
     * Get the current featured image source from the file's frontmatter.
     * @param {TFile} file - The file to check.
     * @returns {string | undefined} The current featured image source, if any.
     */
    private getFeatureSourceFromFrontmatter(file: TFile): string | undefined {
        const cache = this.app.metadataCache.getFileCache(file);
        const sourceProperty = `${this.settings.frontmatterProperty}-source`;
        const source = cache?.frontmatter?.[sourceProperty];
        
        if (source) {
            return source;
        }
        
        return undefined;
    }

    /**
     * Finds the featured image in the document content.
     * @param {string} content - The document content to search.
     * @param {string | undefined} currentFeature - The current featured image.
     * @param {string | undefined} currentSource - The current source image path.
     * @returns {Promise<{feature: string | undefined, source: string | undefined}>} The found featured image and source, if any.
     */
    private async getFeatureFromDocument(
        content: string, 
        currentFeature: string | undefined,
        currentSource: string | undefined
    ): Promise<{feature: string | undefined, source: string | undefined}> {
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
                            const result = await this.processAutoCardLinkImage(imageMatch.groups.autoCardImage, currentFeature);
                            return { feature: result.path, source: result.sourcePath };
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
                        // If this is the same video we already have as the source, keep using the current feature
                        if (currentSource && currentSource.includes(videoId)) {
                            return { feature: currentFeature, source: currentSource };
                        }
                        const result = await this.downloadThumbnail(videoId, currentFeature);
                        return { feature: result.path, source: result.sourcePath };
                    }
                    continue;
                }

                // Check for local wiki image links, e.g. ![[image.jpg]]
                if (match.groups?.wikiImage) {
                    const localImagePath = decodeURIComponent(match.groups.wikiImage);
                    
                    // If this is the same image we already have as the source, keep using the current feature
                    if (currentSource === localImagePath) {
                        return { feature: currentFeature, source: currentSource };
                    }
                    
                    // Process the local image if needed
                    if (this.settings.cropAspectRatio || this.settings.maxDimension) {
                        const processedPath = await this.processLocalImage(localImagePath, currentFeature);
                        return { feature: processedPath, source: localImagePath };
                    }
                    
                    return { feature: localImagePath, source: localImagePath };
                }

                // Check for markdown image links, e.g. ![image.jpg](https://example.com/image.jpg)
                if (match.groups?.mdImage) {
                    const mdImage = decodeURIComponent(match.groups.mdImage);
                    
                    // Check if it's an external URL
                    if (this.isValidUrl(mdImage)) {
                        // If this is the same URL we already have as the source, keep using the current feature
                        if (currentSource === mdImage) {
                            return { feature: currentFeature, source: currentSource };
                        }
                        
                        const result = await this.downloadExternalImage(mdImage, currentFeature);
                        return { feature: result.path, source: result.sourcePath };
                    }
                    
                    // It's a local image path
                    // If this is the same image we already have as the source, keep using the current feature
                    if (currentSource === mdImage) {
                        return { feature: currentFeature, source: currentSource };
                    }
                    
                    // Process the local image if needed
                    if (this.settings.cropAspectRatio || this.settings.maxDimension) {
                        const processedPath = await this.processLocalImage(mdImage, currentFeature);
                        return { feature: processedPath, source: mdImage };
                    }
                    
                    return { feature: mdImage, source: mdImage };
                }
            }
        }
        
        // After all the image searching logic, before returning undefined
        if (this.settings.preserveTemplateImages && currentFeature) {
            this.debugLog('No new image found, preserving existing featured image:', currentFeature);
            return { feature: currentFeature, source: currentSource };
        }

        return { feature: undefined, source: undefined };
    }

    /**
     * Processes an Auto Card Link image.
     * @param {string} imagePath - The image path from the Auto Card Link.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {Promise<{path: string | undefined, sourcePath: string}>} The processed image path and source.
     */
    private async processAutoCardLinkImage(imagePath: string, currentFeature: string | undefined): Promise<{path: string | undefined, sourcePath: string}> {
        imagePath = imagePath.trim();
    
        // Handle local images (Auto Card Link always embeds local images within quotes)
        if (imagePath.startsWith('"') && imagePath.endsWith('"')) {
            let localPath = imagePath.slice(1, -1).trim();
            localPath = localPath.replace(/^\[\[|\]\]$/g, '');
            const fileExists = await this.app.vault.adapter.exists(localPath);
            if (!fileExists) {
                this.errorLog('Local image not found:', localPath);
                return {path: undefined, sourcePath: localPath};
            }
            
            // Process the local image if needed
            if (this.settings.cropAspectRatio || this.settings.maxDimension) {
                const processedPath = await this.processLocalImage(localPath, currentFeature);
                return {path: processedPath, sourcePath: localPath};
            }
            
            return {path: localPath, sourcePath: localPath};
        }
    
        // Handle external images
        if (!this.isValidUrl(imagePath)) {
            this.errorLog('Invalid Auto Card Link URL:', imagePath);
            return {path: undefined, sourcePath: imagePath};
        }
    
        return await this.downloadExternalImage(imagePath, currentFeature, 'autocardlink');
    }

    /**
     * Downloads an external image and saves it locally.
     * @param {string} imageUrl - The URL of the image to download.
     * @param {string | undefined} currentFeature - The current featured image.
     * @returns {Promise<{path: string | undefined, sourcePath: string}>} The path to the downloaded/processed image and the original URL.
     */
    private async downloadExternalImage(imageUrl: string, currentFeature: string | undefined, subfolder: string = 'external'): Promise<{path: string | undefined, sourcePath: string}> {
        // Normalize folder path
        const downloadFolder = normalizePath(`${this.settings.thumbnailDownloadFolder}/${subfolder}`);
        
        // Generate unique local filename from image URL
        const hashedFilename = this.generateHashedFilenameFromUrl(imageUrl);
        if (!hashedFilename) {
            this.errorLog('Failed to generate hashed filename for:', imageUrl);
            return {path: undefined, sourcePath: imageUrl};
        }

        // Store the source image URL for frontmatter
        const sourcePath = imageUrl;

        // Check if we need to do any processing
        const needsProcessing = this.settings.cropAspectRatio || this.settings.maxDimension;

        // Check if we already have a failed download marker for this URL
        const failedMarkerPath = `${downloadFolder}/${hashedFilename}.failed.png`;
        if (await this.app.vault.adapter.exists(failedMarkerPath)) {
            // Check if the failed marker is less than 12 hours old
            const stats = await this.app.vault.adapter.stat(failedMarkerPath);
            if (!stats) return {path: undefined, sourcePath};
            const markerAge = Date.now() - stats.mtime;
            const twelveHours = 12 * 60 * 60 * 1000;

            // If the marker is more than 12 hours old, remove it and try again
            if (markerAge < twelveHours) {
                this.debugLog('Skipping recently failed download:', imageUrl);
                return {path: failedMarkerPath, sourcePath};
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
            return {path: `${downloadFolder}/${hashedFilename}.jpg`, sourcePath};
        }

        try {
            // Create the download directory if it doesn't exist
            if (!(await this.app.vault.adapter.exists(downloadFolder))) {
                await this.app.vault.adapter.mkdir(downloadFolder);
            }

            // Check if the image already exists with any known extension
            const existingFilePath = await this.findExistingImageFile(downloadFolder, hashedFilename);
            
            // If we found an existing download and no processing is needed, return it
            if (existingFilePath && !needsProcessing) {
                return {path: existingFilePath, sourcePath};
            }

            // If we haven't downloaded yet, download the image
            let downloadPath = existingFilePath;
            if (!downloadPath) {
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

                downloadPath = `${downloadFolder}/${hashedFilename}.${extension}`;

                // Save the image
                await this.app.vault.adapter.writeBinary(downloadPath, response.arrayBuffer);
            }

            // Process the image if needed
            if (needsProcessing && downloadPath) {
                const processedFolder = `${this.settings.thumbnailDownloadFolder}/processed`;
                const processedPath = await this.processImage(downloadPath, processedFolder, hashedFilename);
                return {path: processedPath, sourcePath};
            }
            
            return {path: downloadPath, sourcePath};
        } catch (error) {
            this.errorLog('Failed to download image, error:', error);
            
            try {
                await this.app.vault.adapter.writeBinary(failedMarkerPath, FeaturedImage.FAILED_IMAGE_DATA.buffer);
                return {path: failedMarkerPath, sourcePath};
            } catch (writeError) {
                this.errorLog('Failed to write placeholder image:', writeError);
                return {path: undefined, sourcePath};
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
     * Process an image (crop and/or resize) according to settings
     * @param {string} inputPath - Path to the source image
     * @param {string} outputFolder - Folder to save the processed image
     * @param {string} outputFilename - Base filename for the processed image (without extension)
     * @returns {Promise<string>} Path to the processed image
     */
    private async processImage(inputPath: string, outputFolder: string, outputFilename: string): Promise<string> {
        if (this.settings.dryRun) {
            this.debugLog('Dry run: Skipping image processing');
            return `${outputFolder}/${outputFilename}.jpg`;
        }

        try {
            // Create output folder if it doesn't exist
            if (!(await this.app.vault.adapter.exists(outputFolder))) {
                await this.app.vault.adapter.mkdir(outputFolder);
            }

            // Read the input image as a buffer
            const imageData = await this.app.vault.adapter.readBinary(inputPath);
            let imageProcessor = sharp(imageData);
            
            // Get metadata to determine original dimensions
            const metadata = await imageProcessor.metadata();
            const originalWidth = metadata.width || 0;
            const originalHeight = metadata.height || 0;
            
            if (!originalWidth || !originalHeight) {
                throw new Error('Could not determine image dimensions');
            }

            // Apply cropping if specified
            if (this.settings.cropAspectRatio) {
                const [widthRatio, heightRatio] = this.settings.cropAspectRatio.split(':').map(Number);
                
                if (widthRatio && heightRatio) {
                    const targetRatio = widthRatio / heightRatio;
                    const originalRatio = originalWidth / originalHeight;
                    
                    let width, height, left, top;
                    
                    if (originalRatio > targetRatio) {
                        // Image is wider than target ratio - crop sides
                        height = originalHeight;
                        width = Math.round(height * targetRatio);
                        top = 0;
                        left = Math.round((originalWidth - width) / 2);
                    } else {
                        // Image is taller than target ratio - crop top/bottom
                        width = originalWidth;
                        height = Math.round(width / targetRatio);
                        left = 0;
                        top = Math.round((originalHeight - height) / 2);
                    }
                    
                    imageProcessor = imageProcessor.extract({ left, top, width, height });
                }
            }

            // Apply resize if specified
            if (this.settings.maxDimension && this.settings.maxDimension > 0) {
                imageProcessor = imageProcessor.resize({
                    width: this.settings.maxDimension,
                    height: this.settings.maxDimension,
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            // Get updated metadata after processing
            const processedMetadata = await imageProcessor.metadata();
            const processedWidth = processedMetadata.width || 0;
            const processedHeight = processedMetadata.height || 0;
            
            // Create filename with dimensions
            const fileExtension = metadata.format || 'jpg';
            const processedFilename = `${outputFilename}_${processedWidth}x${processedHeight}.${fileExtension}`;
            const outputPath = `${outputFolder}/${processedFilename}`;
            
            // Save the processed image
            const processedImageData = await imageProcessor.toBuffer();
            await this.app.vault.adapter.writeBinary(outputPath, processedImageData);
            
            return outputPath;
        } catch (error) {
            this.errorLog('Error processing image:', error);
            // Return original path if processing fails
            return inputPath;
        }
    }

    /**
     * Process a local image from the vault
     * @param {string} imagePath - Path to the original image in the vault
     * @param {string | undefined} currentFeature - Current featured image path
     * @returns {Promise<string>} Path to the processed image
     */
    private async processLocalImage(imagePath: string, currentFeature: string | undefined): Promise<string> {
        // Skip processing if no resize or crop is needed
        if (!this.settings.cropAspectRatio && !this.settings.maxDimension) {
            return imagePath;
        }
        
        try {
            // Check if the file exists
            const fileExists = await this.app.vault.adapter.exists(imagePath);
            if (!fileExists) {
                this.errorLog('Local image not found:', imagePath);
                return imagePath;
            }
            
            // Create a hashed name for the processed image
            const hashedName = createHash('md5').update(imagePath).digest('hex');
            const processedFolder = `${this.settings.thumbnailDownloadFolder}/processed`;
            
            return await this.processImage(imagePath, processedFolder, hashedName);
        } catch (error) {
            this.errorLog('Error processing local image:', error);
            return imagePath;
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
     * Updates the frontmatter of a file with the new featured image and source.
     * @param {TFile} file - The file to update.
     * @param {string | undefined} newFeature - The new featured image.
     * @param {string | undefined} newSource - The source of the new featured image.
     */
    private async updateFrontmatter(file: TFile, newFeature: string | undefined, newSource: string | undefined) {
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
                    const sourceProperty = `${this.settings.frontmatterProperty}-source`;
                    
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
                        
                        // Store the source path
                        if (newSource) {
                            frontmatter[sourceProperty] = newSource;
                        }
                    } else {
                        if (this.settings.keepEmptyProperty) {
                            frontmatter[this.settings.frontmatterProperty] = '';
                            frontmatter[sourceProperty] = '';
                        } else {
                            delete frontmatter[this.settings.frontmatterProperty];
                            delete frontmatter[sourceProperty];
                        }
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
     * @returns {Promise<{path: string | undefined, sourcePath: string}>} The path to the downloaded/processed thumbnail and the source video ID.
     */
    async downloadThumbnail(videoId: string, currentFeature: string | undefined): Promise<{path: string | undefined, sourcePath: string}> {
        // Create video URL for source tracking
        const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Normalize YouTube folder path
        const youtubeFolder = normalizePath(`${this.settings.thumbnailDownloadFolder}/youtube`);
        const expectedPath = `${youtubeFolder}/${videoId}`;
        
        // Check if we need to do any processing
        const needsProcessing = this.settings.cropAspectRatio || this.settings.maxDimension;
        
        // If we already have a feature set to the expected path and no processing is needed, return it
        if (currentFeature && currentFeature.startsWith(expectedPath) && !needsProcessing) {
            return {path: currentFeature, sourcePath: sourceUrl};
        }
        
        // Create the YouTube thumbnail directory if it doesn't exist
        if (!(await this.app.vault.adapter.exists(youtubeFolder))) {
            await this.app.vault.adapter.mkdir(youtubeFolder);
        }

        // Check if WebP thumbnail already exists
        const webpFilename = `${videoId}.webp`;
        const webpFilePath = `${youtubeFolder}/${webpFilename}`;
        let downloadPath: string | undefined;
        
        if (await this.app.vault.adapter.exists(webpFilePath)) {
            downloadPath = webpFilePath;
        } else {
            // Check if JPG thumbnail already exists
            const jpgFilename = `${videoId}.jpg`;
            const jpgFilePath = `${youtubeFolder}/${jpgFilename}`;
            if (await this.app.vault.adapter.exists(jpgFilePath)) {
                downloadPath = jpgFilePath;
            }
        }

        if (this.settings.dryRun) {
            this.debugLog('Dry run: Skipping thumbnail download, using mock path');
            return {path: `${youtubeFolder}/${videoId}.webp`, sourcePath: sourceUrl}; // Return a mock path
        }

        // If we don't have the thumbnail yet, download it
        if (!downloadPath) {
            // Try to download the thumbnail in WebP format if enabled
            if (this.settings.downloadWebP) {
                try {
                    const webpResponse = await this.fetchThumbnail(videoId, 'maxresdefault.webp');
                    if (webpResponse?.status === 200) {
                        await this.app.vault.adapter.writeBinary(webpFilePath, webpResponse.arrayBuffer);
                        downloadPath = webpFilePath;
                    }
                } catch (error) {
                    this.debugLog('Failed to download WebP thumbnail');
                }
            }

            // Fall back to JPG versions if WebP failed
            if (!downloadPath) {
                const jpgFilename = `${videoId}.jpg`;
                const jpgFilePath = `${youtubeFolder}/${jpgFilename}`;
                
                try {
                    const maxResResponse = await this.fetchThumbnail(videoId, 'maxresdefault.jpg');
                    if (maxResResponse?.status === 200) {
                        await this.app.vault.adapter.writeBinary(jpgFilePath, maxResResponse.arrayBuffer);
                        downloadPath = jpgFilePath;
                    }
                } catch (error) {
                    this.debugLog('Failed to download maxresdefault.jpg');
                }

                if (!downloadPath) {
                    try {
                        const hqDefaultResponse = await this.fetchThumbnail(videoId, 'hqdefault.jpg');
                        if (hqDefaultResponse?.status === 200) {
                            await this.app.vault.adapter.writeBinary(jpgFilePath, hqDefaultResponse.arrayBuffer);
                            downloadPath = jpgFilePath;
                        }
                    } catch (error) {
                        this.debugLog('Failed to download hqdefault.jpg:');
                    }
                }
            }
        }

        if (!downloadPath) {
            this.errorLog(`Thumbnail for video ${videoId} could not be downloaded`);
            return {path: undefined, sourcePath: sourceUrl};
        }

        // Process the thumbnail if needed
        if (needsProcessing) {
            const processedFolder = `${this.settings.thumbnailDownloadFolder}/processed`;
            const processedPath = await this.processImage(downloadPath, processedFolder, videoId);
            return {path: processedPath, sourcePath: sourceUrl};
        }
        
        return {path: downloadPath, sourcePath: sourceUrl};
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

        // If preserveTemplateImages is enabled, don't remove the featured image
        if (this.settings.preserveTemplateImages) {
            this.debugLog('Preserving existing featured image:', currentFeature);
            return false;
        }

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

}
