import { Component } from '@angular/core';

/**
 * Rendered by `urlSchemeGuard` when an incoming URL fails the canonical
 * URL-scheme contract — e.g. the host is not on the forge allow-list
 * (REQ:host-allowlist, REQ:unknown-host-rejection) or, in later tasks,
 * the path fails validation (REQ:path-traversal-rejection) or a handle
 * segment contains a dot (REQ:handle-no-dots).
 *
 * Per REQ:unknown-host-rejection, Studio MUST NOT render the normal
 * project chrome (sidebar, breadcrumbs, README) for an unknown host —
 * doing so would create a phishing surface on the specscore.studio
 * domain. This component is intentionally minimal: a card, an icon, a
 * heading, and a generic explanation.
 *
 * Copy is intentionally generic; final wording is an Outstanding Question
 * on the feature (spec/features/studio-url-scheme/README.md) and will be
 * tightened before the v1 launch.
 */
@Component({
  selector: 'app-unsupported-source',
  standalone: true,
  template: `
    <div class="card" data-testid="unsupported-source">
      <div class="flex flex-col items-center gap-4 p-8 text-center">
        <i class="pi pi-ban text-4xl text-orange-500"></i>
        <p class="text-xl font-semibold m-0">Unsupported source</p>
        <p class="text-muted-color m-0">
          This URL points to a location SpecScore Studio cannot resolve.
          Studio only renders content from a maintained list of supported
          source-code hosts.
        </p>
      </div>
    </div>
  `,
})
export class UnsupportedSourceComponent {}
