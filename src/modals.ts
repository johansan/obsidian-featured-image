import { App, Modal, Setting } from 'obsidian';
import { strings } from './i18n';

export class ConfirmationModal extends Modal {
    onSubmit: (result: boolean) => void;
    title: string;
    message: string;
    showPreservationNote: boolean;
    private submitted = false;

    constructor(app: App, title: string, message: string, onSubmit: (result: boolean) => void, showPreservationNote: boolean = true) {
        super(app);
        this.title = title;
        this.message = message;
        this.onSubmit = onSubmit;
        this.showPreservationNote = showPreservationNote;
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText(this.title);

        contentEl.empty();
        contentEl.createEl('p', { text: this.message });

        if (this.showPreservationNote) {
            const infoEl = contentEl.createDiv({
                cls: 'featured-image-info'
            });
            infoEl.createEl('p', {
                text: strings.modals.mtimeOffsetNote,
                cls: 'featured-image-info-text'
            });
        }

        new Setting(contentEl)
            .addButton(btn =>
                btn.setButtonText('Cancel').onClick(() => {
                    this.submitted = true;
                    this.onSubmit(false);
                    this.close();
                })
            )
            .addButton(btn =>
                btn
                    .setButtonText('Proceed')
                    .setCta()
                    .onClick(() => {
                        this.submitted = true;
                        this.onSubmit(true);
                        this.close();
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();

        if (!this.submitted) {
            this.submitted = true;
            this.onSubmit(false);
        }
    }
}
