import { App, PluginSettingTab, Setting } from 'obsidian'
import FeaturedImage from './main'

export interface FeaturedImageSettings {
  showNotificationsOnUpdate: boolean;
  excludedFolders: string[];
	frontmatterProperty: string;
  onlyUpdateExisting: boolean;

  // Youtube settings
  requireExclamationForYoutube: boolean;
  downloadWebP: boolean;

  // Local media settings
  thumbnailDownloadFolder: string;
  imageExtensions: string[];

  // Developer options
  debugMode: boolean;
  dryRun: boolean;

  // Other settings
  hasShownWelcomeModal: boolean;
}

export const DEFAULT_SETTINGS: FeaturedImageSettings = {
  showNotificationsOnUpdate: false,
  excludedFolders: [],

  // Frontmatter settings
	frontmatterProperty: 'feature',
  onlyUpdateExisting: false,

  // Youtube settings
  requireExclamationForYoutube: true,
  downloadWebP: true,

  // Local media settings
  thumbnailDownloadFolder: 'thumbnails',
  imageExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],

  // Developer options
  debugMode: false,
  dryRun: false,

  // Other settings
  hasShownWelcomeModal: false,
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

    containerEl.createEl("h1", { text: "Featured Image" });
    containerEl.createEl("p", { text: "An Obsidian plugin to set a featured image property in your markdown files. Full documentation available at the "}).createEl("a", {
      text: "GitHub Repository",
      href: "https://github.com/johansan/obsidian-featured-image",
    });

    // Add donation text and button
    containerEl.createEl("p", { text: "If you like using this plugin, please consider donating." });
    const donationButton = containerEl.createEl("div");
    donationButton.innerHTML = '<a href="https://www.buymeacoffee.com/johansan" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>';

    new Setting(containerEl)
      .setName('General settings')
      .setHeading()

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
      .setName('Frontmatter settings')
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

    new Setting(containerEl)
      .setName('Youtube settings')
      .setHeading()

      // Require exclamation mark for YouTube thumbnails
      new Setting(containerEl)
      .setName('Require exclamation mark for YouTube thumbnails')
      .setDesc('If enabled, only YouTube links prefixed with an exclamation mark will be considered for thumbnail download.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.requireExclamationForYoutube)
        .onChange(async (value) => {
          this.plugin.settings.requireExclamationForYoutube = value;
          await this.plugin.saveSettings();
        }));

    // Download webp
    new Setting(containerEl)
      .setName('Download WebP')
      .setDesc('Download WebP versions of images from Youtube if available, otherwise download JPG.')
      .addToggle(toggle => { toggle
          .setValue(this.plugin.settings.downloadWebP)
          .onChange(async value => {
            this.plugin.settings.downloadWebP = value
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('Local media settings')
      .setHeading()

    // Thumbnail download folder
    new Setting(containerEl)
      .setName('Thumbnail download folder')
      .setDesc('Youtube thumbnails and external Auto Card Link images will be downloaded to this folder.')
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
      .setName('Developer options')
      .setHeading()

    // Debug mode
    new Setting(containerEl)
      .setName('Debug mode')
      .setDesc('Enable debug mode to log more information to the console.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.debugMode)
        .onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          await this.plugin.saveSettings();
        }));

    // Dry run
    new Setting(containerEl)
      .setName('Dry run')
      .setDesc('Enable dry run to prevent any changes from being made.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.dryRun)
        .onChange(async (value) => {
          this.plugin.settings.dryRun = value;
          await this.plugin.saveSettings();
        }));
  }

}