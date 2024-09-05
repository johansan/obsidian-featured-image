import { Plugin, Notice, TFile, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, FeaturedImageSettings, FeaturedImageSettingsTab } from './settings'
import { parse as parseUrl } from 'url';
import { parse as parseQueryString } from 'querystring';
import * as path from 'path';
import * as fs from 'fs';
import * as Jimp from 'jimp';

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

        console.log("Trying to download OpenGraph image");

        // If not Youtube or local image found, try to download using OpenGraph
        const openGraphMatch = content.match(/https?:\/\/[^\s]+/g);
        if (openGraphMatch) {
            console.log('OpenGraph match found');
            const url = openGraphMatch[1];
            return await this.downloadOpenGraphImage(url);
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

    // Crop Youtube thumbnails to 16x9
	async cropTo16x9(inputBuffer: Buffer): Promise<Buffer> {
		const image = await Jimp.default.read(inputBuffer);
		const width = image.getWidth();
		const height = image.getHeight();
		const newHeight = Math.round(width * 9 / 16);
		const top = Math.floor((height - newHeight) / 2);
	
		image.crop(0, top, width, newHeight);
		return await image.getBufferAsync(Jimp.MIME_JPEG);
	}

    async downloadThumbnail(videoId: string, thumbnailFolder: string): Promise<string | null> {
        const filename = `${videoId}.jpg`;
        const folderPath = path.join(this.app.vault.adapter.getBasePath(), thumbnailFolder);
        const fullFilePath = path.join(folderPath, filename);

        // Create the directory if it doesn't exist
        await fs.promises.mkdir(folderPath, { recursive: true });

        // Return the path if the file already exists
        if (fs.existsSync(fullFilePath)) {
            return path.join(thumbnailFolder, filename);
        }

        try {
            const maxResResponse = await this.fetchThumbnail(videoId, 'maxresdefault.jpg');
            if (maxResResponse.status === 200) {
                return await this.saveThumbnail(maxResResponse, fullFilePath, thumbnailFolder, filename);
            }

            const hqDefaultResponse = await this.fetchThumbnail(videoId, 'hqdefault.jpg');
            if (hqDefaultResponse.status === 200) {
                let imageBuffer = Buffer.from(await hqDefaultResponse.arrayBuffer);
                imageBuffer = await this.cropTo16x9(imageBuffer);
                return await this.saveThumbnail({ arrayBuffer: imageBuffer }, fullFilePath, thumbnailFolder, filename);
            }
        } catch (error) {
            console.error(`Failed to download thumbnail for ${videoId}:`, error);
        }

        return null;
    }

    private async fetchThumbnail(videoId: string, quality: string) {
        return await requestUrl({
            url: `https://img.youtube.com/vi/${videoId}/${quality}`,
            method: 'GET',
            headers: { 'Accept': 'image/jpeg' },
        });
    }

    private async saveThumbnail(response: { arrayBuffer: ArrayBuffer }, fullFilePath: string, thumbnailFolder: string, filename: string) {
        try {
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

    private async downloadOpenGraphImage(url: string): Promise<string | null> {
        try {
            console.log(url);
            const response = await requestUrl(url);
            console.log(response);
            const ogImage = response.text.match(/<meta property="og:image" content="([^"]+)"/i);
            console.log(ogImage);
            if (ogImage && ogImage[1]) {
                const imageUrl = ogImage[1];
                const filename = `og_${Date.now()}.jpg`;
                const downloadFolder = path.join(this.app.vault.adapter.getBasePath(), this.settings.openGraphDownloadFolder);
                
                console.log(downloadFolder);

                // Create the directory if it doesn't exist
                await fs.promises.mkdir(downloadFolder, { recursive: true });
                
                const fullFilePath = path.join(downloadFolder, filename);
                const imageResponse = await requestUrl({ url: imageUrl, method: 'GET' });
                await fs.promises.writeFile(fullFilePath, Buffer.from(imageResponse.arrayBuffer));
                return path.join(this.settings.openGraphDownloadFolder, filename);
            }
        } catch (error) {
            console.error(`Failed to download OpenGraph image for ${url}:`, error);
        }
        return null;
    }
}
