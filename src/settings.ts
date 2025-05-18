import { App, PluginSettingTab, Setting } from 'obsidian'
import FeaturedImage from './main'

export interface FeaturedImageSettings {
  showNotificationsOnUpdate: boolean;
  excludedFolders: string[];

  // Frontmatter settings
	frontmatterProperty: string;
  mediaLinkFormat: 'plain' | 'wiki' | 'embed';
  useMediaLinks: boolean; // TODO: Remove in the future, it has been replaced by mediaLinkFormat
  onlyUpdateExisting: boolean;
  keepEmptyProperty: boolean;
  preserveTemplateImages: boolean;

  // YouTube settings
  requireExclamationForYouTube: boolean;
  downloadWebP: boolean;

  // Local media settings
  thumbnailDownloadFolder: string;
  imageExtensions: string[];
  
  // Thumbnail settings
  createResizedThumbnail: boolean;
  resizedFrontmatterProperty: string;
  maxResizedWidth: number;
  maxResizedHeight: number;
  fillResizedDimensions: boolean;
  resizedVerticalAlign: 'top' | 'center' | 'bottom';
  resizedHorizontalAlign: 'left' | 'center' | 'right';

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
  useMediaLinks: false, // TODO: Remove in the future, it has been replaced by mediaLinkFormat
  onlyUpdateExisting: false,
  keepEmptyProperty: false,
  preserveTemplateImages: false,

  // YouTube settings
  requireExclamationForYouTube: true,
  downloadWebP: true,

  // Local media settings
  thumbnailDownloadFolder: 'thumbnails',
  imageExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  
  // Thumbnail settings
  createResizedThumbnail: false,
  resizedFrontmatterProperty: 'featureResized',
  maxResizedWidth: 0,
  maxResizedHeight: 0,
  fillResizedDimensions: false,
  resizedVerticalAlign: 'top',
  resizedHorizontalAlign: 'center',

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

    // Preserve template images
    new Setting(containerEl)
      .setName('Preserve template images')
      .setDesc('When enabled, existing featured images will be preserved if no new image is found in the document. This helps maintain banner images set via templates.')
      .addToggle(toggle => { toggle
          .setValue(this.plugin.settings.preserveTemplateImages)
          .onChange(async value => {
            this.plugin.settings.preserveTemplateImages = value;
            await this.plugin.saveSettings();
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

    // Download folder
    new Setting(containerEl)
      .setName('Download folder')
      .setDesc('Folder for downloaded thumbnails and resized images. Subfolders will be created automatically for different image types. Existing files in the folder will not be touched.')
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
      .setName('Resized thumbnail')
      .setHeading()
    
    // Create resized thumbnail
    const createResizedThumbnailSetting = new Setting(containerEl)
      .setName('Create resized thumbnail')
      .setDesc('Create a resized thumbnail of the featured image and add it to the frontmatter.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.createResizedThumbnail)
        .onChange(async (value) => {
          this.plugin.settings.createResizedThumbnail = value;
          
          // When enabling, set the resized property to frontmatterPropertyResized
          if (value) {
              this.plugin.settings.resizedFrontmatterProperty = `${this.plugin.settings.frontmatterProperty}Resized`;
              
              // Update the text field value
              const textComponent = resizedPropertySetting.components[0] as any;
              if (textComponent && textComponent.setValue) {
                  textComponent.setValue(this.plugin.settings.resizedFrontmatterProperty);
              }
          }
          
          await this.plugin.saveSettings();
          
          // Update visibility of dependent settings
          updateThumbnailSettingsVisibility(value);
        }));
        
    // Create thumbnail settings container
    const thumbnailSettingsEl = containerEl.createDiv('thumbnail-settings');
    
    // Resized frontmatter property
    const resizedPropertySetting = new Setting(thumbnailSettingsEl)
      .setName('Resized thumbnail frontmatter property')
      .setDesc('The name of the frontmatter property to store the resized thumbnail path.')
      .addText(text => text
        .setPlaceholder(`${this.plugin.settings.frontmatterProperty}Resized`)
        .setValue(this.plugin.settings.resizedFrontmatterProperty)
        .onChange(async (value) => {
          this.plugin.settings.resizedFrontmatterProperty = value || `${this.plugin.settings.frontmatterProperty}Resized`;
          await this.plugin.saveSettings();
        }));
    
    // Max resized width
    const maxWidthSetting = new Setting(thumbnailSettingsEl)
      .setName('Max resized width')
      .setDesc('Maximum width of the resized thumbnail in pixels. Use 0 for no width restriction.')
      .addText(text => text
        .setPlaceholder('0')
        .setValue(String(this.plugin.settings.maxResizedWidth))
        .onChange(async (value) => {
          const width = parseInt(value);
          this.plugin.settings.maxResizedWidth = isNaN(width) ? 0 : width;
          await this.plugin.saveSettings();
        }));
    
    // Max resized height
    const maxHeightSetting = new Setting(thumbnailSettingsEl)
      .setName('Max resized height')
      .setDesc('Maximum height of the resized thumbnail in pixels. Use 0 for no height restriction.')
      .addText(text => text
        .setPlaceholder('0')
        .setValue(String(this.plugin.settings.maxResizedHeight))
        .onChange(async (value) => {
          const height = parseInt(value);
          this.plugin.settings.maxResizedHeight = isNaN(height) ? 0 : height;
          await this.plugin.saveSettings();
        }));
    
    // Fill resized dimensions
    const fillDimensionsSetting = new Setting(thumbnailSettingsEl)
      .setName('Fill resized dimensions')
      .setDesc('When enabled, resized thumbnails will be exactly the size specified by max width and height, maintaining aspect ratio and cropping to fill the dimensions.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.fillResizedDimensions)
        .onChange(async (value) => {
          this.plugin.settings.fillResizedDimensions = value;
          await this.plugin.saveSettings();
          updateAlignmentSettingsVisibility(value);
        }));
    
    // Create alignment settings container
    const alignmentSettingsEl = thumbnailSettingsEl.createDiv('alignment-settings');
    
    // Vertical alignment setting
    const verticalAlignSetting = new Setting(alignmentSettingsEl)
      .setName('Vertical alignment')
      .setDesc('Choose the vertical alignment for cropped images.')
      .addDropdown(dropdown => dropdown
        .addOption('top', 'Top')
        .addOption('center', 'Center')
        .addOption('bottom', 'Bottom')
        .setValue(this.plugin.settings.resizedVerticalAlign)
        .onChange(async (value) => {
          this.plugin.settings.resizedVerticalAlign = value as 'top' | 'center' | 'bottom';
          await this.plugin.saveSettings();
        }));
    
    // Horizontal alignment setting
    const horizontalAlignSetting = new Setting(alignmentSettingsEl)
      .setName('Horizontal alignment')
      .setDesc('Choose the horizontal alignment for cropped images.')
      .addDropdown(dropdown => dropdown
        .addOption('left', 'Left')
        .addOption('center', 'Center')
        .addOption('right', 'Right')
        .setValue(this.plugin.settings.resizedHorizontalAlign)
        .onChange(async (value) => {
          this.plugin.settings.resizedHorizontalAlign = value as 'left' | 'center' | 'right';
          await this.plugin.saveSettings();
        }));
    
    // Function to update thumbnail settings visibility
    const updateThumbnailSettingsVisibility = (show: boolean) => {
      thumbnailSettingsEl.style.display = show ? 'block' : 'none';
      // Also update alignment settings visibility when thumbnail settings change
      if (show) {
        updateAlignmentSettingsVisibility(this.plugin.settings.fillResizedDimensions);
      }
    };
    
    // Function to update alignment settings visibility
    const updateAlignmentSettingsVisibility = (show: boolean) => {
      alignmentSettingsEl.style.display = show ? 'block' : 'none';
    };
    
    // Initial visibility based on current settings
    updateThumbnailSettingsVisibility(this.plugin.settings.createResizedThumbnail);
    updateAlignmentSettingsVisibility(this.plugin.settings.createResizedThumbnail && this.plugin.settings.fillResizedDimensions);
    
    // Add information about re-rendering thumbnails
    const infoEl = thumbnailSettingsEl.createDiv('thumbnail-info');
    infoEl.createEl('p', {
      text: 'Tip: After changing alignment or dimension settings, run the command "Re-render all resized thumbnails" from the command palette to update existing thumbnails with the new settings.',
      cls: 'setting-item-description'
    });

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
