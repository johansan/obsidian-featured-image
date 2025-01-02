import { App, PluginSettingTab, Setting } from 'obsidian'
import FeaturedImage from './main'

export interface FeaturedImageSettings {
  showNotificationsOnUpdate: boolean;
  excludedFolders: string[];

  // Frontmatter settings
	frontmatterProperty: string;
  mediaLinkFormat: 'plain' | 'wiki' | 'embed';
  onlyUpdateExisting: boolean;
  keepEmptyProperty: boolean;
  useMediaLinks: boolean; // TODO: Remove in the future, it has been replaced by mediaLinkFormat

  // YouTube settings
  requireExclamationForYouTube: boolean;
  downloadWebP: boolean;

  // Local media settings
  thumbnailDownloadFolder: string;
  imageExtensions: string[];

  // Developer options
  debugMode: boolean;
  dryRun: boolean;
}

export const DEFAULT_SETTINGS: FeaturedImageSettings = {
  showNotificationsOnUpdate: false,
  excludedFolders: [],

  // Frontmatter settings
	frontmatterProperty: 'feature',
  mediaLinkFormat: 'plain',
  onlyUpdateExisting: false,
  keepEmptyProperty: false,
  useMediaLinks: false, // TODO: Remove in the future, it has been replaced by mediaLinkFormat

  // YouTube settings
  requireExclamationForYouTube: true,
  downloadWebP: true,

  // Local media settings
  thumbnailDownloadFolder: 'thumbnails',
  imageExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],

  // Developer options
  debugMode: false,
  dryRun: false,
}

export class FeaturedImageSettingsTab extends PluginSettingTab {
  plugin: FeaturedImage

  constructor (app: App, plugin: FeaturedImage) {
    super(app, plugin)
    this.plugin = plugin
  }

  display (): void {
    const { containerEl } = this

    containerEl.empty()

    // Show notifications on update
    new Setting(containerEl)
      .setName('Show notifications')
      .setDesc('Show notifications when the featured image is set, updated or removed.')
      .addToggle(toggle => { toggle
          .setValue(this.plugin.settings.showNotificationsOnUpdate)
          .onChange(async value => {
            this.plugin.settings.showNotificationsOnUpdate = value
            await this.plugin.saveSettings()
          })
      })

    // Excluded folders
    new Setting(containerEl)
      .setName('Excluded folders')
      .setDesc('Comma separated list of folders to exclude from the featured image plugin.')
      .addTextArea(text => text
        .setValue(this.plugin.settings.excludedFolders.join(','))
        .onChange(async value => {
            this.plugin.settings.excludedFolders = value.split(',')
              .map(folder => folder.trim().replace(/\/$/, '')) // Remove trailing slash
            await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Frontmatter')
      .setHeading()

    // Frontmatter property
    new Setting(containerEl)
      .setName('Frontmatter property')
      .setDesc('The name of the frontmatter property to update with the featured image')
      .addText(text => text
        .setPlaceholder(DEFAULT_SETTINGS.frontmatterProperty)
        .setValue(this.plugin.settings.frontmatterProperty)
        .onChange(async value => {
          this.plugin.settings.frontmatterProperty = value
          await this.plugin.saveSettings()
        }))

    // Media link format
    new Setting(containerEl)
    .setName('Media link format')
    .setDesc('Choose how to format the featured image property in frontmatter.')
    .addDropdown(dropdown => dropdown
      .addOption('plain', `${this.plugin.settings.frontmatterProperty}: image.png`)
      .addOption('wiki', `${this.plugin.settings.frontmatterProperty}: [[image.png]]`)
      .addOption('embed', `${this.plugin.settings.frontmatterProperty}: ![[image.png]]`)
      .setValue(this.plugin.settings.mediaLinkFormat)
      .onChange(async value => {
        this.plugin.settings.mediaLinkFormat = value as 'plain' | 'wiki' | 'embed';
        this.plugin.settings.useMediaLinks = value !== 'plain'; // TODO: Remove in the future, it has been replaced by mediaLinkFormat
        await this.plugin.saveSettings();
      }))
  
    // Only update existing fields toggle
    new Setting(containerEl)
      .setName('Only update if frontmatter property exists')
      .setDesc('Enable this to only update the frontmatter property if it already exists.')
      .addToggle(toggle => { toggle
          .setValue(this.plugin.settings.onlyUpdateExisting)
          .onChange(async value => {
            this.plugin.settings.onlyUpdateExisting = value
            await this.plugin.saveSettings()
          })
      })

    // Keep empty property
    new Setting(containerEl)
      .setName('Keep empty property')
      .setDesc('When enabled, the frontmatter property will be kept but set to an empty string if no featured image is found. When disabled, the property will be removed.')
      .addToggle(toggle => { toggle
          .setValue(this.plugin.settings.keepEmptyProperty)
          .onChange(async value => {
            this.plugin.settings.keepEmptyProperty = value
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('YouTube')
      .setHeading()

    // Require exclamation mark for YouTube thumbnails
    new Setting(containerEl)
    .setName('Require exclamation mark for YouTube thumbnails')
    .setDesc('If enabled, only YouTube links prefixed with an exclamation mark will be considered for thumbnail download.')
    .addToggle(toggle => toggle
      .setValue(this.plugin.settings.requireExclamationForYouTube)
      .onChange(async (value) => {
        this.plugin.settings.requireExclamationForYouTube = value;
        await this.plugin.saveSettings();
      }));

    // Download webp
    new Setting(containerEl)
      .setName('Download WebP')
      .setDesc('Download WebP versions of images from YouTube if available, otherwise download JPG.')
      .addToggle(toggle => { toggle
          .setValue(this.plugin.settings.downloadWebP)
          .onChange(async value => {
            this.plugin.settings.downloadWebP = value
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('Local media')
      .setHeading()

    // Thumbnail download folder
    new Setting(containerEl)
      .setName('Thumbnail download folder')
      .setDesc('External images, YouTube thumbnails, and Auto Card Link images will be downloaded to this folder. The plugin will create separate subfolders for each type.')
      .addText(text => text
        .setPlaceholder(DEFAULT_SETTINGS.thumbnailDownloadFolder)
        .setValue(this.plugin.settings.thumbnailDownloadFolder)
        .onChange(async (value) => {
          const sanitizedValue = value.trim();
          if (!sanitizedValue) {
            // Set to default if empty
            this.plugin.settings.thumbnailDownloadFolder = DEFAULT_SETTINGS.thumbnailDownloadFolder;
          } else {
            this.plugin.settings.thumbnailDownloadFolder = sanitizedValue.replace(/\/$/, '');
          }
          await this.plugin.saveSettings();
        }))

    // Local image extensions
    new Setting(containerEl)
      .setName('Local image extensions')
      .setDesc('Comma-separated list of image file extensions to search for in documents.')
      .addText(text => text
        .setPlaceholder('png,jpg,jpeg,gif,webp')
        .setValue(this.plugin.settings.imageExtensions.join(','))
        .onChange(async (value) => {
          const extensions = value.split(',').map(ext => ext.trim()).filter(ext => ext);
          if (extensions.length === 0) {
            // Set to default if empty
            this.plugin.settings.imageExtensions = DEFAULT_SETTINGS.imageExtensions;
          } else {
            this.plugin.settings.imageExtensions = extensions;
          }
          await this.plugin.saveSettings();
        }))

    new Setting(containerEl)
      .setName('Developer')
      .setHeading()

    // Debug mode
    new Setting(containerEl)
      .setName('Debug mode')
      .setDesc('Enable debug mode to log detailed information to the console.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.debugMode)
        .onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          await this.plugin.saveSettings();
        }));

    // Dry run
    new Setting(containerEl)
      .setName('Dry run')
      .setDesc('Enable dry run to prevent any changes from being made to your files.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.dryRun)
        .onChange(async (value) => {
          this.plugin.settings.dryRun = value;
          await this.plugin.saveSettings();
        }));

  }

}
