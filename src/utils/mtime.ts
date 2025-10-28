import { App, TFile } from 'obsidian';

interface AdjustMtimeOptions {
    dryRun: boolean;
    errorLog: (...args: unknown[]) => void;
    offsetMs?: number;
    context?: string;
}

const DEFAULT_OFFSET_MS = 1500;

/**
 * Adjusts a file's modification time by a small offset (default 1.5 seconds) so sync providers register the change.
 * @param {App} app - The current Obsidian app instance.
 * @param {TFile} file - The file whose modification time should be adjusted.
 * @param {number} originalMtime - The original modification time captured before updates.
 * @param {AdjustMtimeOptions} options - Behaviour flags and logging hooks.
 */
export async function restoreMtimeWithOffset(app: App, file: TFile, originalMtime: number, options: AdjustMtimeOptions): Promise<void> {
    if (options.dryRun) {
        return;
    }

    const offsetMs = Math.max(options.offsetMs ?? DEFAULT_OFFSET_MS, 1);
    const targetMtime = originalMtime + offsetMs;

    try {
        const updatedContent = await app.vault.read(file);
        await app.vault.modify(file, updatedContent, { mtime: targetMtime });
    } catch (error) {
        const prefix = options.context ?? 'Failed to adjust modification time';
        options.errorLog(`${prefix} for ${file.path}:`, error);
    }
}
