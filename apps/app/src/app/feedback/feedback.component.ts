import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';
import { ImproveItEmbed } from './improveit-embed';

/** Fixed product feedback; never reads the router, editor, account or document. */
@Component({
    selector: 'app-product-feedback',
    template: `
        @if (available()) {
            <button type="button" class="product-feedback" aria-haspopup="dialog"
                [attr.aria-disabled]="loading()" [attr.aria-busy]="loading()" (click)="open($event)">
                {{ loading() ? 'Loading feedback…' : failed() ? 'Feedback unavailable · Retry' : 'Suggest an improvement' }}
            </button>
        }
    `,
    styleUrl: './feedback.component.scss'
})
export class ProductFeedback {
    readonly available = signal(false);
    readonly loading = signal(false);
    readonly failed = signal(false);
    private readonly document = inject(DOCUMENT);
    private readonly destroyRef = inject(DestroyRef);
    private embed?: ImproveItEmbed;

    constructor() {
        afterNextRender(() => {
            const win = this.document.defaultView;
            if (!win) return;
            this.embed = new ImproveItEmbed(this.document, win, {
                space: 'ao58m', app: '75251aa279608b533e93a785f5ae3aee',
                origins: ['https://specscore.studio'], screen: 'specscore-studio'
            }, () => undefined, failed => this.failed.set(failed), (available, loading) => {
                this.available.set(available);
                this.loading.set(loading);
            });
            this.embed.setEnabled(true);
        });
        this.destroyRef.onDestroy(() => this.embed?.destroy());
    }

    open(event: Event): void {
        if (this.loading()) return;
        if (this.failed()) this.embed?.retry(event.currentTarget as HTMLElement);
        else this.embed?.open(event.currentTarget as HTMLElement);
    }
}
