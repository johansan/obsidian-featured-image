import { App, TFile, normalizePath } from 'obsidian';
import { FeaturedImageSettings } from '../settings';
import { md5 } from '../utils/hash';

interface VideoFrameServiceDeps {
    debugLog: (...args: unknown[]) => void;
    errorLog: (...args: unknown[]) => void;
}

const MAX_VIDEO_POSTER_SIZE_BYTES = 200 * 1024 * 1024;

/**
 * Creates poster frames for local video files.
 */
export class VideoFrameService {
    private settings: FeaturedImageSettings;
    private canvas: HTMLCanvasElement | null = null;

    constructor(
        private readonly app: App,
        settings: FeaturedImageSettings,
        private readonly deps: VideoFrameServiceDeps
    ) {
        this.settings = settings;
    }

    /**
     * Updates service configuration when settings change.
     * @param {FeaturedImageSettings} settings - Latest plugin settings.
     */
    setSettings(settings: FeaturedImageSettings): void {
        this.settings = settings;
    }

    /**
     * Creates (or returns) a poster frame for the provided video file.
     * @param {TFile} videoFile - Local video file.
     * @returns {Promise<string | undefined>} Path to the generated poster image.
     */
    async createPoster(videoFile: TFile): Promise<string | undefined> {
        if (!this.settings.captureVideoPoster) {
            return undefined;
        }

        const mimeType = this.getMimeType(videoFile.extension);
        if (!mimeType) {
            this.deps.errorLog('Unsupported video format for poster capture:', videoFile.extension);
            return undefined;
        }

        const normalizedPath = normalizePath(videoFile.path);
        const videoFolder = normalizePath(`${this.settings.thumbnailsFolder}/video`);
        const hashSource = `${normalizedPath}:${videoFile.stat.mtime}:${videoFile.stat.size}`;
        const posterFilename = `${md5(hashSource)}.jpg`;
        const posterPath = `${videoFolder}/${posterFilename}`;

        if (await this.app.vault.adapter.exists(posterPath)) {
            return posterPath;
        }

        if (this.settings.dryRun) {
            this.deps.debugLog('Dry run: Skipping video poster capture, returning mock path for', normalizedPath);
            return posterPath;
        }

        try {
            if (!(await this.app.vault.adapter.exists(videoFolder))) {
                await this.app.vault.adapter.mkdir(videoFolder);
            }

            if (videoFile.stat.size > MAX_VIDEO_POSTER_SIZE_BYTES) {
                this.deps.debugLog(
                    'Skipping video poster capture for large video (>200MB):',
                    normalizedPath,
                    `(${videoFile.stat.size} bytes)`
                );
                return undefined;
            }

            const resourcePath = this.app.vault.getResourcePath(videoFile);
            let sourceUrl: string;
            let cleanup: (() => void) | undefined;

            if (resourcePath) {
                this.deps.debugLog('Streaming video poster capture via resource path:', normalizedPath);
                sourceUrl = resourcePath;
            } else {
                this.deps.debugLog('Loading video into memory for poster capture:', normalizedPath, `(${videoFile.stat.size} bytes)`);
                const binary = await this.app.vault.adapter.readBinary(normalizedPath);
                const blob = new Blob([binary], { type: mimeType });
                sourceUrl = URL.createObjectURL(blob);
                cleanup = () => URL.revokeObjectURL(sourceUrl);
            }

            try {
                const videoElement = await this.loadVideo(sourceUrl);
                try {
                    const frameData = await this.captureFrame(videoElement);
                    await this.app.vault.adapter.writeBinary(posterPath, frameData);
                    this.deps.debugLog('Captured video poster frame for', normalizedPath, '->', posterPath);
                    return posterPath;
                } finally {
                    videoElement.pause();
                    videoElement.removeAttribute('src');
                    videoElement.load();
                    videoElement.remove();
                }
            } finally {
                cleanup?.();
            }
        } catch (error) {
            this.deps.errorLog('Failed to capture video poster for', normalizedPath, error);
            return undefined;
        }
    }

    /**
     * Ensures a canvas element exists for video frame capture.
     * @returns {HTMLCanvasElement} Canvas element for drawing video frames.
     */
    private ensureCanvas(): HTMLCanvasElement {
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
        }
        return this.canvas;
    }

    /**
     * Loads a video element from a URL and waits for metadata.
     * @param {string} url - URL or data URL of the video.
     * @returns {Promise<HTMLVideoElement>} Loaded video element.
     */
    private async loadVideo(url: string): Promise<HTMLVideoElement> {
        return await new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.playsInline = true;

            const cleanup = () => {
                video.removeEventListener('loadeddata', onLoadedData);
                video.removeEventListener('error', onError);
            };

            const onLoadedData = () => {
                cleanup();
                resolve(video);
            };

            const onError = () => {
                cleanup();
                const mediaError = video.error;
                if (mediaError) {
                    reject(new Error(`Video failed to load (code ${mediaError.code})`));
                } else {
                    reject(new Error('Video failed to load'));
                }
            };

            video.addEventListener('loadeddata', onLoadedData, { once: true });
            video.addEventListener('error', onError, { once: true });
            video.src = url;
            video.load();
        });
    }

    /**
     * Captures the current frame from a video element as a JPEG image.
     * @param {HTMLVideoElement} video - Video element to capture from.
     * @returns {Promise<ArrayBuffer>} JPEG image data as ArrayBuffer.
     */
    private async captureFrame(video: HTMLVideoElement): Promise<ArrayBuffer> {
        if (!video.videoWidth || !video.videoHeight) {
            throw new Error('Video has no dimensions');
        }

        const canvas = this.ensureCanvas();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to obtain 2D context for video capture');
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        return await new Promise((resolve, reject) => {
            canvas.toBlob(
                blob => {
                    if (!blob) {
                        reject(new Error('Failed to create blob from video frame'));
                        return;
                    }

                    const reader = new FileReader();
                    reader.onloadend = () => {
                        if (reader.result instanceof ArrayBuffer) {
                            resolve(reader.result);
                        } else {
                            reject(new Error('Failed to convert video frame blob to array buffer'));
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(blob);
                },
                'image/jpeg',
                0.9
            );
        });
    }

    /**
     * Maps file extensions to MIME types for video loading.
     * @param {string} extension - File extension to look up.
     * @returns {string | undefined} MIME type for the extension.
     */
    private getMimeType(extension: string): string | undefined {
        const ext = extension.toLowerCase();
        const mimeTypes: Record<string, string> = {
            mp4: 'video/mp4',
            m4v: 'video/mp4',
            mov: 'video/quicktime',
            webm: 'video/webm',
            mkv: 'video/x-matroska'
        };

        return mimeTypes[ext];
    }
}
