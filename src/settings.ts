import { App, PluginSettingTab, Setting } from 'obsidian'
import FeaturedImage from './main'

export interface FeaturedImageSettings {
  showNotificationsOnUpdate: boolean;
  excludedFolders: string[];
	frontmatterProperty: string;
  onlyUpdateExisting: boolean;
  youtubeDownloadFolder: string;
  openGraphDownloadFolder: string;
}

export const DEFAULT_SETTINGS: FeaturedImageSettings = {
  showNotificationsOnUpdate: true,
  excludedFolders: [],
	frontmatterProperty: 'feature',
  onlyUpdateExisting: false,
  youtubeDownloadFolder: 'thumbnails/',
  openGraphDownloadFolder: 'opengraph/'
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
      .setDesc('If you turn this on, it will only update your frontmatter property if it already exists.')
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
  
    // Youtube download folder
    new Setting(containerEl)
      .setName('Youtube thumbnail download folder')
      .setDesc('Where to save Youtube thumbnails.')
      .addText(text => text
        .setPlaceholder(DEFAULT_SETTINGS.youtubeDownloadFolder)
        .setValue(this.plugin.settings.youtubeDownloadFolder)
        .onChange(async value => {
          this.plugin.settings.youtubeDownloadFolder = value
          await this.plugin.saveSettings()
        }))

    // OpenGraph download folder
    new Setting(containerEl)
      .setName('OpenGraph download folder')
      .setDesc('Where to save OpenGraph preview images.')
      .addText(text => text
        .setPlaceholder(DEFAULT_SETTINGS.openGraphDownloadFolder)
        .setValue(this.plugin.settings.openGraphDownloadFolder)
        .onChange(async value => {
          this.plugin.settings.openGraphDownloadFolder = value
          await this.plugin.saveSettings()
        }))
        

  }
}