import { App, TAbstractFile, TFile, normalizePath } from 'obsidian';

/**
 * Type guard to determine if a file is a TFile instance.
 * @param {TAbstractFile | null} file - The file to check.
 * @returns {file is TFile} True when the file is a TFile instance.
 */
export const isTFile = (file: TAbstractFile | null): file is TFile => {
    return file instanceof TFile;
};

/**
 * Resolves a local image path relative to the provided context file.
 * @param {App} app - Active Obsidian app instance.
 * @param {string} imagePath - The local image path to resolve.
 * @param {TFile} contextFile - The markdown file referencing the image.
 * @returns {string | undefined} Canonical vault-relative path when the file exists.
 */
export const resolveLocalImagePath = (app: App, imagePath: string, contextFile: TFile): string | undefined => {
    const trimmedPath = imagePath.trim();

    const resolvedFromCache = app.metadataCache.getFirstLinkpathDest(trimmedPath, contextFile.path);
    if (isTFile(resolvedFromCache)) {
        return resolvedFromCache.path;
    }

    const normalizedPath = normalizePath(trimmedPath);
    const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
    if (isTFile(abstractFile)) {
        return abstractFile.path;
    }

    return undefined;
};
