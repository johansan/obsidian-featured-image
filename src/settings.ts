import { App, PluginSettingTab, Setting, DropdownComponent, TextComponent, ToggleComponent } from 'obsidian';
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
    downloadExternalImages: boolean;
    downloadYoutubeThumbnails: boolean;
    debugMode: boolean;
    dryRun: boolean;
}

export const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] as const;

export const DEFAULT_SETTINGS: FeaturedImageSettings = {
    // Basic settings (always visible)
    showNotificationsOnUpdate: true,
    frontmatterProperty: 'feature',
    thumbnailsFolder: 'thumbnails',
    excludedFolders: [],

    // Resized thumbnail settings
    createResizedThumbnail: true,
    resizedFrontmatterProperty: 'thumbnail',
    maxResizedWidth: 256,
    maxResizedHeight: 144,
    fillResizedDimensions: false,
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
    downloadExternalImages: true,
    downloadYoutubeThumbnails: true,
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

        let resizeToggle!: ToggleComponent;
        let maxResizedWidthInput!: TextComponent;
        let maxResizedHeightInput!: TextComponent;
        let fillResizedToggle!: ToggleComponent;
        let verticalAlignmentDropdown!: DropdownComponent;
        let horizontalAlignmentDropdown!: DropdownComponent;

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

        const resizedThumbnailSetting = new Setting(containerEl)
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

        // Notebook Navigator section
        const notebookNavigatorHeading = new Setting(containerEl).setName(strings.settings.headings.notebookNavigator).setHeading();

        const notebookNavigatorSetting = new Setting(containerEl)
            .setName(strings.settings.items.optimizeNotebookNavigator.name)
            .setDesc(strings.settings.items.optimizeNotebookNavigator.desc)
            .addButton(button =>
                button
                    .setButtonText(strings.settings.items.optimizeNotebookNavigator.action)
                    .setCta()
                    .onClick(async () => {
                        this.plugin.settings.createResizedThumbnail = DEFAULT_SETTINGS.createResizedThumbnail;
                        this.plugin.settings.maxResizedWidth = DEFAULT_SETTINGS.maxResizedWidth;
                        this.plugin.settings.maxResizedHeight = DEFAULT_SETTINGS.maxResizedHeight;
                        this.plugin.settings.fillResizedDimensions = DEFAULT_SETTINGS.fillResizedDimensions;
                        this.plugin.settings.resizedVerticalAlign = DEFAULT_SETTINGS.resizedVerticalAlign;
                        this.plugin.settings.resizedHorizontalAlign = DEFAULT_SETTINGS.resizedHorizontalAlign;

                        await this.plugin.saveSettings();

                        resizeToggle.setValue(this.plugin.settings.createResizedThumbnail);
                        maxResizedWidthInput.setValue(String(this.plugin.settings.maxResizedWidth));
                        maxResizedHeightInput.setValue(String(this.plugin.settings.maxResizedHeight));
                        fillResizedToggle.setValue(this.plugin.settings.fillResizedDimensions);
                        verticalAlignmentDropdown.setValue(this.plugin.settings.resizedVerticalAlign);
                        horizontalAlignmentDropdown.setValue(this.plugin.settings.resizedHorizontalAlign);

                        updateThumbnailSettingsVisibility(this.plugin.settings.createResizedThumbnail);
                        updateNotebookNavigatorVisibility();
                        await this.plugin.rerenderAllResizedThumbnails();
                    })
            );

        // External media heading
        new Setting(containerEl).setName(strings.settings.headings.externalMedia).setHeading();

        const externalMediaSettingsEl = containerEl.createDiv('external-media-settings');
        externalMediaSettingsEl.addClass('thumbnail-settings');

        // Download external images
        new Setting(externalMediaSettingsEl)
            .setName(strings.settings.items.downloadExternalImages.name)
            .setDesc(strings.settings.items.downloadExternalImages.desc)
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.downloadExternalImages).onChange(async value => {
                    this.plugin.settings.downloadExternalImages = value;
                    await this.plugin.saveSettings();
                })
            );

        // Download YouTube thumbnails
        new Setting(externalMediaSettingsEl)
            .setName(strings.settings.items.downloadYoutubeThumbnails.name)
            .setDesc(strings.settings.items.downloadYoutubeThumbnails.desc)
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.downloadYoutubeThumbnails).onChange(async value => {
                    this.plugin.settings.downloadYoutubeThumbnails = value;
                    await this.plugin.saveSettings();
                })
            );

        // Require exclamation mark for YouTube thumbnails
        new Setting(externalMediaSettingsEl)
            .setName(strings.settings.items.requireExclamationForYouTube.name)
            .setDesc(strings.settings.items.requireExclamationForYouTube.desc)
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.requireExclamationForYouTube).onChange(async value => {
                    this.plugin.settings.requireExclamationForYouTube = value;
                    await this.plugin.saveSettings();
                })
            );

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

        // Resize feature image
        new Setting(advancedSettingsEl)
            .setName(strings.settings.items.resizeFeatureImage.name)
            .setDesc(strings.settings.items.resizeFeatureImage.desc)
            .addToggle(toggle =>
                (resizeToggle = toggle).setValue(this.plugin.settings.createResizedThumbnail).onChange(async value => {
                    this.plugin.settings.createResizedThumbnail = value;
                    await this.plugin.saveSettings();
                    updateThumbnailSettingsVisibility(value);
                    updateNotebookNavigatorVisibility();
                })
            );

        const thumbnailSettingsEl = advancedSettingsEl.createDiv('thumbnail-settings');

        // Max resized width
        new Setting(thumbnailSettingsEl)
            .setName(strings.settings.items.maxResizedWidth.name)
            .setDesc(strings.settings.items.maxResizedWidth.desc)
            .addText(text =>
                (maxResizedWidthInput = text)
                    .setPlaceholder(String(DEFAULT_SETTINGS.maxResizedWidth))
                    .setValue(String(this.plugin.settings.maxResizedWidth))
                    .onChange(async value => {
                        const width = parseInt(value, 10);
                        this.plugin.settings.maxResizedWidth = Number.isNaN(width) ? DEFAULT_SETTINGS.maxResizedWidth : width;
                        await this.plugin.saveSettings();
                        updateNotebookNavigatorVisibility();
                    })
            );

        // Max resized height
        new Setting(thumbnailSettingsEl)
            .setName(strings.settings.items.maxResizedHeight.name)
            .setDesc(strings.settings.items.maxResizedHeight.desc)
            .addText(text =>
                (maxResizedHeightInput = text)
                    .setPlaceholder(String(DEFAULT_SETTINGS.maxResizedHeight))
                    .setValue(String(this.plugin.settings.maxResizedHeight))
                    .onChange(async value => {
                        const height = parseInt(value, 10);
                        this.plugin.settings.maxResizedHeight = Number.isNaN(height) ? DEFAULT_SETTINGS.maxResizedHeight : height;
                        await this.plugin.saveSettings();
                        updateNotebookNavigatorVisibility();
                    })
            );

        // Fill resized dimensions
        new Setting(thumbnailSettingsEl)
            .setName(strings.settings.items.fillResizedDimensions.name)
            .setDesc(strings.settings.items.fillResizedDimensions.desc)
            .addToggle(toggle =>
                (fillResizedToggle = toggle).setValue(this.plugin.settings.fillResizedDimensions).onChange(async value => {
                    this.plugin.settings.fillResizedDimensions = value;
                    await this.plugin.saveSettings();
                    updateAlignmentSettingsVisibility(value);
                    updateNotebookNavigatorVisibility();
                })
            );

        const alignmentSettingsEl = thumbnailSettingsEl.createDiv('alignment-settings');

        // Vertical alignment setting
        new Setting(alignmentSettingsEl)
            .setName(strings.settings.items.verticalAlignment.name)
            .setDesc(strings.settings.items.verticalAlignment.desc)
            .addDropdown(dropdown =>
                (verticalAlignmentDropdown = dropdown)
                    .addOption('top', strings.settings.items.verticalAlignment.options.top)
                    .addOption('center', strings.settings.items.verticalAlignment.options.center)
                    .addOption('bottom', strings.settings.items.verticalAlignment.options.bottom)
                    .setValue(this.plugin.settings.resizedVerticalAlign)
                    .onChange(async value => {
                        this.plugin.settings.resizedVerticalAlign = value as 'top' | 'center' | 'bottom';
                        await this.plugin.saveSettings();
                        updateNotebookNavigatorVisibility();
                    })
            );

        // Horizontal alignment setting
        new Setting(alignmentSettingsEl)
            .setName(strings.settings.items.horizontalAlignment.name)
            .setDesc(strings.settings.items.horizontalAlignment.desc)
            .addDropdown(dropdown =>
                (horizontalAlignmentDropdown = dropdown)
                    .addOption('left', strings.settings.items.horizontalAlignment.options.left)
                    .addOption('center', strings.settings.items.horizontalAlignment.options.center)
                    .addOption('right', strings.settings.items.horizontalAlignment.options.right)
                    .setValue(this.plugin.settings.resizedHorizontalAlign)
                    .onChange(async value => {
                        this.plugin.settings.resizedHorizontalAlign = value as 'left' | 'center' | 'right';
                        await this.plugin.saveSettings();
                        updateNotebookNavigatorVisibility();
                    })
            );

        const infoEl = thumbnailSettingsEl.createDiv('thumbnail-info');
        infoEl.createEl('p', {
            text: strings.settings.info.rerenderTip,
            cls: 'setting-item-description'
        });

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

        const isResizeSettingsDefault = (): boolean => {
            return (
                this.plugin.settings.createResizedThumbnail === DEFAULT_SETTINGS.createResizedThumbnail &&
                this.plugin.settings.maxResizedWidth === DEFAULT_SETTINGS.maxResizedWidth &&
                this.plugin.settings.maxResizedHeight === DEFAULT_SETTINGS.maxResizedHeight &&
                this.plugin.settings.fillResizedDimensions === DEFAULT_SETTINGS.fillResizedDimensions &&
                this.plugin.settings.resizedVerticalAlign === DEFAULT_SETTINGS.resizedVerticalAlign &&
                this.plugin.settings.resizedHorizontalAlign === DEFAULT_SETTINGS.resizedHorizontalAlign
            );
        };

        // Visibility control functions
        const updateAdvancedSettingsVisibility = (show: boolean) => {
            advancedSettingsEl.style.display = show ? 'block' : 'none';
        };

        const updateThumbnailSettingsVisibility = (show: boolean) => {
            resizedThumbnailSetting.settingEl.style.display = show ? '' : 'none';
            thumbnailSettingsEl.style.display = show ? 'block' : 'none';
            updateAlignmentSettingsVisibility(show && this.plugin.settings.fillResizedDimensions);
            updateNotebookNavigatorVisibility();
        };

        const updateAlignmentSettingsVisibility = (show: boolean) => {
            alignmentSettingsEl.style.display = show ? 'block' : 'none';
        };

        const updateNotebookNavigatorVisibility = () => {
            const shouldShow = !isResizeSettingsDefault();
            notebookNavigatorHeading.settingEl.style.display = shouldShow ? '' : 'none';
            notebookNavigatorSetting.settingEl.style.display = shouldShow ? '' : 'none';
        };

        // Initial visibility based on current settings
        updateAdvancedSettingsVisibility(this.plugin.settings.showAdvancedSettings);
        updateThumbnailSettingsVisibility(this.plugin.settings.createResizedThumbnail);
        updateAlignmentSettingsVisibility(this.plugin.settings.createResizedThumbnail && this.plugin.settings.fillResizedDimensions);
        updateNotebookNavigatorVisibility();
    }
}
