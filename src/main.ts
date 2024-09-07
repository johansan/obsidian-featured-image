import { debounce, Debouncer, normalizePath, Plugin, Notice, TFile, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab } from './settings'
import { parse as parseUrl } from 'url';
import { parse as parseQueryString } from 'querystring';

export default class FeaturedImage extends Plugin {
	settings: FeaturedImageSettings;
	private setFeaturedImageDebounced: Debouncer<[TFile], void>;

	async onload() {
		await this.loadSettings();
		this.setFeaturedImageDebounced = debounce(
            // Debounce to ignore updates we make to frontmatter
			(file: TFile) => this.setFeaturedImage(file),
			500,
			true
		);
		this.registerModifyEvents();
		this.addSettingTab(new FeaturedImageSettingsTab(this.app, this));
	}

	private registerModifyEvents() {
		this.registerEvent(
			this.app.vault.on('modify', (file: TFile) => {
				if (file instanceof TFile) {
					this.setFeaturedImageDebounced(file);
				}
			})
		);
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
        const currentFeature = this.getCurrentFeature(file);
        
        if (await this.shouldSkipProcessing(file, currentFeature)) {
            return;
        }

        const fileContent = await this.app.vault.cachedRead(file);
        const newFeature = await this.findFeaturedImageInDocument(fileContent);

        if (currentFeature !== newFeature) {
            await this.updateFrontmatter(file, newFeature);
        }
    }

    private getCurrentFeature(file: TFile): string | undefined {
        const cache = this.app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.[this.settings.frontmatterProperty];
    }

    private async shouldSkipProcessing(file: TFile, currentFeature: string | undefined): Promise<boolean> {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        // Check for the excalidraw tag
        const hasExcalidrawTag = frontmatter?.tags?.includes('excalidraw') || false;

        return (
            hasExcalidrawTag ||
            (this.settings.onlyUpdateExisting && !currentFeature) ||
            this.settings.excludedFolders.some((folder: string) => file.path.startsWith(folder + '/'))
        );
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
            `\\[.*?\\]\\((https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\\S+)\\)` +
            `)`,
            'i'
        );

        const match = content.match(combinedRegex);
        if (match) {
            if (match[2] || match[4]) {
                // It's an image link (wiki-style or Markdown-style)
                const imagePath = match[2] || match[4];
                return imagePath ? decodeURIComponent(imagePath) : undefined;
            } else if (match[5]) {
                // It's a YouTube link
                const videoId = this.getVideoId(match[5]);
                return videoId ? await this.downloadThumbnail(videoId, this.settings.youtubeDownloadFolder) : undefined;
            }
        }

        return undefined;
    }

    private async updateFrontmatter(file: TFile, newFeature: string | undefined) {

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            if (newFeature) {
                frontmatter[this.settings.frontmatterProperty] = newFeature;
                new Notice(`Featured image set to ${newFeature}`);
            } else {
                delete frontmatter[this.settings.frontmatterProperty];
                new Notice('Featured image removed');
            }
        });
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

        try {
            // Try to download the thumbnail in WebP format if enabled
            if (this.settings.downloadWebP) {
                const webpResponse = await this.fetchThumbnail(videoId, 'maxresdefault.webp', true);
                if (webpResponse.status === 200) {
                    return await this.saveThumbnail(webpResponse, webpFilePath, thumbnailFolder, webpFilename);
                }
            }

            // Fall back to JPG versions
            const maxResResponse = await this.fetchThumbnail(videoId, 'maxresdefault.jpg');
            if (maxResResponse.status === 200) {
                return await this.saveThumbnail(maxResResponse, jpgFilePath, thumbnailFolder, jpgFilename);
            }

            const hqDefaultResponse = await this.fetchThumbnail(videoId, 'hqdefault.jpg');
            if (hqDefaultResponse.status === 200) {
                return await this.saveThumbnail(hqDefaultResponse, jpgFilePath, thumbnailFolder, jpgFilename);
            }
        } catch (error) {
            console.error(`Failed to download thumbnail for ${videoId}:`, error);
        }

        return undefined;
    }

    private async fetchThumbnail(videoId: string, quality: string, isWebp: boolean = false) {
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
            return pathname.split('/')[1].split('?')[0];
        }

        if (hostname === 'youtube.com' || hostname === 'www.youtube.com') {
            if (pathname === '/watch') {
                return query.v as string;
            }
            if (pathname.startsWith('/embed/') || pathname.startsWith('/v/')) {
                return pathname.split('/')[2];
            }
        }

        return null;
    }

}
