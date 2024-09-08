import { normalizePath, Plugin, Notice, TFile, requestUrl, debounce, Modal, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab } from './settings'
import { parse as parseUrl } from 'url';
import { parse as parseQueryString } from 'querystring';

export default class FeaturedImage extends Plugin {
	settings: FeaturedImageSettings;
	private setFeaturedImageDebounced: (file: TFile) => void;
	private isUpdatingFrontmatter: boolean = false;
	private isRunningBulkUpdate: boolean = false;
    private hasShownWelcomeModal: boolean = false;

    // Debug options for development
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

		this.addSettingTab(new FeaturedImageSettingsTab(this.app, this).setId('featured-image'));
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
        this.debugLog('----------');
        this.debugLog(file.path);
        this.debugLog('Current feature:', currentFeature);
        
        if (await this.shouldSkipProcessing(file, currentFeature)) {
            this.debugLog('Skipping processing - file excluded');
            return false;
        }

        const fileContent = await this.app.vault.cachedRead(file);
        const newFeature = await this.findFeaturedImageInDocument(fileContent);
        this.debugLog('Featured image found:', newFeature);

        if (currentFeature !== newFeature) {
            this.debugLog('Updating frontmatter for file:', file.path, 'newFeature:', newFeature);
            await this.updateFrontmatter(file, newFeature);
            return true;
        } else {
            this.debugLog('No change in feature, skipping frontmatter update');
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
                this.debugLog('Feature in document:', imagePath);
                return imagePath ? decodeURIComponent(imagePath) : undefined;
            } else if (match[6]) {
                // It's a YouTube link
                const videoId = this.getVideoId(match[6]);
                this.debugLog('YouTube video in document:', videoId);
                return videoId ? await this.downloadThumbnail(videoId, this.settings.youtubeDownloadFolder) : undefined;
            }
        }

        this.debugLog('New feature: Not found in document');
        return undefined;
    }

    private async updateFrontmatter(file: TFile, newFeature: string | undefined) {
        this.isUpdatingFrontmatter = true;
        try {
            if (this.dryRun) {
                this.debugLog('Dry run: Skipping frontmatter update');
                if (!this.isRunningBulkUpdate) {
                    new Notice(`Dry run: Would ${newFeature ? 'set' : 'remove'} featured image ${newFeature ? `to ${newFeature}` : ''}`);
                }
            } else {
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    if (newFeature) {
                        frontmatter[this.settings.frontmatterProperty] = newFeature;
                        if (!this.isRunningBulkUpdate) {
                            new Notice(`Featured image set to ${newFeature}`);
                        }
                    } else {
                        delete frontmatter[this.settings.frontmatterProperty];
                        if (!this.isRunningBulkUpdate) {
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
            this.debugLog('Thumbnail already exists:', webpFilePath);
            return webpFilePath;
        }

        // Check if JPG thumbnail already exists
        const jpgFilename = `${videoId}.jpg`;
        const jpgFilePath = normalizePath(`${thumbnailFolder}/${jpgFilename}`);
        if (await this.app.vault.adapter.exists(jpgFilePath)) {
            this.debugLog('Thumbnail already exists:', jpgFilePath);
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
            this.debugLog('getVideoId result:', result);
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
            const modal = new Modal(this.app);
            modal.titleEl.setText(title);
            
            const contentEl = modal.contentEl;
            contentEl.empty();
            
            contentEl.createEl('p', { text: message });
            
            // Add warning text
            const warningEl = contentEl.createEl('p', { cls: 'featured-image-warning' });
            warningEl.innerHTML = '<strong>Important!</strong> This function will change the modification date of all files that have been processed. This will change your sort order if you sort by modified date.';
            
            // Add some basic styling to make the warning stand out
            warningEl.style.backgroundColor = '#ffeb3b';
            warningEl.style.padding = '10px';
            warningEl.style.borderRadius = '5px';
            warningEl.style.marginTop = '10px';

            modal.addButton((btn) => 
                btn.setButtonText('Cancel').onClick(() => {
                    resolve(false);
                    modal.close();
                })
            );
            modal.addButton((btn) =>
                btn.setButtonText('Proceed').setCta().onClick(() => {
                    resolve(true);
                    modal.close();
                })
            );
            modal.open();
        });
    }

    private showWelcomeModal() {
        const modal = new Modal(this.app);
        modal.titleEl.setText('Welcome to Featured Image');
        
        const content = modal.contentEl;
        content.empty();
        
        content.createEl('p', { text: 'Featured Image is a highly optimized plugin for Obsidian to automatically set a featured image property in your notes based on the first image or YouTube link in the document.' });
        content.createEl('p', { text: 'You can use Featured Image together with plugins like Folder Notes and Dataview to create amazing galleries and lists of your notes.' });
        
        content.createEl('h4', { text: 'Key Features:' });
        const featureList = content.createEl('ul');
        featureList.createEl('li', { text: 'Automatically updates Frontmatter with a featured image' });
        featureList.createEl('li', { text: 'Supports both local images and YouTube thumbnails' });
        featureList.createEl('li', { text: 'Bulk update commands for all documents, search for "Featured Image" in the command palette' });
        featureList.createEl('li', { text: 'Uses very little memory and is highly optimized for performance' });
        featureList.createEl('li', { text: 'Works on both mobile and desktop' });
        
        content.createEl('h4', { text: 'Settings you might want to change:' });
        const settingsList = content.createEl('ul');
        settingsList.createEl('li', { text: 'Frontmatter property name: ' + this.settings.frontmatterProperty });
        settingsList.createEl('li', { text: 'YouTube download folder: ' + this.settings.youtubeDownloadFolder });
        settingsList.createEl('li', { text: 'Excluded folders: Set this to your template folder or other folders you don\'t want to include for processing.'});
        settingsList.createEl('li', { text: 'Require "!" for YouTube links: Only use Youtube links for featured image if they are prefixed with "!".'});

        content.createEl('p', { text: 'To get started, review the settings first and set excluded folders and the property name, then consider running "Set featured images in all files" command to update all your existing documents.' });
        
        modal.open();
    }

}
