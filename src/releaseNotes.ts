export interface ReleaseNote {
    version: string;
    date: string;
    /** If false, skip automatic modal display for this version during startup */
    showOnUpdate?: boolean;
    info?: string;
    new?: string[];
    improved?: string[];
    changed?: string[];
    fixed?: string[];
}

/**
 * All release notes for the plugin, ordered from newest to oldest.
 *
 * When adding a new release:
 * 1) Add it at the beginning of the array (newest first)
 * 2) Use these categories: new, improved, changed, fixed
 */
const RELEASE_NOTES: ReleaseNote[] = [
    {
        version: '1.2.4',
        date: '2026-01-07',
        showOnUpdate: true,
        new: [],
        improved: [],
        changed: [
            "Removed the setting 'Optimize settings for Notebook Navigator' since this plugin is no longer needed for Notebook Navigator."
        ],
        fixed: []
    },
    {
        version: '1.2.3',
        date: '2025-12-16',
        showOnUpdate: true,
        new: [
            'New setting: ==Frontmatter image source properties==. Comma-separated list of frontmatter properties to check for image paths/URLs before scanning the document. Use this setting if you have links to external images in one of your properties and want to use that in Notebook Navigator.',
            '==AVIF support==: Featured Image will now properly read and process AVIF images.',
            '==SVG support==: Featured Image will now properly read and process SVG images.'
        ],
        improved: [
            'Settings now support the new ==SettingGroup API== in Obsidian 1.11 and later. Settings groups are now clearly outlined.'
        ],
        changed: [],
        fixed: []
    }
];

export function getReleaseNotesBetweenVersions(fromVersion: string, toVersion: string): ReleaseNote[] {
    const fromIndex = RELEASE_NOTES.findIndex(note => note.version === fromVersion);
    const toIndex = RELEASE_NOTES.findIndex(note => note.version === toVersion);

    if (fromIndex === -1 || toIndex === -1) {
        return getLatestReleaseNotes();
    }

    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);

    return RELEASE_NOTES.slice(startIndex, endIndex + 1);
}

export function getLatestReleaseNotes(count: number = 5): ReleaseNote[] {
    return RELEASE_NOTES.slice(0, count);
}

export function compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;

        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }

    return 0;
}

export function isReleaseAutoDisplayEnabled(version: string): boolean {
    const note = RELEASE_NOTES.find(entry => entry.version === version);
    if (!note) {
        return true;
    }
    return note.showOnUpdate !== false;
}
