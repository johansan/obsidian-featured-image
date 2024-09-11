import { normalizePath, Plugin, Notice, TFile, requestUrl, debounce, Modal, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab } from './settings'
import { ConfirmationModal, WelcomeModal } from './modals';
import { parse as parseUrl } from 'url';
import { parse as parseQueryString } from 'querystring';

export default class FeaturedImage extends Plugin {
	settings: FeaturedImageSettings;
	private setFeaturedImageDebounced: (file: TFile) => void;
	private isUpdatingFrontmatter: boolean = false;
	private isRunningBulkUpdate: boolean = false;
    private hasShownWelcomeModal: boolean = false;

    // Developer options
	private debugMode: boolean = true;
	private dryRun: boolean = false;

	async onload() {
		await this.loadSettings();
		this.debugLog('Plugin loaded, debug mode:', this.debugMode, 'dry run:', this.dryRun);

        // Load the welcome modal state
        const data = await this.loadData();
        this.hasShownWelcomeModal = data?.hasShownWelcomeModal || false;

        // Show welcome modal if it's the first time
        if (!this.hasShownWelcomeModal) {
            this.showWelcomeModal();
            this.hasShownWelcomeModal = true;
            await this.saveData({ hasShownWelcomeModal: true });
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

	private debugLog(...args: any[]) {
		if (this.debugMode) {
			const timestamp = new Date().toTimeString().split(' ')[0];
			console.log(`${timestamp} [FeaturedImage]`, ...args);
		}
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

    async setFeaturedImage(file: TFile): Promise<boolean> {
        const currentFeature = this.getCurrentFeature(file);
        
        if (await this.shouldSkipProcessing(file, currentFeature)) {
            return false;
        }

        const fileContent = await this.app.vault.cachedRead(file);
        const newFeature = await this.findFeaturedImageInDocument(fileContent);

        if (currentFeature !== newFeature) {
            this.debugLog(file.path);
            this.debugLog('Current feature:', currentFeature);
            this.debugLog('New feature:', newFeature);
            await this.updateFrontmatter(file, newFeature);
            return true;
        } else {
            return false;
        }
    }

    private getCurrentFeature(file: TFile): string | undefined {
        const cache = this.app.metadataCache.getFileCache(file);
        const feature = cache?.frontmatter?.[this.settings.frontmatterProperty];
        return feature;
    }

    private async shouldSkipProcessing(file: TFile, currentFeature: string | undefined): Promise<boolean> {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        // Check for the excalidraw tag
        const hasExcalidrawTag = frontmatter?.tags?.includes('excalidraw') || false;

        const shouldSkip = (
            hasExcalidrawTag ||
            (this.settings.onlyUpdateExisting && !currentFeature) ||
            this.settings.excludedFolders.some((folder: string) => file.path.startsWith(folder + '/'))
        );
        return shouldSkip;
    }

    private async findFeaturedImageInDocument(content: string): Promise<string | undefined> {
        // Combined regex for wiki-style images, Markdown-style images, and YouTube links
        const combinedRegex = new RegExp(
            `(` +
            // Wiki-style image link
            `!\\[\\[([^\\]]+\\.(${this.settings.imageExtensions.join('|')}))(?:\\|[^\\]]*)?\\]\\]` +
            `|` +
            // Markdown-style image link
            `!\\[.*?\\]\\(([^)]+\\.(${this.settings.imageExtensions.join('|')}))\\)` +
            `|` +
            // YouTube link
            `${this.settings.requireExclamationForYoutube ? '!' : '!?'}\\[.*?\\]\\((https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\\S+)\\)` +
            `)`,
            'i'
        );

        const match = content.match(combinedRegex);
        if (match) {
            if (match[2] || match[4]) {
                // It's an image link (wiki-style or Markdown-style)
                const imagePath = match[2] || match[4];
                return imagePath ? decodeURIComponent(imagePath) : undefined;
            } else if (match[6]) {
                // It's a YouTube link
                const videoId = this.getVideoId(match[6]);
                return videoId ? await this.downloadThumbnail(videoId, this.settings.youtubeDownloadFolder) : undefined;
            }
        }

        return undefined;
    }

    private async updateFrontmatter(file: TFile, newFeature: string | undefined) {
        this.isUpdatingFrontmatter = true;
        try {
            if (this.dryRun) {
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

    async downloadThumbnail(videoId: string, thumbnailFolder: string): Promise<string | undefined> {
        
        // Create the thumbnail directory if it doesn't exist
        await this.app.vault.adapter.mkdir(thumbnailFolder);

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

        if (this.dryRun) {
            this.debugLog('Dry run: Skipping thumbnail download, using mock path');
            return `${thumbnailFolder}/${videoId}.webp`; // Return a mock path
        }

        // Try to download the thumbnail in WebP format if enabled
        if (this.settings.downloadWebP) {
            try {
                const webpResponse = await this.fetchThumbnail(videoId, 'maxresdefault.webp');
                if (webpResponse.status === 200) {
                    const result = await this.saveThumbnail(webpResponse, webpFilePath, thumbnailFolder, webpFilename);
                    this.debugLog('Downloaded WebP thumbnail');
                    return result;
                }
            } catch (error) {
                this.debugLog('Failed to download WebP thumbnail');
            }
        }

        // Fall back to JPG versions
        try {
            const maxResResponse = await this.fetchThumbnail(videoId, 'maxresdefault.jpg');
            if (maxResResponse.status === 200) {
                const result = await this.saveThumbnail(maxResResponse, jpgFilePath, thumbnailFolder, jpgFilename);
                this.debugLog('Downloaded maxresdefault.jpg');
                return result;
            }
        } catch (error) {
            this.debugLog('Failed to download maxresdefault.jpg');
        }

        try {
            const hqDefaultResponse = await this.fetchThumbnail(videoId, 'hqdefault.jpg');
            if (hqDefaultResponse.status === 200) {
                const result = await this.saveThumbnail(hqDefaultResponse, jpgFilePath, thumbnailFolder, jpgFilename);
                this.debugLog('Downloaded hqdefault.jpg');
                return result;
            }
        } catch (error) {
            this.debugLog('Failed to download hqdefault.jpg:');
        }

        this.debugLog('!! Thumbnail could not be downloaded !!');
        return undefined;
    }

    private async fetchThumbnail(videoId: string, quality: string) {
        const isWebp = quality.endsWith('.webp');
        const baseUrl = isWebp ? 'https://i.ytimg.com/vi_webp' : 'https://img.youtube.com/vi';
        return await requestUrl({
            url: `${baseUrl}/${videoId}/${quality}`,
            method: 'GET',
            headers: { 'Accept': isWebp ? 'image/webp' : 'image/jpeg' },
        });
    }

    private async saveThumbnail(response: { arrayBuffer: ArrayBuffer }, fullFilePath: string, thumbnailFolder: string, filename: string) {
        
        try {
            // Save thumbnail using Obsidian's API
            await this.app.vault.adapter.writeBinary(fullFilePath, response.arrayBuffer);
            return normalizePath(`${thumbnailFolder}/${filename}`);
        } catch (error) {
            console.error(`Error writing file: ${error}`);
            return undefined;
        }
    }

    getVideoId(url: string): string | null {
        const parsedUrl = parseUrl(url);
        const hostname = parsedUrl.hostname;
        const pathname = parsedUrl.pathname || '';
        const query = parseQueryString(parsedUrl.query || '');

        if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
            const result = pathname.split('/')[1].split('?')[0];
            return result;
        }

        if (hostname === 'youtube.com' || hostname === 'www.youtube.com') {
            if (pathname === '/watch') {
                const result = query.v as string;
                return result;
            }
            if (pathname.startsWith('/embed/') || pathname.startsWith('/v/')) {
                const result = pathname.split('/')[2];
                return result;
            }
        }

        return null;
    }

    async updateAllFeaturedImages() {
        const confirmation = await this.showConfirmationModal(
            'Update All Featured Images',
            'This will scan all markdown files in your vault and update or add featured images based on the first image or YouTube link found in each file. Proceed?'
        );
        if (!confirmation) return;

        this.isRunningBulkUpdate = true;
        new Notice(`Starting ${this.dryRun ? 'dry run of ' : ''}bulk update of featured images...`);

        const files = this.app.vault.getMarkdownFiles();
        let updatedCount = 0;

        for (const file of files) {
            const wasUpdated = await this.setFeaturedImage(file);
            if (wasUpdated) {
                updatedCount++;
            }
        }

        this.isRunningBulkUpdate = false;
        new Notice(`Finished ${this.dryRun ? 'dry run of ' : ''}updating featured images for ${updatedCount} files.`);
    }

    async removeAllFeaturedImages() {
        const confirmation = await this.showConfirmationModal(
            'Remove All Featured Images',
            `This will remove the "${this.settings.frontmatterProperty}" property from the frontmatter of all markdown files in your vault. Proceed?`
        );
        if (!confirmation) return;

        this.isRunningBulkUpdate = true;
        new Notice(`Starting ${this.dryRun ? 'dry run of ' : ''}removal of featured images from all files...`);

        const files = this.app.vault.getMarkdownFiles();
        let removedCount = 0;

        for (const file of files) {
            const wasRemoved = await this.removeFeaturedImage(file);
            if (wasRemoved) {
                removedCount++;
            }
        }

        this.isRunningBulkUpdate = false;
        new Notice(`Finished ${this.dryRun ? 'dry run of ' : ''}removing featured images from ${removedCount} files.`);
    }

    async removeFeaturedImage(file: TFile): Promise<boolean> {
        const currentFeature = this.getCurrentFeature(file);
        if (!currentFeature) {
            return false; // No featured image to remove
        }

        this.debugLog('Removing featured image from file:', file.path);
        await this.updateFrontmatter(file, undefined);
        return true;
    }

    private async showConfirmationModal(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            new ConfirmationModal(this.app, title, message, (result) => {
                resolve(result);
            }).open();
        });
    }

    private showWelcomeModal() {
        new WelcomeModal(this.app, this.settings).open();
    }

}
