import { App, PluginSettingTab, Setting } from 'obsidian'
import FeaturedImage from './main'

export interface FeaturedImageSettings {
  showNotificationsOnUpdate: boolean;
  excludedFolders: string[];
	frontmatterProperty: string;
  onlyUpdateExisting: boolean;
  downloadWebP: boolean;
  youtubeDownloadFolder: string;
  imageExtensions: string[];
}

export const DEFAULT_SETTINGS: FeaturedImageSettings = {
  showNotificationsOnUpdate: true,
  excludedFolders: [],
	frontmatterProperty: 'feature',
  onlyUpdateExisting: false,
  downloadWebP: false,
  youtubeDownloadFolder: 'thumbnails/',
  imageExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
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
            this.plugin.settings.excludedFolders = value.split(',').map(folder => folder.trim())
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
      .setName('Media settings')
      .setHeading()

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

    // Youtube download folder
    new Setting(containerEl)
      .setName('Youtube thumbnail download folder')
      .setDesc('Youtube thumbnails will be downloaded to this folder.')
      .addText(text => text
        .setPlaceholder(DEFAULT_SETTINGS.youtubeDownloadFolder)
        .setValue(this.plugin.settings.youtubeDownloadFolder)
        .onChange(async value => {
          this.plugin.settings.youtubeDownloadFolder = value
          await this.plugin.saveSettings()
        }))

    // Local image extensions
    new Setting(containerEl)
      .setName('Local image extensions')
      .setDesc('Comma-separated list of image file extensions to search for in documents.')
      .addText(text => text
        .setPlaceholder('png,jpg,jpeg,gif,webp')
        .setValue(this.plugin.settings.imageExtensions.join(','))
        .onChange(async (value) => {
          this.plugin.settings.imageExtensions = value.split(',').map(ext => ext.trim());
          await this.plugin.saveSettings();
        }));
  }
}