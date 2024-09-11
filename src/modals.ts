import { App, Modal, Setting } from "obsidian";
import { FeaturedImageSettings } from "./settings";

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

    const warningEl = contentEl.createEl("p", { cls: "featured-image-warning" });
    warningEl.innerHTML = "<strong>Important!</strong> This function will change the modification date of all files that have been processed. This will change your sort order if you sort by modified date.";
    warningEl.style.cssText = "background-color: #ffeb3b; padding: 10px; border-radius: 5px; margin-top: 10px;";

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

export class WelcomeModal extends Modal {
  settings: FeaturedImageSettings;

  constructor(app: App, settings: FeaturedImageSettings) {
    super(app);
    this.settings = settings;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText("Welcome to Featured Image!");
    
    contentEl.empty();
    
    contentEl.createEl("p", { text: "Featured Image is a plugin for Obsidian to automatically set a \"Featured image\" property in your notes based on the first image or YouTube link in the document. You can use Featured Image together with plugins like Folder Notes and Dataview to create amazing galleries and lists of your notes." });
    
    contentEl.createEl("h4", { text: "Key Features:" });
    const featureList = contentEl.createEl("ul");
    featureList.createEl("li", { text: "Automatically updates Frontmatter with a featured image" });
    featureList.createEl("li", { text: "Supports both local images and YouTube thumbnails" });
    featureList.createEl("li", { text: "Bulk update commands for all documents, search for \"Featured Image\" in the command palette" });
    featureList.createEl("li", { text: "Uses very little memory and is highly optimized for performance" });
    featureList.createEl("li", { text: "Works on both mobile and desktop" });
    
    contentEl.createEl("h4", { text: "Settings you might want to change:" });
    const settingsList = contentEl.createEl("ul");
    settingsList.createEl("li", { text: `Frontmatter property name: "${this.settings.frontmatterProperty}"` });
    settingsList.createEl("li", { text: `YouTube download folder: "${this.settings.thumbnailDownloadFolder}"` });
    settingsList.createEl("li", { text: "Require Youtube links to be prefixed with \"!\" to use them as featured image" });
    settingsList.createEl("li", { text: "List of excluded folders, such as templates folder" });

    contentEl.createEl("p", { text: "To get started, review the settings first and set excluded folders and the property name, then consider running \"Set featured images in all files\" command to update all your existing documents." });
    contentEl.createEl("p", { text: "Have fun and continue creating amazing notes!" });
    
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Close")
          .setCta()
          .onClick(() => this.close()));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}