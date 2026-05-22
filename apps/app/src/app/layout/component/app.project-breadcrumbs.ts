import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UrlSchemeCoordinatesService } from '@/app/core/routing/url-scheme.guard';

/**
 * Renders a source-of-truth breadcrumb above the main content area when
 * the user is on a project (forge-canonical) URL:
 *
 *   [forge-icon] {git_host} / [{org}](forge org page) / [{repo}](forge repo page)
 *
 * Both org and repo are external links opening in a new tab — they
 * point at the underlying forge, not back into Studio. The component
 * renders nothing on non-project URLs (default app pages) or for handle
 * URLs (resolver out of scope per studio-url-scheme).
 */
@Component({
  selector: 'app-project-breadcrumbs',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (pathCoords(); as c) {
      <nav class="project-breadcrumbs" aria-label="Project source">
        <i [ngClass]="forgeIcon(c.git_host)" class="forge-icon" aria-hidden="true"></i>
        <span class="git-host">{{ c.git_host }}</span>
        <span class="separator" aria-hidden="true">/</span>
        <a
          [attr.href]="forgeUrl(c.git_host, c.org)"
          target="_blank"
          rel="noopener noreferrer"
          [attr.aria-label]="'Open organization ' + c.org + ' on ' + c.git_host"
        >{{ c.org }}</a>
        <span class="separator" aria-hidden="true">/</span>
        <a
          [attr.href]="forgeUrl(c.git_host, c.org, c.repo)"
          target="_blank"
          rel="noopener noreferrer"
          [attr.aria-label]="'Open repository ' + c.org + '/' + c.repo + ' on ' + c.git_host"
        >{{ c.repo }}</a>
      </nav>
    }
  `,
  styles: [`
    /* Fixed strip below the (also-fixed) topbar so the breadcrumb spans
       the full viewport width — across both the sidebar and the main
       content area. The topbar is height: 4rem at top: 0 with z-index
       997; the breadcrumb sits at top: 4rem with z-index 996 (just
       below the topbar but above the sidebar's 999... wait sidebar is
       higher z, so the breadcrumb visually sits behind the sidebar
       which renders on top — that's the desired layering for the
       sidebar to "tuck under" the breadcrumb visually on top of
       sidebar's left edge). */
    :host {
      display: block;
    }
    .project-breadcrumbs {
      position: fixed;
      top: 4rem;
      left: 0;
      right: 0;
      height: 2.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      /* Align horizontally with the top-level menu headers ("PROJECT",
         "SPECIFICATIONS"). Sidebar is at left: 2rem with internal padding
         0.5rem 1.5rem, so menu-item content starts at 3.5rem from the
         viewport edge — match that here. */
      padding: 0 3.5rem;
      font-size: 0.9rem;
      color: var(--text-color-secondary);
      /* Use the same background as the main content area (--surface-ground)
         so the breadcrumb visually belongs to "below the header" rather
         than reading as part of the white topbar. Bordered on top to
         separate from the topbar; no bottom border (the sidebar/content
         area's own spacing handles the lower edge). */
      background: var(--surface-ground);
      border-top: 1px solid var(--surface-border);
      z-index: 998;
    }
    .project-breadcrumbs .forge-icon {
      font-size: 1.15rem;
    }
    .project-breadcrumbs .git-host {
      color: var(--text-color);
      font-weight: 500;
    }
    .project-breadcrumbs a {
      color: var(--primary-color);
      text-decoration: none;
    }
    .project-breadcrumbs a:hover,
    .project-breadcrumbs a:focus-visible {
      text-decoration: underline;
    }
    .project-breadcrumbs .separator {
      color: var(--text-color-secondary);
      opacity: 0.6;
    }
  `]
})
export class AppProjectBreadcrumbs {
  private readonly urlScheme = inject(UrlSchemeCoordinatesService);

  /**
   * Narrows the coords signal to the path-shape only — the handle shape
   * has no resolved forge identity yet (REQ:handle-canonical-route is a
   * reserved-only contract), so there's nothing to link to.
   */
  readonly pathCoords = computed(() => {
    const c = this.urlScheme.coordinates();
    return c?.kind === 'path' ? c : null;
  });

  /**
   * Map an allow-listed forge host to a PrimeIcons class. Falls back to
   * a generic `pi-server` for forges PrimeIcons doesn't ship an icon
   * for (bitbucket, codeberg). Could be extended with inline SVGs if
   * brand parity matters more than icon-set discipline.
   */
  forgeIcon(host: string): string {
    switch (host) {
      case 'github.com': return 'pi pi-github';
      case 'gitlab.com': return 'pi pi-gitlab';
      case 'bitbucket.org':
      case 'codeberg.org':
      default:
        return 'pi pi-server';
    }
  }

  /**
   * Build the forge URL for an org or org/repo. All four allow-listed
   * forges follow the `https://{host}/{org}[/{repo}]` shape — when
   * registering a new forge in forge-host.allowlist.ts, verify this
   * URL grammar holds before relying on this helper.
   */
  forgeUrl(host: string, org: string, repo?: string): string {
    const base = `https://${host}/${encodeURIComponent(org)}`;
    return repo ? `${base}/${encodeURIComponent(repo)}` : base;
  }
}
