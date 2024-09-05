import { Plugin, Notice, TFile, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab } from './settings'
import { parse as parseUrl } from 'url';
import { parse as parseQueryString } from 'querystring';
import * as path from 'path';
import * as fs from 'fs';

export default class FeaturedImage extends Plugin {
	settings: FeaturedImageSettings;

	async onload() {
        await this.loadSettings();

        this.registerEvent(
            this.app.vault.on('modify', (file: TFile) => {
                if (file instanceof TFile) {
                    this.setFeaturedImage(file);
                }
            })
        );

		// Add settings tab
		this.addSettingTab(new FeaturedImageSettingsTab(this.app, this));
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
        let currentFeature = null;

        // Don't use metadataCache since it is not updated properly when file is modified, causing multiple updates
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            currentFeature = frontmatter?.[this.settings.frontmatterProperty];
        });

        if (this.shouldSkipProcessing(file, currentFeature)) {
            return;
        }

        const content = await this.app.vault.read(file);
        const newFeature = await this.findFeaturedImageInDocument(content);

        if (currentFeature !== newFeature) {
            await this.updateFrontmatter(file, newFeature);
        }
    }

    private shouldSkipProcessing(file: TFile, currentFeature: string | null): boolean {
        return (
            (this.settings.onlyUpdateExisting && !currentFeature) ||
            this.settings.excludedFolders.some((folder: string) => file.path.startsWith(folder + '/'))
        );
    }

    private async findFeaturedImageInDocument(content: string): Promise<string | null> {
        // Check for Youtube links
        const youtubeMatch = content.match(/\[.*?\]\((https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\S+)\)/);
        if (youtubeMatch) {
            const videoId = this.getVideoId(youtubeMatch[1]);
            return videoId ? await this.downloadThumbnail(videoId, this.settings.youtubeDownloadFolder) : null;
        }

        // If no Youtube link is found, check for local images
        const imageMatch = content.match(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|bmp|svg))(?:\|[^\]]*)?\]\]/i);
        if (imageMatch) {   
            return imageMatch[1];
        }

        return null;
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

    async downloadThumbnail(videoId: string, thumbnailFolder: string): Promise<string | null> {
        const jpgFilename = `${videoId}.jpg`;
        const folderPath = path.join(this.app.vault.adapter.getBasePath(), thumbnailFolder);
        const jpgFilePath = path.join(folderPath, jpgFilename);

        // Only define webp variables if downloadWebP is enabled
        let webpFilename, webpFilePath;
        if (this.settings.downloadWebP) {
            webpFilename = `${videoId}.webp`;
            webpFilePath = path.join(folderPath, webpFilename);
        }

        // Create the directory if it doesn't exist
        await fs.promises.mkdir(folderPath, { recursive: true });

        // Return the path if the file already exists
        if (this.settings.downloadWebP && fs.existsSync(webpFilePath)) {
            return path.join(thumbnailFolder, webpFilename);
        }
        if (fs.existsSync(jpgFilePath)) {
            return path.join(thumbnailFolder, jpgFilename);
        }

        try {
            // Check for WEBP version first if downloadWebP is enabled
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

        return null;
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
            return null;
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
