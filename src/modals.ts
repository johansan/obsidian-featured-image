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
