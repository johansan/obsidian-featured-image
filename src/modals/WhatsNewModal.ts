import { App, Modal } from 'obsidian';
import { strings } from '../i18n';
import { ReleaseNote } from '../releaseNotes';

export class WhatsNewModal extends Modal {
    private releaseNotes: ReleaseNote[];
    private fundingUrl?: string;
    private thanksButton: HTMLButtonElement | null = null;
    private onCloseCallback?: () => void;
    private domDisposers: (() => void)[] = [];

    private formatReleaseDate(date: string): string {
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) {
            return date;
        }
        return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Renders limited formatting into a container element.
    // Supports:
    // - **bold**
    // - ==text== (highlight)
    // - [label](https://link)
    // - Auto-link bare http(s) URLs
    // - Line breaks: single \n becomes <br>
    private renderFormattedText(container: HTMLElement, text: string): void {
        const renderInline = (segment: string, dest: HTMLElement) => {
            const pattern = /==([\s\S]*?)==|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s]+)/g;
            let lastIndex = 0;
            let match: RegExpExecArray | null;

            const appendText = (t: string) => {
                if (t.length > 0) dest.appendText(t);
            };

            while ((match = pattern.exec(segment)) !== null) {
                appendText(segment.slice(lastIndex, match.index));

                if (match[1]) {
                    const highlight = dest.createSpan({ cls: 'fi-highlight' });
                    renderInline(match[1], highlight);
                } else if (match[2] && match[3]) {
                    const a = dest.createEl('a', { text: match[2] });
                    a.setAttr('href', match[3]);
                    a.setAttr('rel', 'noopener noreferrer');
                    a.setAttr('target', '_blank');
                } else if (match[4]) {
                    dest.createEl('strong', { text: match[4] });
                } else if (match[5]) {
                    let url = match[5];
                    let trailing = '';
                    const trailingMatch = url.match(/[.,;:!?)]+$/);
                    if (trailingMatch) {
                        trailing = trailingMatch[0];
                        url = url.slice(0, -trailing.length);
                    }
                    const a = dest.createEl('a', { text: url });
                    a.setAttr('href', url);
                    a.setAttr('rel', 'noopener noreferrer');
                    a.setAttr('target', '_blank');
                    if (trailing) {
                        appendText(trailing);
                    }
                }

                lastIndex = pattern.lastIndex;
            }

            appendText(segment.slice(lastIndex));
        };

        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            renderInline(lines[i], container);
            if (i < lines.length - 1) {
                container.createEl('br');
            }
        }
    }

    constructor(app: App, releaseNotes: ReleaseNote[], fundingUrl?: string, onCloseCallback?: () => void) {
        super(app);
        this.releaseNotes = releaseNotes;
        this.fundingUrl = fundingUrl;
        this.onCloseCallback = onCloseCallback;
    }

    onOpen(): void {
        const { contentEl } = this;

        contentEl.empty();
        this.modalEl.addClass('fi-whats-new-modal');

        contentEl.createEl('h2', {
            text: strings.whatsNew.title,
            cls: 'fi-whats-new-header'
        });

        this.attachCloseButtonHandler();

        const scrollContainer = contentEl.createDiv('fi-whats-new-scroll');

        this.releaseNotes.forEach(note => {
            const versionContainer = scrollContainer.createDiv('fi-whats-new-version');

            versionContainer.createEl('h3', {
                text: `Version ${note.version}`
            });

            versionContainer.createEl('small', {
                text: this.formatReleaseDate(note.date),
                cls: 'fi-whats-new-date'
            });

            if (note.info) {
                const paragraphs = note.info.split(/\n\s*\n/);
                paragraphs.forEach(para => {
                    const p = versionContainer.createEl('p', { cls: 'fi-whats-new-info' });
                    this.renderFormattedText(p, para);
                });
            }

            type CategoryKey = 'new' | 'improved' | 'changed' | 'fixed';

            const categories = [
                { key: 'new', label: strings.whatsNew.categories.new },
                { key: 'improved', label: strings.whatsNew.categories.improved },
                { key: 'changed', label: strings.whatsNew.categories.changed },
                { key: 'fixed', label: strings.whatsNew.categories.fixed }
            ] satisfies { key: CategoryKey; label: string }[];

            categories.forEach(category => {
                const items = note[category.key];
                if (!items?.length) {
                    return;
                }

                versionContainer.createEl('h4', {
                    text: category.label,
                    cls: 'fi-whats-new-category'
                });

                const categoryList = versionContainer.createEl('ul', {
                    cls: 'fi-whats-new-features'
                });

                items.forEach(item => {
                    const li = categoryList.createEl('li');
                    this.renderFormattedText(li, item);
                });
            });
        });

        contentEl.createDiv('fi-whats-new-divider');

        const supportContainer = contentEl.createDiv('fi-whats-new-support');

        supportContainer.createEl('p', {
            text: strings.whatsNew.supportMessage,
            cls: 'fi-whats-new-support-text'
        });

        const buttonContainer = contentEl.createDiv('fi-whats-new-buttons');

        const supportButton = buttonContainer.createEl('button', {
            cls: 'fi-support-button-small'
        });
        supportButton.setAttr('type', 'button');

        const supportIcon = supportButton.createSpan({ cls: 'fi-support-button-icon' });
        supportIcon.setAttr('aria-hidden', 'true');
        supportIcon.setText('☕');

        supportButton.createSpan({
            cls: 'fi-support-button-label',
            text: strings.whatsNew.supportButton
        });

        this.domDisposers.push(
            this.addDisposableEventListener(supportButton, 'click', () => {
                if (this.fundingUrl) {
                    window.open(this.fundingUrl);
                }
            })
        );

        const thanksButton = buttonContainer.createEl('button', {
            text: strings.whatsNew.thanksButton,
            cls: 'mod-cta'
        });
        this.domDisposers.push(
            this.addDisposableEventListener(thanksButton, 'click', () => {
                this.close();
            })
        );

        this.thanksButton = thanksButton;
    }

    open(): void {
        super.open();
        if (this.thanksButton) {
            requestAnimationFrame(() => {
                this.thanksButton?.focus();
            });
        }
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.removeClass('fi-whats-new-modal');
        if (this.domDisposers.length) {
            this.domDisposers.forEach(dispose => {
                try {
                    dispose();
                } catch {
                    // Ignore disposer errors
                }
            });
            this.domDisposers = [];
        }

        if (this.onCloseCallback) {
            this.onCloseCallback();
        }
    }

    private attachCloseButtonHandler(): void {
        const closeButton = this.modalEl.querySelector<HTMLElement>('.modal-close-button');
        if (!closeButton) {
            return;
        }

        const handleClose = (event: Event) => {
            event.preventDefault();
            this.close();
        };

        this.domDisposers.push(this.addDisposableEventListener(closeButton, 'click', handleClose));
        this.domDisposers.push(this.addDisposableEventListener(closeButton, 'pointerdown', handleClose));
    }

    private addDisposableEventListener<K extends keyof HTMLElementEventMap>(
        el: HTMLElement,
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void
    ): () => void {
        el.addEventListener(type, listener);
        return () => el.removeEventListener(type, listener);
    }
}
