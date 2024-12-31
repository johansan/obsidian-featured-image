import { App, Modal, Setting, Notice } from "obsidian";
import { FeaturedImageSettings, DEFAULT_SETTINGS } from "./settings";

export class ConfirmationModal extends Modal {
  result: boolean;
  onSubmit: (result: boolean) => void;
  title: string;
  message: string;

  constructor(app: App, title: string, message: string, onSubmit: (result: boolean) => void) {
    super(app);
    this.title = title;
    this.message = message;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.title);
    
    contentEl.empty();
    contentEl.createEl("p", { text: this.message });

    const infoEl = contentEl.createEl("div", { 
      cls: "featured-image-info" 
    });
    infoEl.createEl("p", { 
      text: "Note: The original modification dates of all files will be preserved.",
      cls: "featured-image-info-text"
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Cancel")
          .onClick(() => {
            this.close();
            this.onSubmit(false);
          }))
      .addButton((btn) =>
        btn
          .setButtonText("Proceed")
          .setCta()
          .onClick(() => {
            this.close();
            this.onSubmit(true);
          }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class SettingsExportModal extends Modal {
    private settings: FeaturedImageSettings;
    private settingsText: string;
    private isImport: boolean;
    private onSubmit: (importedSettings: string) => void;

    constructor(app: App, settings: FeaturedImageSettings, isImport: boolean, onSubmit: (importedSettings: string) => void) {
        super(app);
        this.settings = settings;
        this.isImport = isImport;
        this.onSubmit = onSubmit;
        this.settingsText = this.isImport ? '' : this.serializeSettings(settings);
    }

    private serializeSettings(settings: FeaturedImageSettings): string {
        // Only export settings that differ from defaults
        const settingsToExport = Object.entries(settings)
            .filter(([key, value]) => {
                const defaultValue = DEFAULT_SETTINGS[key as keyof FeaturedImageSettings];
                // Handle arrays specially since they need deep comparison
                if (Array.isArray(value) && Array.isArray(defaultValue)) {
                    return JSON.stringify(value) !== JSON.stringify(defaultValue);
                }
                // Handle null/undefined values
                if (value === null || value === undefined) {
                    return false;
                }
                return value !== defaultValue;
            })
            .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
            .join('\n');

        return settingsToExport || '# No custom settings found';
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText(this.isImport ? 'Import Settings' : 'Export Settings');
        
        contentEl.empty();
        contentEl.createEl("p", { 
            text: this.isImport 
                ? "Paste settings text below to import" 
                : "Copy the text below to export settings"
        });

        const textArea = contentEl.createEl("textarea", {
            attr: {
                rows: "10",
                style: "width: 100%; font-family: monospace; resize: vertical;"
            }
        });
        
        if (!this.isImport) {
            textArea.value = this.settingsText;
            textArea.readOnly = true;
        } else {
            // Add placeholder for import
            textArea.placeholder = "Paste settings here...";
        }

        // Add buttons container for better layout
        const buttonContainer = contentEl.createDiv("modal-button-container");

        new Setting(buttonContainer)
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .onClick(() => {
                        this.close();
                    }));

        if (this.isImport) {
            new Setting(buttonContainer)
                .addButton((btn) =>
                    btn
                        .setButtonText("Import")
                        .setCta()
                        .onClick(() => {
                            const value = textArea.value.trim();
                            if (!value) {
                                new Notice("No settings to import");
                                return;
                            }
                            this.onSubmit(value);
                            this.close();
                        }));
        } else {
            new Setting(buttonContainer)
                .addButton((btn) =>
                    btn
                        .setButtonText("Copy to Clipboard")
                        .setCta()
                        .onClick(() => {
                            navigator.clipboard.writeText(textArea.value)
                                .then(() => {
                                    textArea.select();
                                    new Notice("Settings copied to clipboard!");
                                })
                                .catch(err => {
                                    console.error('Failed to copy settings:', err);
                                    new Notice("Failed to copy settings to clipboard");
                                });
                        }));
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
