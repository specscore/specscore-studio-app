import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Converts plain-text URLs in a string into clickable anchor tags.
 * Non-URL segments are HTML-escaped to prevent XSS.
 */
@Pipe({ name: 'linkify', standalone: true })
export class LinkifyPipe implements PipeTransform {
    private readonly sanitizer = inject(DomSanitizer);

    transform(value: string): SafeHtml {
        if (!value) return value;

        const urlPattern = /(https?:\/\/[^\s<]+)/g;
        const parts: string[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = urlPattern.exec(value)) !== null) {
            // Escape the text before this URL.
            if (match.index > lastIndex) {
                parts.push(this.escapeHtml(value.slice(lastIndex, match.index)));
            }
            // Render the URL as a link (href is escaped, display text is escaped).
            const url = match[1];
            const escapedUrl = this.escapeHtml(url);
            parts.push(
                `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="underline break-all">${escapedUrl}</a>`,
            );
            lastIndex = urlPattern.lastIndex;
        }

        // Escape any remaining text after the last URL.
        if (lastIndex < value.length) {
            parts.push(this.escapeHtml(value.slice(lastIndex)));
        }

        return this.sanitizer.bypassSecurityTrustHtml(parts.join(''));
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
