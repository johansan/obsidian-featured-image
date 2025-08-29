import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import FeaturedImage from './main';

export interface FeaturedImageSettings {
    // Basic settings (always visible)
    showNotificationsOnUpdate: boolean;
    thumbnailsFolder: string;
    excludedFolders: string[];
    frontmatterProperty: string;

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
    thumbnailsFolder: 'thumbnails',
    excludedFolders: [],
    frontmatterProperty: 'feature',

    // Resized thumbnail settings
    createResizedThumbnail: true,
    resizedFrontmatterProperty: 'featureResized',
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
            .setName('Show notifications')
            .setDesc('Show notifications when the featured image is set, updated or removed.')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.showNotificationsOnUpdate).onChange(async value => {
                    this.plugin.settings.showNotificationsOnUpdate = value;
                    await this.plugin.saveSettings();
                });
            });

        // Thumbnails folder
        new Setting(containerEl)
            .setName('Thumbnails folder')
            .setDesc(
                'Folder for downloaded thumbnails and resized images. Subfolders will be created automatically for different image types.'
            )
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
            .setName('Excluded folders')
            .setDesc('Comma separated list of folders to exclude from the featured image plugin.')
            .addTextArea(text =>
                text.setValue(this.plugin.settings.excludedFolders.join(',')).onChange(async value => {
                    this.plugin.settings.excludedFolders = value.split(',').map(folder => folder.trim().replace(/\/$/, '')); // Remove trailing slash
                    await this.plugin.saveSettings();
                })
            );

        // Frontmatter property
        new Setting(containerEl)
            .setName('Frontmatter property')
            .setDesc('The name of the frontmatter property to update with the featured image')
            .addText(text =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.frontmatterProperty)
                    .setValue(this.plugin.settings.frontmatterProperty)
                    .onChange(async value => {
                        this.plugin.settings.frontmatterProperty = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Create resized thumbnail
        new Setting(containerEl)
            .setName('Create resized thumbnail')
            .setDesc('Create a resized thumbnail of the featured image and add it to the frontmatter.')
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.createResizedThumbnail).onChange(async value => {
                    this.plugin.settings.createResizedThumbnail = value;

                    // When enabling, set the resized property to frontmatterPropertyResized
                    if (value) {
                        this.plugin.settings.resizedFrontmatterProperty = `${this.plugin.settings.frontmatterProperty}Resized`;

                        // Update the text field value
                        const textComponent = resizedPropertySetting.components[0] as TextComponent;
                        if (textComponent && textComponent.setValue) {
                            textComponent.setValue(this.plugin.settings.resizedFrontmatterProperty);
                        }
                    }

                    await this.plugin.saveSettings();

                    // Update visibility of dependent settings
                    updateThumbnailSettingsVisibility(value);
                })
            );

        // Create thumbnail settings container
        const thumbnailSettingsEl = containerEl.createDiv('thumbnail-settings');

        // Resized frontmatter property
        const resizedPropertySetting = new Setting(thumbnailSettingsEl)
            .setName('Resized thumbnail frontmatter property')
            .setDesc('The name of the frontmatter property to store the resized thumbnail path.')
            .addText(text =>
                text
                    .setPlaceholder(`${this.plugin.settings.frontmatterProperty}Resized`)
                    .setValue(this.plugin.settings.resizedFrontmatterProperty)
                    .onChange(async value => {
                        this.plugin.settings.resizedFrontmatterProperty = value || `${this.plugin.settings.frontmatterProperty}Resized`;
                        await this.plugin.saveSettings();
                    })
            );

        // Max resized width
        new Setting(thumbnailSettingsEl)
            .setName('Max resized width')
            .setDesc('Maximum width of the resized thumbnail in pixels. Use 0 for no width restriction.')
            .addText(text =>
                text
                    .setPlaceholder('128')
                    .setValue(String(this.plugin.settings.maxResizedWidth))
                    .onChange(async value => {
                        const width = parseInt(value);
                        this.plugin.settings.maxResizedWidth = isNaN(width) ? 128 : width;
                        await this.plugin.saveSettings();
                    })
            );

        // Max resized height
        new Setting(thumbnailSettingsEl)
            .setName('Max resized height')
            .setDesc('Maximum height of the resized thumbnail in pixels. Use 0 for no height restriction.')
            .addText(text =>
                text
                    .setPlaceholder('128')
                    .setValue(String(this.plugin.settings.maxResizedHeight))
                    .onChange(async value => {
                        const height = parseInt(value);
                        this.plugin.settings.maxResizedHeight = isNaN(height) ? 128 : height;
                        await this.plugin.saveSettings();
                    })
            );

        // Fill resized dimensions
        new Setting(thumbnailSettingsEl)
            .setName('Fill resized dimensions')
            .setDesc(
                'When enabled, resized thumbnails will be exactly the size specified by max width and height, maintaining aspect ratio and cropping to fill the dimensions.'
            )
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
            .setName('Vertical alignment')
            .setDesc('Choose the vertical alignment for cropped images.')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('top', 'Top')
                    .addOption('center', 'Center')
                    .addOption('bottom', 'Bottom')
                    .setValue(this.plugin.settings.resizedVerticalAlign)
                    .onChange(async value => {
                        this.plugin.settings.resizedVerticalAlign = value as 'top' | 'center' | 'bottom';
                        await this.plugin.saveSettings();
                    })
            );

        // Horizontal alignment setting
        new Setting(alignmentSettingsEl)
            .setName('Horizontal alignment')
            .setDesc('Choose the horizontal alignment for cropped images.')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('left', 'Left')
                    .addOption('center', 'Center')
                    .addOption('right', 'Right')
                    .setValue(this.plugin.settings.resizedHorizontalAlign)
                    .onChange(async value => {
                        this.plugin.settings.resizedHorizontalAlign = value as 'left' | 'center' | 'right';
                        await this.plugin.saveSettings();
                    })
            );

        // Add information about re-rendering thumbnails
        const infoEl = thumbnailSettingsEl.createDiv('thumbnail-info');
        infoEl.createEl('p', {
            text: 'Tip: After changing alignment or dimension settings, run the command "Re-render all resized thumbnails" from the command palette to update existing thumbnails with the new settings.',
            cls: 'setting-item-description'
        });

        // Advanced Settings Toggle
        new Setting(containerEl).setName('Advanced').setHeading();

        new Setting(containerEl)
            .setName('Show advanced settings')
            .setDesc('Toggle to show or hide advanced configuration options')
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
            .setName('Media link format')
            .setDesc('Choose how to format the featured image property in frontmatter.')
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
            .setName('Only update if frontmatter property exists')
            .setDesc('Enable this to only update the frontmatter property if it already exists.')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.onlyUpdateExisting).onChange(async value => {
                    this.plugin.settings.onlyUpdateExisting = value;
                    await this.plugin.saveSettings();
                });
            });

        // Keep empty property
        new Setting(advancedSettingsEl)
            .setName('Keep empty property')
            .setDesc(
                'When enabled, the frontmatter property will be kept but set to an empty string if no featured image is found. When disabled, the property will be removed.'
            )
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.keepEmptyProperty).onChange(async value => {
                    this.plugin.settings.keepEmptyProperty = value;
                    await this.plugin.saveSettings();
                });
            });

        // Preserve template images
        new Setting(advancedSettingsEl)
            .setName("Don't clear existing property")
            .setDesc(
                "When enabled, keeps the existing featured image property if no image is found in the document. When disabled, clears or removes the property when no image is detected (depending on the 'Keep empty property' setting)."
            )
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.preserveTemplateImages).onChange(async value => {
                    this.plugin.settings.preserveTemplateImages = value;
                    await this.plugin.saveSettings();
                });
            });

        // Require exclamation mark for YouTube thumbnails
        new Setting(advancedSettingsEl)
            .setName('Require exclamation mark for YouTube thumbnails')
            .setDesc('If enabled, only YouTube links prefixed with an exclamation mark will be considered for thumbnail download.')
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.requireExclamationForYouTube).onChange(async value => {
                    this.plugin.settings.requireExclamationForYouTube = value;
                    await this.plugin.saveSettings();
                })
            );

        // Download webp
        new Setting(advancedSettingsEl)
            .setName('Download WebP')
            .setDesc('Download WebP versions of images from YouTube if available, otherwise download JPG.')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.downloadWebP).onChange(async value => {
                    this.plugin.settings.downloadWebP = value;
                    await this.plugin.saveSettings();
                });
            });

        // Local image extensions
        new Setting(advancedSettingsEl)
            .setName('Local image extensions')
            .setDesc('Comma-separated list of image file extensions to search for in documents.')
            .addText(text =>
                text
                    .setPlaceholder('png,jpg,jpeg,gif,webp')
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
            .setName('Debug mode')
            .setDesc('Enable debug mode to log detailed information to the console.')
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.debugMode).onChange(async value => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                })
            );

        // Dry run
        new Setting(advancedSettingsEl)
            .setName('Dry run')
            .setDesc('Enable dry run to prevent any changes from being made to your files.')
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
