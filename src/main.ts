import { normalizePath, Plugin, Notice, TFile, requestUrl, debounce } from 'obsidian';
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab } from './settings'
import { parse as parseUrl } from 'url';
import { parse as parseQueryString } from 'querystring';

export default class FeaturedImage extends Plugin {
	settings: FeaturedImageSettings;
	private debugMode: boolean = true;
	private setFeaturedImageDebounced: (file: TFile) => void;
	private isUpdatingFrontmatter: boolean = false;

	async onload() {
		await this.loadSettings();
		this.debugLog('Plugin loaded, debug mode:', this.debugMode);

        // Make sure setFeaturedImage is not called more than once every second
		this.setFeaturedImageDebounced = debounce(this.setFeaturedImage.bind(this), 1000, true);

        // Ignore all file changes if we are currently updating the frontmatter section
		this.registerEvent(
			this.app.vault.on('modify', (file: TFile) => {
				if (file instanceof TFile && !this.isUpdatingFrontmatter) {
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

    async setFeaturedImage(file: TFile) {
        this.debugLog('File modified:', file.path);
        const currentFeature = this.getCurrentFeature(file);
        this.debugLog('Current feature:', currentFeature);
        
        if (await this.shouldSkipProcessing(file, currentFeature)) {
            this.debugLog('Skipping processing for file:', file.path);
            return;
        }

        const fileContent = await this.app.vault.cachedRead(file);
        const newFeature = await this.findFeaturedImageInDocument(fileContent);
        this.debugLog('Featured image found:', newFeature);

        if (currentFeature !== newFeature) {
            this.debugLog('Updating frontmatter');
            await this.updateFrontmatter(file, newFeature);
        } else {
            this.debugLog('No change in feature, skipping frontmatter update');
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
        this.debugLog('shouldSkipProcessing:', shouldSkip, 'for file:', file.path);
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
            `!\\[.*?\\]\\((https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\\S+)\\)` +
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

        this.debugLog('findFeaturedImageInDocument result:', match ? (match[2] || match[4] || match[5]) : undefined);
        return undefined;
    }

    private async updateFrontmatter(file: TFile, newFeature: string | undefined) {
        this.debugLog('Updating frontmatter for file:', file.path, 'newFeature:', newFeature);
        this.isUpdatingFrontmatter = true;
        try {
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                if (newFeature) {
                    frontmatter[this.settings.frontmatterProperty] = newFeature;
                    new Notice(`Featured image set to ${newFeature}`);
                } else {
                    delete frontmatter[this.settings.frontmatterProperty];
                    new Notice('Featured image removed');
                }
            });
        } finally {
            this.isUpdatingFrontmatter = false;
        }
    }

    async downloadThumbnail(videoId: string, thumbnailFolder: string): Promise<string | undefined> {
        this.debugLog('downloadThumbnail called', 'videoId:', videoId, 'folder:', thumbnailFolder);
        // Create the thumbnail directory if it doesn't exist
        await this.app.vault.adapter.mkdir(thumbnailFolder);

        // Check if WebP thumbnail already exists
        const webpFilename = `${videoId}.webp`;
        const webpFilePath = normalizePath(`${thumbnailFolder}/${webpFilename}`);
        if (await this.app.vault.adapter.exists(webpFilePath)) {
            this.debugLog('downloadThumbnail result:', webpFilePath);
            return webpFilePath;
        }

        // Check if JPG thumbnail already exists
        const jpgFilename = `${videoId}.jpg`;
        const jpgFilePath = normalizePath(`${thumbnailFolder}/${jpgFilename}`);
        if (await this.app.vault.adapter.exists(jpgFilePath)) {
            this.debugLog('downloadThumbnail result:', jpgFilePath);
            return jpgFilePath;
        }

        try {
            // Try to download the thumbnail in WebP format if enabled
            if (this.settings.downloadWebP) {
                const webpResponse = await this.fetchThumbnail(videoId, 'maxresdefault.webp', true);
                if (webpResponse.status === 200) {
                    const result = await this.saveThumbnail(webpResponse, webpFilePath, thumbnailFolder, webpFilename);
                    this.debugLog('downloadThumbnail result:', result);
                    return result;
                }
            }

            // Fall back to JPG versions
            const maxResResponse = await this.fetchThumbnail(videoId, 'maxresdefault.jpg');
            if (maxResResponse.status === 200) {
                const result = await this.saveThumbnail(maxResResponse, jpgFilePath, thumbnailFolder, jpgFilename);
                this.debugLog('downloadThumbnail result:', result);
                return result;
            }

            const hqDefaultResponse = await this.fetchThumbnail(videoId, 'hqdefault.jpg');
            if (hqDefaultResponse.status === 200) {
                const result = await this.saveThumbnail(hqDefaultResponse, jpgFilePath, thumbnailFolder, jpgFilename);
                this.debugLog('downloadThumbnail result:', result);
                return result;
            }
        } catch (error) {
            console.error(`Failed to download thumbnail for ${videoId}:`, error);
        }

        this.debugLog('downloadThumbnail result:', undefined);
        return undefined;
    }

    private async fetchThumbnail(videoId: string, quality: string, isWebp: boolean = false) {
        this.debugLog('fetchThumbnail called', 'videoId:', videoId, 'quality:', quality, 'isWebp:', isWebp);
        const baseUrl = isWebp ? 'https://i.ytimg.com/vi_webp' : 'https://img.youtube.com/vi';
        return await requestUrl({
            url: `${baseUrl}/${videoId}/${quality}`,
            method: 'GET',
            headers: { 'Accept': isWebp ? 'image/webp' : 'image/jpeg' },
        });
    }

    private async saveThumbnail(response: { arrayBuffer: ArrayBuffer }, fullFilePath: string, thumbnailFolder: string, filename: string) {
        this.debugLog('saveThumbnail called', 'path:', fullFilePath);
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
        this.debugLog('getVideoId called', 'url:', url);
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
                this.debugLog('getVideoId result:', result);
                return result;
            }
            if (pathname.startsWith('/embed/') || pathname.startsWith('/v/')) {
                const result = pathname.split('/')[2];
                this.debugLog('getVideoId result:', result);
                return result;
            }
        }

        this.debugLog('getVideoId result:', null);
        return null;
    }

}
