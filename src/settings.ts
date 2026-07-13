import { App, PluginSettingTab, Setting, SettingGroup, requireApiVersion, type SettingDefinitionItem } from 'obsidian';
import FeaturedImage from './main';
import { strings } from './i18n';

export interface FeaturedImageSettings {
    // Basic settings (always visible)
    showNotificationsOnUpdate: boolean;
    runAutomaticallyWhileEditing: boolean;
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
    frontmatterImageSourceProperties: string[];
    mediaLinkFormat: 'plain' | 'wiki' | 'embed';
    onlyUpdateExisting: boolean;
    keepEmptyProperty: boolean;
    preserveTemplateImages: boolean;
    requireExclamationForYouTube: boolean;
    downloadExternalImages: boolean;
    downloadYoutubeThumbnails: boolean;
    debugMode: boolean;
    dryRun: boolean;

    // Internal settings
    lastShownVersion: string;
}

export const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] as const;

export const DEFAULT_SETTINGS: FeaturedImageSettings = {
    // Basic settings (always visible)
    showNotificationsOnUpdate: true,
    runAutomaticallyWhileEditing: true,
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
    frontmatterImageSourceProperties: [],
    mediaLinkFormat: 'plain',
    onlyUpdateExisting: false,
    keepEmptyProperty: false,
    preserveTemplateImages: false,
    requireExclamationForYouTube: true,
    downloadExternalImages: true,
    downloadYoutubeThumbnails: true,
    debugMode: false,
    dryRun: false,

    // Internal settings
    lastShownVersion: ''
};

type SettingsControlKey = Exclude<keyof FeaturedImageSettings, 'lastShownVersion'>;

type SupportedSettingControl =
    | { type: 'toggle'; key: SettingsControlKey }
    | { type: 'dropdown'; key: SettingsControlKey; options: Record<string, string> }
    | { type: 'text'; key: SettingsControlKey; placeholder?: string }
    | { type: 'textarea'; key: SettingsControlKey; placeholder?: string; rows?: number }
    | {
          type: 'number';
          key: SettingsControlKey;
          defaultValue?: number;
          placeholder?: string;
          min?: number;
          max?: number;
          step?: number | 'any';
      };

interface FeaturedImageSettingBase {
    name: string;
    desc?: string;
    searchable?: boolean | (() => boolean);
    visible?: boolean | (() => boolean);
}

type FeaturedImageSettingDefinition = FeaturedImageSettingBase &
    (
        | { control: SupportedSettingControl; render?: never }
        | { render: (setting: Setting) => void; control?: never }
        | { control?: never; render?: never }
    );

interface FeaturedImageSettingGroup {
    type: 'group';
    heading?: string;
    cls?: string;
    items: FeaturedImageSettingDefinition[];
}

type FeaturedImageSettingItem = FeaturedImageSettingDefinition | FeaturedImageSettingGroup;

interface LegacyGroupController {
    rootEl: HTMLElement;
    addSetting: (configure: (setting: Setting) => void) => Setting;
}

export class FeaturedImageSettingsTab extends PluginSettingTab {
    plugin: FeaturedImage;
    private legacyVisibilityUpdaters: (() => void)[] = [];

    constructor(app: App, plugin: FeaturedImage) {
        super(app, plugin);
        this.plugin = plugin;
        this.icon = 'wallpaper';
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        if (!requireApiVersion('1.13.0')) {
            return [];
        }

        return this.createSettingDefinitions();
    }

    private createSettingDefinitions(): FeaturedImageSettingItem[] {
        const resizedSettingsVisible = () => this.plugin.settings.createResizedThumbnail;
        const alignmentSettingsVisible = () => this.plugin.settings.createResizedThumbnail && this.plugin.settings.fillResizedDimensions;

        return [
            {
                name: strings.settings.items.whatsNew.name.replace('{version}', this.plugin.manifest.version),
                desc: strings.settings.items.whatsNew.desc,
                render: setting => {
                    setting.addButton(button =>
                        button.setButtonText(strings.settings.items.whatsNew.buttonText).onClick(() => {
                            void this.openWhatsNewModal();
                        })
                    );
                }
            },
            {
                name: strings.settings.items.showNotifications.name,
                desc: strings.settings.items.showNotifications.desc,
                control: { type: 'toggle', key: 'showNotificationsOnUpdate' }
            },
            {
                name: strings.settings.items.runAutomaticallyWhileEditing.name,
                desc: strings.settings.items.runAutomaticallyWhileEditing.desc,
                control: { type: 'toggle', key: 'runAutomaticallyWhileEditing' }
            },
            {
                name: strings.settings.items.frontmatterProperty.name,
                desc: strings.settings.items.frontmatterProperty.desc,
                control: {
                    type: 'text',
                    key: 'frontmatterProperty',
                    placeholder: DEFAULT_SETTINGS.frontmatterProperty
                }
            },
            {
                name: strings.settings.items.thumbnailsFolder.name,
                desc: strings.settings.items.thumbnailsFolder.desc,
                control: {
                    type: 'text',
                    key: 'thumbnailsFolder',
                    placeholder: DEFAULT_SETTINGS.thumbnailsFolder
                }
            },
            {
                name: strings.settings.items.excludedFolders.name,
                desc: strings.settings.items.excludedFolders.desc,
                control: { type: 'textarea', key: 'excludedFolders', rows: 2 }
            },
            {
                type: 'group',
                heading: strings.settings.headings.frontmatter,
                items: [
                    {
                        name: strings.settings.items.frontmatterImageSourceProperties.name,
                        desc: strings.settings.items.frontmatterImageSourceProperties.desc,
                        control: { type: 'textarea', key: 'frontmatterImageSourceProperties', rows: 2 }
                    },
                    {
                        name: strings.settings.items.mediaLinkFormat.name,
                        desc: strings.settings.items.mediaLinkFormat.desc,
                        control: {
                            type: 'dropdown',
                            key: 'mediaLinkFormat',
                            options: {
                                plain: 'image.png',
                                wiki: '[[image.png]]',
                                embed: '![[image.png]]'
                            }
                        }
                    },
                    {
                        name: strings.settings.items.onlyUpdateExisting.name,
                        desc: strings.settings.items.onlyUpdateExisting.desc,
                        control: { type: 'toggle', key: 'onlyUpdateExisting' }
                    },
                    {
                        name: strings.settings.items.keepEmptyProperty.name,
                        desc: strings.settings.items.keepEmptyProperty.desc,
                        control: { type: 'toggle', key: 'keepEmptyProperty' }
                    },
                    {
                        name: strings.settings.items.preserveTemplateImages.name,
                        desc: strings.settings.items.preserveTemplateImages.desc,
                        control: { type: 'toggle', key: 'preserveTemplateImages' }
                    }
                ]
            },
            {
                type: 'group',
                heading: strings.settings.headings.externalMedia,
                items: [
                    {
                        name: strings.settings.items.downloadExternalImages.name,
                        desc: strings.settings.items.downloadExternalImages.desc,
                        control: { type: 'toggle', key: 'downloadExternalImages' }
                    },
                    {
                        name: strings.settings.items.downloadYoutubeThumbnails.name,
                        desc: strings.settings.items.downloadYoutubeThumbnails.desc,
                        control: { type: 'toggle', key: 'downloadYoutubeThumbnails' }
                    },
                    {
                        name: strings.settings.items.requireExclamationForYouTube.name,
                        desc: strings.settings.items.requireExclamationForYouTube.desc,
                        control: { type: 'toggle', key: 'requireExclamationForYouTube' }
                    }
                ]
            },
            {
                type: 'group',
                heading: strings.settings.headings.resizeThumbnail,
                cls: 'resize-thumbnail-settings',
                items: [
                    {
                        name: strings.settings.items.resizeFeatureImage.name,
                        desc: strings.settings.items.resizeFeatureImage.desc,
                        control: { type: 'toggle', key: 'createResizedThumbnail' }
                    },
                    {
                        name: strings.settings.items.resizedThumbnailProperty.name,
                        desc: strings.settings.items.resizedThumbnailProperty.desc,
                        visible: resizedSettingsVisible,
                        control: {
                            type: 'text',
                            key: 'resizedFrontmatterProperty',
                            placeholder: strings.settings.items.resizedThumbnailProperty.placeholder
                        }
                    },
                    {
                        name: strings.settings.items.maxResizedWidth.name,
                        desc: strings.settings.items.maxResizedWidth.desc,
                        visible: resizedSettingsVisible,
                        control: {
                            type: 'number',
                            key: 'maxResizedWidth',
                            defaultValue: DEFAULT_SETTINGS.maxResizedWidth,
                            placeholder: String(DEFAULT_SETTINGS.maxResizedWidth)
                        }
                    },
                    {
                        name: strings.settings.items.maxResizedHeight.name,
                        desc: strings.settings.items.maxResizedHeight.desc,
                        visible: resizedSettingsVisible,
                        control: {
                            type: 'number',
                            key: 'maxResizedHeight',
                            defaultValue: DEFAULT_SETTINGS.maxResizedHeight,
                            placeholder: String(DEFAULT_SETTINGS.maxResizedHeight)
                        }
                    },
                    {
                        name: strings.settings.items.fillResizedDimensions.name,
                        desc: strings.settings.items.fillResizedDimensions.desc,
                        visible: resizedSettingsVisible,
                        control: { type: 'toggle', key: 'fillResizedDimensions' }
                    },
                    {
                        name: strings.settings.items.verticalAlignment.name,
                        desc: strings.settings.items.verticalAlignment.desc,
                        visible: alignmentSettingsVisible,
                        control: {
                            type: 'dropdown',
                            key: 'resizedVerticalAlign',
                            options: strings.settings.items.verticalAlignment.options
                        }
                    },
                    {
                        name: strings.settings.items.horizontalAlignment.name,
                        desc: strings.settings.items.horizontalAlignment.desc,
                        visible: alignmentSettingsVisible,
                        control: {
                            type: 'dropdown',
                            key: 'resizedHorizontalAlign',
                            options: strings.settings.items.horizontalAlignment.options
                        }
                    },
                    {
                        name: '',
                        desc: strings.settings.info.rerenderTip,
                        searchable: false,
                        visible: resizedSettingsVisible
                    }
                ]
            },
            {
                type: 'group',
                heading: strings.settings.headings.advanced,
                cls: 'advanced-settings',
                items: [
                    {
                        name: strings.settings.items.debugMode.name,
                        desc: strings.settings.items.debugMode.desc,
                        control: { type: 'toggle', key: 'debugMode' }
                    },
                    {
                        name: strings.settings.items.dryRun.name,
                        desc: strings.settings.items.dryRun.desc,
                        control: { type: 'toggle', key: 'dryRun' }
                    }
                ]
            }
        ];
    }

    getControlValue(key: string): unknown {
        switch (key) {
            case 'excludedFolders':
                return this.plugin.settings.excludedFolders.join(',');
            case 'frontmatterImageSourceProperties':
                return this.plugin.settings.frontmatterImageSourceProperties.join(',');
            case 'showNotificationsOnUpdate':
            case 'runAutomaticallyWhileEditing':
            case 'frontmatterProperty':
            case 'thumbnailsFolder':
            case 'mediaLinkFormat':
            case 'onlyUpdateExisting':
            case 'keepEmptyProperty':
            case 'preserveTemplateImages':
            case 'downloadExternalImages':
            case 'downloadYoutubeThumbnails':
            case 'requireExclamationForYouTube':
            case 'createResizedThumbnail':
            case 'resizedFrontmatterProperty':
            case 'maxResizedWidth':
            case 'maxResizedHeight':
            case 'fillResizedDimensions':
            case 'resizedVerticalAlign':
            case 'resizedHorizontalAlign':
            case 'debugMode':
            case 'dryRun':
                return this.plugin.settings[key];
            default:
                return undefined;
        }
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        const settings = this.plugin.settings;

        switch (key) {
            case 'showNotificationsOnUpdate':
            case 'runAutomaticallyWhileEditing':
            case 'onlyUpdateExisting':
            case 'keepEmptyProperty':
            case 'preserveTemplateImages':
            case 'downloadExternalImages':
            case 'downloadYoutubeThumbnails':
            case 'requireExclamationForYouTube':
            case 'createResizedThumbnail':
            case 'fillResizedDimensions':
            case 'debugMode':
            case 'dryRun':
                if (typeof value !== 'boolean') {
                    return;
                }
                settings[key] = value;
                break;
            case 'frontmatterProperty':
                if (typeof value !== 'string') {
                    return;
                }
                settings.frontmatterProperty = value;
                break;
            case 'thumbnailsFolder': {
                if (typeof value !== 'string') {
                    return;
                }
                const sanitizedValue = value.trim();
                settings.thumbnailsFolder = sanitizedValue ? sanitizedValue.replace(/\/$/, '') : DEFAULT_SETTINGS.thumbnailsFolder;
                break;
            }
            case 'excludedFolders':
                if (typeof value !== 'string') {
                    return;
                }
                settings.excludedFolders = value
                    .split(',')
                    .map(folder => folder.trim().replace(/\/$/, ''))
                    .filter(Boolean);
                break;
            case 'frontmatterImageSourceProperties': {
                if (typeof value !== 'string') {
                    return;
                }
                const properties = value
                    .split(',')
                    .map(property => property.trim())
                    .filter(Boolean);
                settings.frontmatterImageSourceProperties = Array.from(new Set(properties));
                break;
            }
            case 'mediaLinkFormat':
                if (value !== 'plain' && value !== 'wiki' && value !== 'embed') {
                    return;
                }
                settings.mediaLinkFormat = value;
                break;
            case 'resizedFrontmatterProperty':
                if (typeof value !== 'string') {
                    return;
                }
                settings.resizedFrontmatterProperty = value || DEFAULT_SETTINGS.resizedFrontmatterProperty;
                break;
            case 'maxResizedWidth':
            case 'maxResizedHeight': {
                const parsedValue = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
                settings[key] = Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : DEFAULT_SETTINGS[key];
                break;
            }
            case 'resizedVerticalAlign':
                if (value !== 'top' && value !== 'center' && value !== 'bottom') {
                    return;
                }
                settings.resizedVerticalAlign = value;
                break;
            case 'resizedHorizontalAlign':
                if (value !== 'left' && value !== 'center' && value !== 'right') {
                    return;
                }
                settings.resizedHorizontalAlign = value;
                break;
            default:
                return;
        }

        await this.plugin.saveSettings();
        this.refreshSettingsDomState();
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        this.legacyVisibilityUpdaters = [];

        const topGroup = this.createLegacyGroup(containerEl);
        for (const item of this.createSettingDefinitions()) {
            if (this.isSettingGroup(item)) {
                this.renderLegacyGroup(containerEl, item);
            } else {
                topGroup.addSetting(setting => {
                    this.configureLegacySetting(setting, item);
                });
            }
        }

        this.refreshLegacySettingsDomState();
    }

    private isSettingGroup(item: FeaturedImageSettingItem): item is FeaturedImageSettingGroup {
        return 'type' in item && item.type === 'group';
    }

    private createLegacyGroup(containerEl: HTMLElement, heading?: string, cls?: string): LegacyGroupController {
        const rootEl = containerEl.createDiv(cls);
        rootEl.addClass('setting-group');
        const group = new SettingGroup(rootEl).addClass('setting-group');
        if (heading) {
            group.setHeading(heading);
        }

        return {
            rootEl,
            addSetting: configure => {
                let created!: Setting;
                group.addSetting(setting => {
                    created = setting;
                    configure(setting);
                });
                return created;
            }
        };
    }

    private renderLegacyGroup(containerEl: HTMLElement, definitionGroup: FeaturedImageSettingGroup): void {
        const group = this.createLegacyGroup(containerEl, definitionGroup.heading, definitionGroup.cls);
        if (definitionGroup.cls !== 'resize-thumbnail-settings') {
            for (const definition of definitionGroup.items) {
                group.addSetting(setting => {
                    this.configureLegacySetting(setting, definition);
                });
            }
            return;
        }

        const [resizeToggleDefinition, ...thumbnailDefinitions] = definitionGroup.items;
        if (!resizeToggleDefinition) {
            return;
        }

        const resizeToggleSetting = group.addSetting(setting => {
            this.configureLegacySetting(setting, resizeToggleDefinition);
        });
        const thumbnailSettingsEl = group.rootEl.createDiv('thumbnail-settings');
        resizeToggleSetting.settingEl.after(thumbnailSettingsEl);

        let alignmentSettingsEl: HTMLElement | undefined;
        for (const definition of thumbnailDefinitions) {
            const key = definition.control?.key;
            const isAlignmentSetting = key === 'resizedVerticalAlign' || key === 'resizedHorizontalAlign';
            if (isAlignmentSetting && !alignmentSettingsEl) {
                alignmentSettingsEl = thumbnailSettingsEl.createDiv('alignment-settings');
            }

            const parentEl = isAlignmentSetting && alignmentSettingsEl ? alignmentSettingsEl : thumbnailSettingsEl;
            this.configureLegacySetting(new Setting(parentEl), definition);
        }

        this.legacyVisibilityUpdaters.push(() => {
            thumbnailSettingsEl.style.display = this.plugin.settings.createResizedThumbnail ? 'block' : 'none';
        });

        if (alignmentSettingsEl) {
            this.legacyVisibilityUpdaters.push(() => {
                alignmentSettingsEl.style.display =
                    this.plugin.settings.createResizedThumbnail && this.plugin.settings.fillResizedDimensions ? 'block' : 'none';
            });
        }
    }

    private configureLegacySetting(setting: Setting, definition: FeaturedImageSettingDefinition): void {
        setting.setName(definition.name);
        if (definition.desc !== undefined) {
            setting.setDesc(definition.desc);
        }

        if (definition.render) {
            definition.render(setting);
        } else if (definition.control) {
            this.addLegacyControl(setting, definition.control);
        }

        this.legacyVisibilityUpdaters.push(() => {
            const visible = typeof definition.visible === 'function' ? definition.visible() : definition.visible !== false;
            setting.settingEl.style.display = visible ? '' : 'none';
        });
    }

    private addLegacyControl(setting: Setting, control: SupportedSettingControl): void {
        const value = this.getControlValue(control.key);

        switch (control.type) {
            case 'toggle':
                setting.addToggle(toggle => {
                    toggle.setValue(value === true).onChange(async nextValue => {
                        await this.setControlValue(control.key, nextValue);
                    });
                });
                break;
            case 'dropdown':
                setting.addDropdown(dropdown => {
                    for (const [optionValue, label] of Object.entries(control.options)) {
                        dropdown.addOption(optionValue, label);
                    }
                    dropdown.setValue(typeof value === 'string' ? value : '').onChange(async nextValue => {
                        await this.setControlValue(control.key, nextValue);
                    });
                });
                break;
            case 'text':
                setting.addText(text => {
                    if (control.placeholder) {
                        text.setPlaceholder(control.placeholder);
                    }
                    text.setValue(typeof value === 'string' ? value : '').onChange(async nextValue => {
                        await this.setControlValue(control.key, nextValue);
                    });
                });
                break;
            case 'textarea':
                setting.addTextArea(text => {
                    if (control.placeholder) {
                        text.setPlaceholder(control.placeholder);
                    }
                    if (control.rows !== undefined) {
                        text.inputEl.rows = control.rows;
                    }
                    text.setValue(typeof value === 'string' ? value : '').onChange(async nextValue => {
                        await this.setControlValue(control.key, nextValue);
                    });
                });
                break;
            case 'number':
                setting.addText(text => {
                    text.inputEl.type = 'number';
                    if (control.placeholder) {
                        text.setPlaceholder(control.placeholder);
                    }
                    if (control.min !== undefined) {
                        text.inputEl.min = String(control.min);
                    }
                    if (control.max !== undefined) {
                        text.inputEl.max = String(control.max);
                    }
                    if (control.step !== undefined) {
                        text.inputEl.step = String(control.step);
                    }

                    const initialValue = typeof value === 'number' ? value : (control.defaultValue ?? 0);
                    text.setValue(String(initialValue)).onChange(async nextValue => {
                        await this.setControlValue(control.key, nextValue);
                    });
                });
                break;
        }
    }

    private refreshLegacySettingsDomState(): void {
        for (const updateVisibility of this.legacyVisibilityUpdaters) {
            updateVisibility();
        }
    }

    private async openWhatsNewModal(): Promise<void> {
        const { WhatsNewModal } = await import('./modals/WhatsNewModal');
        const { getLatestReleaseNotes } = await import('./releaseNotes');
        const fundingUrl = (this.plugin.manifest as unknown as { fundingUrl?: string }).fundingUrl;
        new WhatsNewModal(this.app, getLatestReleaseNotes(), fundingUrl).open();
    }

    private refreshSettingsDomState(): void {
        const refreshDomState: unknown = Reflect.get(this, 'refreshDomState');
        if (typeof refreshDomState === 'function') {
            refreshDomState.call(this);
        }
        this.refreshLegacySettingsDomState();
    }
}
