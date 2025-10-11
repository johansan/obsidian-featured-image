import { App, Notice, TFile, normalizePath } from 'obsidian';
import { FeaturedImageSettings } from '../settings';
import { FeatureScanner } from './feature-scanner';
import { ThumbnailService } from '../thumbnails/thumbnail-service';

type LoggerFn = (...args: unknown[]) => void;

type ConfirmFunction = (title: string, message: string, showPreservationNote?: boolean) => Promise<boolean>;

interface ImageMaintenanceDeps {
    featureScanner: FeatureScanner;
    thumbnailService: ThumbnailService;
    debugLog: LoggerFn;
    errorLog: LoggerFn;
    trashFileAtPath: (path: string) => Promise<boolean>;
}

interface RerenderThumbnailsOptions {
    confirm: ConfirmFunction;
    startBulkUpdate: () => void;
    endBulkUpdate: () => void;
    getFeatureFromFrontmatter: (file: TFile) => string | undefined;
    updateFrontmatter: (file: TFile, newFeature: string | undefined, newThumbnail?: string | undefined) => Promise<void>;
}

/**
 * Coordinates image maintenance operations such as cleanup and thumbnail regeneration.
 */
export class ImageMaintenanceService {
    private settings: FeaturedImageSettings;

    constructor(
        private readonly app: App,
        settings: FeaturedImageSettings,
        private readonly deps: ImageMaintenanceDeps
    ) {
        this.settings = settings;
    }

    /**
     * Updates service configuration when plugin settings change.
     * @param {FeaturedImageSettings} settings - Latest plugin settings.
     */
    setSettings(settings: FeaturedImageSettings): void {
        this.settings = settings;
    }

    /**
     * Scans for and removes unused images downloaded by the plugin.
     * @param {ConfirmFunction} confirm - Modal confirmation handler.
     */
    async cleanupUnusedImages(confirm: ConfirmFunction): Promise<void> {
        this.deps.debugLog('Starting cleanup of unused images');
        new Notice('Scanning for unused images...');

        // Initialize counters and storage sets
        let externalImagesCount = 0;
        let youtubeImagesCount = 0;
        let autoCardImagesCount = 0;
        let resizedThumbnailsCount = 0;
        let videoFramesCount = 0;

        const externalImages = new Set<string>();
        const youtubeImages = new Set<string>();
        const autoCardImages = new Set<string>();
        const resizedThumbnails = new Set<string>();
        const videoFrames = new Set<string>();
        const usedFiles = new Set<string>();

        try {
            // Step 1: Collect all target files
            await this.collectImageFiles(externalImages, youtubeImages, autoCardImages, resizedThumbnails, videoFrames);

            this.deps.debugLog(`Collected image files:
                - External: ${externalImages.size}
                - YouTube: ${youtubeImages.size}
                - Auto Card: ${autoCardImages.size}
                - Resized Thumbnails: ${resizedThumbnails.size}
                - Video Posters: ${videoFrames.size}`);

            // Step 2: Build reference map from all markdown files
            await this.buildReferenceMap(usedFiles);

            this.deps.debugLog(`Found ${usedFiles.size} unique file references in notes`);

            // Step 3: Find unused files
            const unusedExternal = this.findUnusedFiles(externalImages, usedFiles);
            const unusedYoutube = this.findUnusedFiles(youtubeImages, usedFiles);
            const unusedAutoCard = this.findUnusedFiles(autoCardImages, usedFiles);
            const unusedResized = this.findUnusedFiles(resizedThumbnails, usedFiles);
            const unusedVideo = this.findUnusedFiles(videoFrames, usedFiles);

            externalImagesCount = unusedExternal.size;
            youtubeImagesCount = unusedYoutube.size;
            autoCardImagesCount = unusedAutoCard.size;
            resizedThumbnailsCount = unusedResized.size;
            videoFramesCount = unusedVideo.size;

            this.deps.debugLog(`Unused images detected:
                - External: ${externalImagesCount}
                - YouTube: ${youtubeImagesCount}
                - Auto Card: ${autoCardImagesCount}
                - Resized Thumbnails: ${resizedThumbnailsCount}
                - Video Posters: ${videoFramesCount}`);

            const totalUnused = externalImagesCount + youtubeImagesCount + autoCardImagesCount + resizedThumbnailsCount + videoFramesCount;

            if (totalUnused === 0) {
                new Notice('No unused images found.');
                return;
            }

            // Confirm deletion
            const confirmation = await confirm(
                'Remove unused images',
                `Found ${totalUnused} unused images. Do you want to delete these files?`,
                false
            );

            if (!confirmation) {
                new Notice('Cleanup cancelled.');
                return;
            }

            if (this.settings.dryRun) {
                this.deps.debugLog('Dry run: Would delete unused files');
                new Notice(`Dry run: Would delete ${totalUnused} unused files.`);
                return;
            }

            // Delete files in batches
            new Notice(`Deleting ${totalUnused} unused files...`);

            const allUnusedPaths = [...unusedExternal, ...unusedYoutube, ...unusedAutoCard, ...unusedResized, ...unusedVideo];

            const totalBytes = await this.calculateFileSizes(allUnusedPaths);
            const deletedCount = await this.deleteUnusedFiles(allUnusedPaths);

            const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
            new Notice(`Cleanup complete. Deleted ${deletedCount} unused files (${totalMB} MB).`);
        } catch (error) {
            this.deps.errorLog('Error during image cleanup:', error);
            new Notice('Error during image cleanup. Check console for details.');
        }
    }

    /**
     * Re-renders all resized thumbnails according to the latest settings.
     * @param {RerenderThumbnailsOptions} options - Handlers supplied by the plugin.
     */
    async rerenderAllResizedThumbnails(options: RerenderThumbnailsOptions): Promise<void> {
        if (!this.settings.createResizedThumbnail) {
            new Notice('Resized thumbnails are not enabled in settings.');
            return;
        }

        const confirmation = await options.confirm(
            'Re-render all resized thumbnails',
            'This will re-render all resized thumbnails based on your current settings (size, alignment, etc.). This operation may take some time depending on the number of images. Proceed?'
        );
        if (!confirmation) return;

        if (!this.deps.thumbnailService) {
            this.deps.errorLog('Thumbnail service not initialized, unable to re-render thumbnails.');
            return;
        }

        options.startBulkUpdate();
        new Notice(`Starting ${this.settings.dryRun ? 'dry run of ' : ''}re-rendering of all resized thumbnails...`);

        const files = this.app.vault.getMarkdownFiles();
        let totalFiles = 0;
        let updatedCount = 0;
        let errorCount = 0;
        let lastNotificationTime = Date.now();

        try {
            // First, find all files with featured images
            const filesToProcess: { file: TFile; feature: string }[] = [];

            for (const file of files) {
                const feature = options.getFeatureFromFrontmatter(file);
                if (feature) {
                    filesToProcess.push({ file, feature });
                    totalFiles++;
                }
            }

            // Delete all existing resized thumbnails in the resized folder
            const resizedFolder = normalizePath(`${this.settings.thumbnailsFolder}/resized`);
            if (await this.app.vault.adapter.exists(resizedFolder)) {
                try {
                    const existingResized = await this.app.vault.adapter.list(resizedFolder);

                    if (!this.settings.dryRun) {
                        for (const filePath of existingResized.files) {
                            await this.deps.trashFileAtPath(filePath);
                        }
                    }

                    this.deps.debugLog(`Cleared ${existingResized.files.length} existing thumbnails from ${resizedFolder}`);
                } catch (error) {
                    this.deps.errorLog(`Error accessing resized folder: ${resizedFolder}`, error);
                }
            }

            // Process each file with a featured image
            const batchSize = 5;
            for (let i = 0; i < filesToProcess.length; i += batchSize) {
                const batch = filesToProcess.slice(i, i + batchSize);

                const results = await Promise.all(
                    batch.map(async ({ file, feature }) => {
                        try {
                            const newThumbnail = await this.deps.thumbnailService.createThumbnail(feature);

                            if (newThumbnail) {
                                await options.updateFrontmatter(file, feature, newThumbnail);
                                this.deps.debugLog(
                                    `THUMBNAIL UPDATED\n- File: ${file.path}\n- Feature: ${feature}\n- New thumbnail: ${newThumbnail}`
                                );
                                return true;
                            }
                            return false;
                        } catch (error) {
                            this.deps.errorLog(`Error re-rendering thumbnail for ${file.path}:`, error);
                            return false;
                        }
                    })
                );

                const successful = results.filter(success => success).length;
                updatedCount += successful;
                errorCount += results.length - successful;

                // Show notification every 5 seconds
                const currentTime = Date.now();
                if (currentTime - lastNotificationTime >= 5000) {
                    const processed = Math.min(i + batch.length, totalFiles);
                    let progressMessage = `Re-rendering thumbnails: ${processed}/${totalFiles} processed. Updated: ${updatedCount}`;
                    if (errorCount > 0) {
                        progressMessage += `. Errors: ${errorCount}`;
                    }
                    new Notice(progressMessage);
                    lastNotificationTime = currentTime;
                }
            }
        } finally {
            options.endBulkUpdate();

            let completionMessage = `Re-rendering complete. ${updatedCount} thumbnails were updated`;
            if (errorCount > 0) {
                completionMessage += `. There were ${errorCount} errors.`;
            }

            new Notice(completionMessage);
        }
    }

    /**
     * Collects all plugin-managed media files organized by type.
     * @param {Set<string>} externalImages - Set to store external image paths.
     * @param {Set<string>} youtubeImages - Set to store YouTube thumbnail paths.
     * @param {Set<string>} autoCardImages - Set to store Auto Card Link image paths.
     * @param {Set<string>} resizedThumbnails - Set to store resized thumbnail paths.
     * @param {Set<string>} videoPosters - Set to store captured video poster paths.
     */
    private async collectImageFiles(
        externalImages: Set<string>,
        youtubeImages: Set<string>,
        autoCardImages: Set<string>,
        resizedThumbnails: Set<string>,
        videoPosters: Set<string>
    ): Promise<void> {
        const thumbnailFolder = normalizePath(this.settings.thumbnailsFolder);

        // Ensure thumbnail directory exists
        if (!(await this.app.vault.adapter.exists(thumbnailFolder))) {
            this.deps.debugLog(`Thumbnail folder ${thumbnailFolder} does not exist`);
            return;
        }

        // Check each subfolder
        const externalFolder = `${thumbnailFolder}/external`;
        const youtubeFolder = `${thumbnailFolder}/youtube`;
        const autoCardFolder = `${thumbnailFolder}/autocardlink`;
        const resizedFolder = `${thumbnailFolder}/resized`;
        const videoFolder = `${thumbnailFolder}/video`;

        if (await this.app.vault.adapter.exists(externalFolder)) {
            await this.collectFilesInFolder(externalFolder, externalImages, '.failed.png');
        }

        if (await this.app.vault.adapter.exists(youtubeFolder)) {
            await this.collectFilesInFolder(youtubeFolder, youtubeImages, '.failed.png');
        }

        if (await this.app.vault.adapter.exists(autoCardFolder)) {
            await this.collectFilesInFolder(autoCardFolder, autoCardImages, '.failed.png');
        }

        if (await this.app.vault.adapter.exists(resizedFolder)) {
            await this.collectFilesInFolder(resizedFolder, resizedThumbnails, '.failed.png');
        }

        if (await this.app.vault.adapter.exists(videoFolder)) {
            await this.collectFilesInFolder(videoFolder, videoPosters);
        }
    }

    /**
     * Recursively collects all files in a folder and its subfolders, excluding specific file extensions.
     * @param {string} folderPath - Path to the folder to scan.
     * @param {Set<string>} fileSet - Set to accumulate discovered file paths.
     * @param {string | null} excludeExtension - File extension to exclude from collection.
     */
    private async collectFilesInFolder(folderPath: string, fileSet: Set<string>, excludeExtension: string | null = null): Promise<void> {
        try {
            const files = await this.app.vault.adapter.list(folderPath);

            for (const file of files.files) {
                if (excludeExtension && file.endsWith(excludeExtension)) {
                    continue;
                }

                fileSet.add(normalizePath(file));
            }

            for (const dir of files.folders) {
                await this.collectFilesInFolder(dir, fileSet, excludeExtension);
            }
        } catch (error) {
            this.deps.errorLog(`Error collecting files in ${folderPath}:`, error);
        }
    }

    /**
     * Builds a set of all image files referenced in markdown notes.
     * @param {Set<string>} usedFiles - Set to store all referenced file paths.
     */
    private async buildReferenceMap(usedFiles: Set<string>): Promise<void> {
        const markdownFiles = this.app.vault.getMarkdownFiles();
        for (const file of markdownFiles) {
            await this.deps.featureScanner.collectFileReferences(file, usedFiles);
        }
    }

    /**
     * Identifies files that are not referenced in any markdown notes.
     * @param {Set<string>} fileSet - Set of files to check.
     * @param {Set<string>} usedFiles - Set of files that are referenced.
     * @returns {Set<string>} Set of unreferenced file paths.
     */
    private findUnusedFiles(fileSet: Set<string>, usedFiles: Set<string>): Set<string> {
        const unusedFiles = new Set<string>();

        for (const file of fileSet) {
            if (!this.isFileReferenced(file, usedFiles)) {
                unusedFiles.add(file);
            }
        }

        return unusedFiles;
    }

    /**
     * Checks if a file is referenced either by full path or filename.
     * @param {string} filePath - Path of the file to check.
     * @param {Set<string>} usedFiles - Set of files that are referenced.
     * @returns {boolean} True if the file is referenced.
     */
    private isFileReferenced(filePath: string, usedFiles: Set<string>): boolean {
        if (usedFiles.has(filePath)) {
            return true;
        }

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
     * Calculates the total size in bytes of all specified files.
     * @param {Iterable<string>} filePaths - Paths of files to measure.
     * @returns {Promise<number>} Total size in bytes.
     */
    private async calculateFileSizes(filePaths: Iterable<string>): Promise<number> {
        let totalBytes = 0;

        for (const filePath of filePaths) {
            try {
                const stat = await this.app.vault.adapter.stat(filePath);
                if (stat) {
                    totalBytes += stat.size;
                }
            } catch (error) {
                this.deps.errorLog(`Error getting file size for ${filePath}:`, error);
            }
        }

        return totalBytes;
    }

    /**
     * Deletes the specified files by moving them to trash.
     * @param {Iterable<string>} filePaths - Paths of files to delete.
     * @returns {Promise<number>} Number of successfully deleted files.
     */
    private async deleteUnusedFiles(filePaths: Iterable<string>): Promise<number> {
        let deletedCount = 0;

        for (const filePath of filePaths) {
            const deleted = await this.deps.trashFileAtPath(filePath);
            if (deleted) {
                deletedCount++;
            }
        }

        this.deps.debugLog(`Deleted ${deletedCount} unused files`);
        return deletedCount;
    }
}
