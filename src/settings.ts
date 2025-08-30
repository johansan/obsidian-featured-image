import { App, PluginSettingTab, Setting } from 'obsidian';
import FeaturedImage from './main';
import { strings } from './i18n';

export interface FeaturedImageSettings {
    // Basic settings (always visible)
    showNotificationsOnUpdate: boolean;
    frontmatterProperty: string;
    thumbnailsFolder: string;
    excludedFolders: string[];

    // Resized thumbnail settings
    createResizedThumbnail: boolean;
    resizedFrontmatterProperty: string;
    maxResizedWidth: number;
    maxResizedHeight: number;
    fillResizedDimensions: boolean;
    resizedVerticalAlign: 'top' | 'center' | 'bottom';
    resizedHorizontalAlign: 'left' | 'center' | 'right';

    // Advanced settings
    showAdvancedSettings: boolean;
    mediaLinkFormat: 'plain' | 'wiki' | 'embed';
    useMediaLinks: boolean; // TODO: Remove in the future, it has been replaced by mediaLinkFormat
    onlyUpdateExisting: boolean;
    keepEmptyProperty: boolean;
    preserveTemplateImages: boolean;
    requireExclamationForYouTube: boolean;
    downloadWebP: boolean;
    imageExtensions: string[];
    debugMode: boolean;
    dryRun: boolean;
}

export const DEFAULT_SETTINGS: FeaturedImageSettings = {
    // Basic settings (always visible)
    showNotificationsOnUpdate: true,
    frontmatterProperty: 'feature',
    thumbnailsFolder: 'thumbnails',
    excludedFolders: [],

    // Resized thumbnail settings
    createResizedThumbnail: true,
    resizedFrontmatterProperty: 'thumbnail',
    maxResizedWidth: 128,
    maxResizedHeight: 128,
    fillResizedDimensions: true,
    resizedVerticalAlign: 'top',
    resizedHorizontalAlign: 'center',

    // Advanced settings
    showAdvancedSettings: false,
    mediaLinkFormat: 'plain',
    useMediaLinks: false, // TODO: Remove in the future, it has been replaced by mediaLinkFormat
    onlyUpdateExisting: false,
    keepEmptyProperty: false,
    preserveTemplateImages: false,
    requireExclamationForYouTube: true,
    downloadWebP: true,
    imageExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
    debugMode: false,
    dryRun: false
};

export class FeaturedImageSettingsTab extends PluginSettingTab {
    plugin: FeaturedImage;

    constructor(app: App, plugin: FeaturedImage) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // Show notifications on update
        new Setting(containerEl)
            .setName(strings.settings.items.showNotifications.name)
            .setDesc(strings.settings.items.showNotifications.desc)
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.showNotificationsOnUpdate).onChange(async value => {
                    this.plugin.settings.showNotificationsOnUpdate = value;
                    await this.plugin.saveSettings();
                });
            });

        // Frontmatter property
        new Setting(containerEl)
            .setName(strings.settings.items.frontmatterProperty.name)
            .setDesc(strings.settings.items.frontmatterProperty.desc)
            .addText(text =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.frontmatterProperty)
                    .setValue(this.plugin.settings.frontmatterProperty)
                    .onChange(async value => {
                        this.plugin.settings.frontmatterProperty = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Thumbnails folder
        new Setting(containerEl)
            .setName(strings.settings.items.thumbnailsFolder.name)
            .setDesc(strings.settings.items.thumbnailsFolder.desc)
            .addText(text =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.thumbnailsFolder)
                    .setValue(this.plugin.settings.thumbnailsFolder)
                    .onChange(async value => {
                        const sanitizedValue = value.trim();
                        if (!sanitizedValue) {
                            // Set to default if empty
                            this.plugin.settings.thumbnailsFolder = DEFAULT_SETTINGS.thumbnailsFolder;
                        } else {
                            this.plugin.settings.thumbnailsFolder = sanitizedValue.replace(/\/$/, '');
                        }
                        await this.plugin.saveSettings();
                    })
            );

        // Excluded folders
        new Setting(containerEl)
            .setName(strings.settings.items.excludedFolders.name)
            .setDesc(strings.settings.items.excludedFolders.desc)
            .addTextArea(text =>
                text.setValue(this.plugin.settings.excludedFolders.join(',')).onChange(async value => {
                    this.plugin.settings.excludedFolders = value.split(',').map(folder => folder.trim().replace(/\/$/, '')); // Remove trailing slash
                    await this.plugin.saveSettings();
                })
            );

        // Create resized thumbnail
        new Setting(containerEl)
            .setName(strings.settings.items.resizeFeatureImage.name)
            .setDesc(strings.settings.items.resizeFeatureImage.desc)
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.createResizedThumbnail).onChange(async value => {
                    this.plugin.settings.createResizedThumbnail = value;

                    await this.plugin.saveSettings();

                    // Update visibility of dependent settings
                    updateThumbnailSettingsVisibility(value);
                })
            );

        // Create thumbnail settings container
        const thumbnailSettingsEl = containerEl.createDiv('thumbnail-settings');

        // Resized frontmatter property
        new Setting(thumbnailSettingsEl)
            .setName(strings.settings.items.resizedThumbnailProperty.name)
            .setDesc(strings.settings.items.resizedThumbnailProperty.desc)
            .addText(text =>
                text
                    .setPlaceholder(strings.settings.items.resizedThumbnailProperty.placeholder)
                    .setValue(this.plugin.settings.resizedFrontmatterProperty)
                    .onChange(async value => {
                        this.plugin.settings.resizedFrontmatterProperty = value || 'thumbnail';
                        await this.plugin.saveSettings();
                    })
            );

        // Max resized width
        new Setting(thumbnailSettingsEl)
            .setName(strings.settings.items.maxResizedWidth.name)
            .setDesc(strings.settings.items.maxResizedWidth.desc)
            .addText(text =>
                text
                    .setPlaceholder(strings.settings.items.maxResizedWidth.placeholder)
                    .setValue(String(this.plugin.settings.maxResizedWidth))
                    .onChange(async value => {
                        const width = parseInt(value);
                        this.plugin.settings.maxResizedWidth = isNaN(width) ? 128 : width;
                        await this.plugin.saveSettings();
                    })
            );

        // Max resized height
        new Setting(thumbnailSettingsEl)
            .setName(strings.settings.items.maxResizedHeight.name)
            .setDesc(strings.settings.items.maxResizedHeight.desc)
            .addText(text =>
                text
                    .setPlaceholder(strings.settings.items.maxResizedHeight.placeholder)
                    .setValue(String(this.plugin.settings.maxResizedHeight))
                    .onChange(async value => {
                        const height = parseInt(value);
                        this.plugin.settings.maxResizedHeight = isNaN(height) ? 128 : height;
                        await this.plugin.saveSettings();
                    })
            );

        // Fill resized dimensions
        new Setting(thumbnailSettingsEl)
            .setName(strings.settings.items.fillResizedDimensions.name)
            .setDesc(strings.settings.items.fillResizedDimensions.desc)
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.fillResizedDimensions).onChange(async value => {
                    this.plugin.settings.fillResizedDimensions = value;
                    await this.plugin.saveSettings();
                    updateAlignmentSettingsVisibility(value);
                })
            );

        // Create alignment settings container
        const alignmentSettingsEl = thumbnailSettingsEl.createDiv('alignment-settings');

        // Vertical alignment setting
        new Setting(alignmentSettingsEl)
            .setName(strings.settings.items.verticalAlignment.name)
            .setDesc(strings.settings.items.verticalAlignment.desc)
            .addDropdown(dropdown =>
                dropdown
                    .addOption('top', strings.settings.items.verticalAlignment.options.top)
                    .addOption('center', strings.settings.items.verticalAlignment.options.center)
                    .addOption('bottom', strings.settings.items.verticalAlignment.options.bottom)
                    .setValue(this.plugin.settings.resizedVerticalAlign)
                    .onChange(async value => {
                        this.plugin.settings.resizedVerticalAlign = value as 'top' | 'center' | 'bottom';
                        await this.plugin.saveSettings();
                    })
            );

        // Horizontal alignment setting
        new Setting(alignmentSettingsEl)
            .setName(strings.settings.items.horizontalAlignment.name)
            .setDesc(strings.settings.items.horizontalAlignment.desc)
            .addDropdown(dropdown =>
                dropdown
                    .addOption('left', strings.settings.items.horizontalAlignment.options.left)
                    .addOption('center', strings.settings.items.horizontalAlignment.options.center)
                    .addOption('right', strings.settings.items.horizontalAlignment.options.right)
                    .setValue(this.plugin.settings.resizedHorizontalAlign)
                    .onChange(async value => {
                        this.plugin.settings.resizedHorizontalAlign = value as 'left' | 'center' | 'right';
                        await this.plugin.saveSettings();
                    })
            );

        // Add information about re-rendering thumbnails
        const infoEl = thumbnailSettingsEl.createDiv('thumbnail-info');
        infoEl.createEl('p', {
            text: strings.settings.info.rerenderTip,
            cls: 'setting-item-description'
        });

        // Advanced Settings Toggle
        new Setting(containerEl).setName(strings.settings.headings.advanced).setHeading();

        new Setting(containerEl)
            .setName(strings.settings.items.showAdvancedSettings.name)
            .setDesc(strings.settings.items.showAdvancedSettings.desc)
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.showAdvancedSettings).onChange(async value => {
                    this.plugin.settings.showAdvancedSettings = value;
                    await this.plugin.saveSettings();
                    updateAdvancedSettingsVisibility(value);
                })
            );

        // Advanced Settings Container
        const advancedSettingsEl = containerEl.createDiv('advanced-settings');
        advancedSettingsEl.addClass('thumbnail-settings'); // Add the same class for consistent indentation

        // Media link format
        new Setting(advancedSettingsEl)
            .setName(strings.settings.items.mediaLinkFormat.name)
            .setDesc(strings.settings.items.mediaLinkFormat.desc)
            .addDropdown(dropdown =>
                dropdown
                    .addOption('plain', `${this.plugin.settings.frontmatterProperty}: image.png`)
                    .addOption('wiki', `${this.plugin.settings.frontmatterProperty}: [[image.png]]`)
                    .addOption('embed', `${this.plugin.settings.frontmatterProperty}: ![[image.png]]`)
                    .setValue(this.plugin.settings.mediaLinkFormat)
                    .onChange(async value => {
                        this.plugin.settings.mediaLinkFormat = value as 'plain' | 'wiki' | 'embed';
                        this.plugin.settings.useMediaLinks = value !== 'plain'; // TODO: Remove in the future, it has been replaced by mediaLinkFormat
                        await this.plugin.saveSettings();
                    })
            );

        // Only update existing fields toggle
        new Setting(advancedSettingsEl)
            .setName(strings.settings.items.onlyUpdateExisting.name)
            .setDesc(strings.settings.items.onlyUpdateExisting.desc)
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.onlyUpdateExisting).onChange(async value => {
                    this.plugin.settings.onlyUpdateExisting = value;
                    await this.plugin.saveSettings();
                });
            });

        // Keep empty property
        new Setting(advancedSettingsEl)
            .setName(strings.settings.items.keepEmptyProperty.name)
            .setDesc(strings.settings.items.keepEmptyProperty.desc)
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.keepEmptyProperty).onChange(async value => {
                    this.plugin.settings.keepEmptyProperty = value;
                    await this.plugin.saveSettings();
                });
            });

        // Preserve template images
        new Setting(advancedSettingsEl)
            .setName(strings.settings.items.preserveTemplateImages.name)
            .setDesc(strings.settings.items.preserveTemplateImages.desc)
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.preserveTemplateImages).onChange(async value => {
                    this.plugin.settings.preserveTemplateImages = value;
                    await this.plugin.saveSettings();
                });
            });

        // Require exclamation mark for YouTube thumbnails
        new Setting(advancedSettingsEl)
            .setName(strings.settings.items.requireExclamationForYouTube.name)
            .setDesc(strings.settings.items.requireExclamationForYouTube.desc)
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.requireExclamationForYouTube).onChange(async value => {
                    this.plugin.settings.requireExclamationForYouTube = value;
                    await this.plugin.saveSettings();
                })
            );

        // Download webp
        new Setting(advancedSettingsEl)
            .setName(strings.settings.items.downloadWebP.name)
            .setDesc(strings.settings.items.downloadWebP.desc)
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.downloadWebP).onChange(async value => {
                    this.plugin.settings.downloadWebP = value;
                    await this.plugin.saveSettings();
                });
            });

        // Local image extensions
        new Setting(advancedSettingsEl)
            .setName(strings.settings.items.localImageExtensions.name)
            .setDesc(strings.settings.items.localImageExtensions.desc)
            .addText(text =>
                text
                    .setPlaceholder(strings.settings.items.localImageExtensions.placeholder)
                    .setValue(this.plugin.settings.imageExtensions.join(','))
                    .onChange(async value => {
                        const extensions = value
                            .split(',')
                            .map(ext => ext.trim())
                            .filter(ext => ext);
                        if (extensions.length === 0) {
                            // Set to default if empty
                            this.plugin.settings.imageExtensions = DEFAULT_SETTINGS.imageExtensions;
                        } else {
                            this.plugin.settings.imageExtensions = extensions;
                        }
                        await this.plugin.saveSettings();
                    })
            );

        // Debug mode
        new Setting(advancedSettingsEl)
            .setName(strings.settings.items.debugMode.name)
            .setDesc(strings.settings.items.debugMode.desc)
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.debugMode).onChange(async value => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                })
            );

        // Dry run
        new Setting(advancedSettingsEl)
            .setName(strings.settings.items.dryRun.name)
            .setDesc(strings.settings.items.dryRun.desc)
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.dryRun).onChange(async value => {
                    this.plugin.settings.dryRun = value;
                    await this.plugin.saveSettings();
                })
            );

        // Visibility control functions
        const updateAdvancedSettingsVisibility = (show: boolean) => {
            advancedSettingsEl.style.display = show ? 'block' : 'none';
        };

        const updateThumbnailSettingsVisibility = (show: boolean) => {
            thumbnailSettingsEl.style.display = show ? 'block' : 'none';
            // Also update alignment settings visibility when thumbnail settings change
            if (show) {
                updateAlignmentSettingsVisibility(this.plugin.settings.fillResizedDimensions);
            }
        };

        const updateAlignmentSettingsVisibility = (show: boolean) => {
            alignmentSettingsEl.style.display = show ? 'block' : 'none';
        };

        // Initial visibility based on current settings
        updateAdvancedSettingsVisibility(this.plugin.settings.showAdvancedSettings);
        updateThumbnailSettingsVisibility(this.plugin.settings.createResizedThumbnail);
        updateAlignmentSettingsVisibility(this.plugin.settings.createResizedThumbnail && this.plugin.settings.fillResizedDimensions);
    }
}
