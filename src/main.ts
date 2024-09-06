import { Plugin, Notice, TFile, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab } from './settings'
import { parse as parseUrl } from 'url';
import { parse as parseQueryString } from 'querystring';
import * as path from 'path';
import * as fs from 'fs';

export default class FeaturedImage extends Plugin {
	settings: FeaturedImageSettings;
	private hasRegisteredKeyEvents: boolean = false;

    private isExcludedKey(key: string): boolean {
        return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', 'Home', 'End', 'PageUp', 'PageDown'].includes(key);
    }
    
	async onload() {
		await this.loadSettings();
		this.registerKeyboardEvents();
		this.registerModifyEvents();
		this.addSettingTab(new FeaturedImageSettingsTab(this.app, this));
	}

	private registerKeyboardEvents() {
		this.registerDomEvent(document, 'keydown', (ev) => {
			if (this.isValidKeyEvent(ev)) {
                    // For future use : Find the active TFile inside the editor view
                    // @ts-ignore
                    // const file = ev.view.app.workspace.activeEditor.file
                    this.hasRegisteredKeyEvents = true;
			}
		});
	}

	private isValidKeyEvent(ev: KeyboardEvent): boolean {
        // Exclude keys that should not trigger the event
		return !this.isExcludedKey(ev.key) && 
                // Verify that the typing event happened in the editor DOM element
			   // @ts-ignore
			   ev.target.closest('.markdown-source-view .cm-editor') !== null;
	}

	private registerModifyEvents() {
		this.registerEvent(
			this.app.vault.on('modify', (file: TFile) => {
				if (file instanceof TFile && this.hasRegisteredKeyEvents) {
					this.hasRegisteredKeyEvents = false;
					this.setFeaturedImage(file);
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
        const currentFeature = await this.getCurrentFeature(file);
        
        if (await this.shouldSkipProcessing(file, currentFeature)) {
            return;
        }

        const content = await this.app.vault.read(file);
        const newFeature = await this.findFeaturedImageInDocument(content);

        if (currentFeature !== newFeature) {
            await this.updateFrontmatter(file, newFeature);
        }
    }

    private async getCurrentFeature(file: TFile): Promise<string | undefined> {
        let currentFeature: string | undefined;
        // Don't use metadataCache since it is not updated properly when file is modified, potentially causing multiple updates
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            currentFeature = frontmatter?.[this.settings.frontmatterProperty];
        });
        return currentFeature;
    }

    private async shouldSkipProcessing(file: TFile, currentFeature: string | undefined): Promise<boolean> {
        // Check for the excalidraw tag
        let hasExcalidrawTag = false;
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            if (frontmatter.tags && frontmatter.tags.includes('excalidraw')) {
                hasExcalidrawTag = true;
            }
        });

        return (
            hasExcalidrawTag ||
            (this.settings.onlyUpdateExisting && !currentFeature) ||
            this.settings.excludedFolders.some((folder: string) => file.path.startsWith(folder + '/'))
        );
    }

    private async findFeaturedImageInDocument(content: string): Promise<string | undefined> {
        // Check for Youtube links first
        const youtubeMatch = content.match(/\[.*?\]\((https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\S+)\)/);
        if (youtubeMatch) {
            const videoId = this.getVideoId(youtubeMatch[1]);
            return videoId ? await this.downloadThumbnail(videoId, this.settings.youtubeDownloadFolder) : undefined;
        }

        // Combined regex for both wiki-style and Markdown-style image links
        const combinedImageRegex = new RegExp(
            `(` +
            // Wiki-style image link
            `!\\[\\[([^\\]]+\\.(${this.settings.imageExtensions.join('|')}))(?:\\|[^\\]]*)?\\]\\]` +
            `|` +
            // Markdown-style image link
            `!\\[.*?\\]\\(([^)]+\\.(${this.settings.imageExtensions.join('|')}))\\)` +
            `)`,
            'i'
        );
        const imageMatch = content.match(combinedImageRegex);
        if (imageMatch) {
            // If it's a wiki-style link, use group 2, otherwise use group 4
            const imagePath = imageMatch[2] || imageMatch[4];
            return imagePath ? decodeURIComponent(imagePath) : undefined;
        }

        return undefined;
    }

    private async updateFrontmatter(file: TFile, newFeature: string | null) {

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
        // @ts-ignore
        const folderPath = path.join(this.app.vault.adapter.getBasePath(), thumbnailFolder);
        await fs.promises.mkdir(folderPath, { recursive: true });

        // Check if WebP thumbnail already exists
        const webpFilename = `${videoId}.webp`;
        const webpFilePath = path.join(folderPath, webpFilename);
        if (fs.existsSync(webpFilePath)) {
            return path.join(thumbnailFolder, webpFilename);
        }

        // Check if JPG thumbnail already exists
        const jpgFilename = `${videoId}.jpg`;
        const jpgFilePath = path.join(folderPath, jpgFilename);
        if (fs.existsSync(jpgFilePath)) {
            return path.join(thumbnailFolder, jpgFilename);
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
            // Save thumbnail
            await fs.promises.writeFile(fullFilePath, Buffer.from(response.arrayBuffer));
            return path.join(thumbnailFolder, filename);
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
