/** Host-supplied constants only. This module has no framework or application dependencies. */
export interface FeedbackConfig {
  readonly app: string;
  readonly space: string;
  readonly origins: readonly string[];
  readonly screen?: string;
}
type WidgetApi = {
  open(): void;
  close(): void;
  readonly sourceScript?: HTMLScriptElement;
  readonly appID?: string;
  readonly spaceID?: string;
};
type WidgetWindow = Window & { ImproveIt?: WidgetApi };
type LoadState = 'idle' | 'loading' | 'ready' | 'failed' | 'unavailable';
interface Owner {
  enabled: boolean;
  epoch: number;
  eligible(): boolean;
  trigger?: HTMLElement;
  notify(
    ready: boolean,
    failed: boolean,
    available: boolean,
    loading: boolean,
  ): void;
}

// The deployed script has a permanent global guard and an anonymous window listener.
// Retain its runtime for the document lifetime rather than trying to unload/re-execute it.
const runtimes = new WeakMap<Document, DocumentWidget>();

/** Equivalent copied configurations share one runtime; changing product or origin policy needs a new document. */
export function feedbackConfigKey(config: FeedbackConfig): string {
  return JSON.stringify([
    config.app,
    config.space,
    config.screen ?? 'app',
    [...new Set(config.origins)].sort(),
  ]);
}

class DocumentWidget {
  readonly configKey: string;
  readonly owners = new Set<Owner>();
  private state: LoadState = 'idle';
  private host: HTMLElement | undefined;
  private api: WidgetApi | undefined;
  private pending: { owner: Owner; epoch: number } | undefined;

  constructor(
    private readonly doc: Document,
    private readonly win: WidgetWindow,
    private readonly config: FeedbackConfig,
  ) {
    this.configKey = feedbackConfigKey(config);
  }

  private allowed(owner: Owner): boolean {
    let eligible = false;
    try {
      eligible = owner.eligible();
    } catch {
      /* A host gate failure denies access. */
    }
    return (
      eligible &&
      this.owners.has(owner) &&
      owner.enabled &&
      this.config.origins.includes(this.win.location.origin)
    );
  }

  update(): void {
    if (
      this.pending &&
      (this.pending.epoch !== this.pending.owner.epoch ||
        !this.allowed(this.pending.owner))
    )
      this.pending = undefined;
    const active = [...this.owners].some((owner) => this.allowed(owner));
    if (this.state === 'ready' && this.win.ImproveIt !== this.api) {
      this.state = 'unavailable';
      this.pending = undefined;
    }
    if (active && this.state === 'ready' && this.host) {
      if (!this.host.isConnected) this.doc.body.append(this.host);
    } else {
      // Never operate on a replaced/foreign global, even during cleanup.
      if (this.win.ImproveIt === this.api) this.api?.close();
      this.host?.remove();
    }
    for (const owner of this.owners) {
      const available = this.allowed(owner) && this.state !== 'unavailable';
      owner.notify(
        available && this.state === 'ready',
        available && this.state === 'failed',
        available,
        available && this.state === 'loading',
      );
    }
    const pending = this.pending;
    if (pending && this.state === 'ready') {
      this.pending = undefined;
      if (
        pending.epoch === pending.owner.epoch &&
        this.allowed(pending.owner) &&
        this.host?.isConnected &&
        this.win.ImproveIt === this.api
      ) {
        // Touch activation in WebKit need not focus the local launcher. Give the
        // SDK an explicit, connected return target before it captures activeElement.
        const trigger = pending.owner.trigger;
        if (trigger?.isConnected && trigger.ownerDocument === this.doc)
          trigger.focus();
        // Focusing can synchronously enter authentication or change configuration.
        if (
          pending.epoch === pending.owner.epoch &&
          this.allowed(pending.owner) &&
          this.host?.isConnected &&
          this.win.ImproveIt === this.api
        )
          this.api?.open();
        else this.update();
      }
    }
  }

  activate(owner: Owner, retry = false): void {
    this.update();
    if (!this.allowed(owner) || this.state === 'unavailable') return;
    if (this.state === 'failed' && !retry) return;
    this.pending ??= { owner, epoch: owner.epoch };
    if (this.state === 'idle' || (retry && this.state === 'failed'))
      this.start();
    this.update();
  }

  private start(): void {
    // Existing globals/hosts have no ownership proof. Never replace or close them.
    if (
      this.win.ImproveIt !== undefined ||
      this.doc.querySelector('[data-improveit-host]')
    ) {
      this.state = 'unavailable';
      return;
    }
    this.state = 'loading';
    const script = this.doc.createElement('script');
    script.src = 'https://improveit.now/widget.js';
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.dataset['space'] = this.config.space;
    script.dataset['app'] = this.config.app;
    script.dataset['screen'] = this.config.screen ?? 'app';
    script.dataset['launcher'] = 'hidden';
    script.dataset['lang'] = [
      this.doc.documentElement.lang,
      this.win.navigator.language,
    ].some((language) => /^ru(?:-|$)/i.test(language))
      ? 'ru'
      : 'en';
    const loaded = () => {
      script.removeEventListener('error', failed);
      const candidate = this.win.ImproveIt;
      // The SDK captures these at startup. Its exact script reference proves this
      // completion created the runtime; DOM appearance alone cannot prove ownership.
      if (
        script.src !== 'https://improveit.now/widget.js' ||
        script.dataset['app'] !== this.config.app ||
        script.dataset['space'] !== this.config.space ||
        script.dataset['screen'] !== (this.config.screen ?? 'app') ||
        script.dataset['launcher'] !== 'hidden' ||
        script.referrerPolicy !== 'no-referrer' ||
        !candidate ||
        candidate.sourceScript !== script ||
        candidate.appID !== this.config.app ||
        candidate.spaceID !== this.config.space
      ) {
        this.state = 'unavailable';
        this.update();
        return;
      }
      const host = this.doc.querySelector<HTMLElement>('[data-improveit-host]');
      if (host) {
        this.host = host;
        this.api = candidate;
        this.state = 'ready';
      } else this.state = 'unavailable';
      this.update();
    };
    const failed = () => {
      script.removeEventListener('load', loaded);
      script.remove();
      this.pending = undefined;
      this.state = 'failed';
      this.update();
    };
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    this.doc.head.append(script);
  }
}

/** A view owns a subscription, while the guarded deployed runtime belongs to its document. */
export class ImproveItEmbed {
  private runtime: DocumentWidget | undefined;
  private destroyed = false;
  private readonly owner: Owner;
  private readonly config: FeedbackConfig;
  private readonly configKey: string;

  constructor(
    private readonly doc: Document,
    private readonly win: WidgetWindow,
    config: FeedbackConfig,
    ready: (ready: boolean) => void,
    failed: (failed: boolean) => void = () => undefined,
    status: (available: boolean, loading: boolean) => void = () => undefined,
    eligible: () => boolean = () => true,
  ) {
    this.config = Object.freeze({
      app: config.app,
      space: config.space,
      screen: config.screen ?? 'app',
      origins: Object.freeze([...config.origins]),
    });
    this.configKey = feedbackConfigKey(this.config);
    this.owner = {
      enabled: false,
      epoch: 0,
      eligible,
      notify: (isReady, isFailed, available, loading) => {
        ready(isReady);
        failed(isFailed);
        status(available, loading);
      },
    };
  }

  setEnabled(enabled: boolean): void {
    if (this.destroyed) return;
    if (!enabled) this.owner.epoch++;
    this.owner.enabled =
      enabled && this.config.origins.includes(this.win.location.origin);
    if (this.owner.enabled && !this.runtime) {
      let runtime = runtimes.get(this.doc);
      if (!runtime) {
        runtime = new DocumentWidget(this.doc, this.win, this.config);
        runtimes.set(this.doc, runtime);
      }
      // One product/origin policy per document. Unsupported structural changes fail closed.
      if (runtime.configKey === this.configKey) {
        this.runtime = runtime;
        runtime.owners.add(this.owner);
      }
    }
    if (this.runtime) this.runtime.update();
    else this.owner.notify(false, false, false, false);
  }

  /** Synchronous host interruption; restoration never revives a queued activation. */
  cancel(): void {
    this.setEnabled(false);
  }

  open(trigger?: HTMLElement): void {
    this.owner.trigger = trigger;
    if (this.owner.enabled && !this.destroyed)
      this.runtime?.activate(this.owner);
  }

  retry(trigger?: HTMLElement): void {
    this.owner.trigger = trigger;
    // One explicit attempt per click; route changes and failed downloads never loop.
    if (this.owner.enabled && !this.destroyed)
      this.runtime?.activate(this.owner, true);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.owner.enabled = false;
    this.owner.notify(false, false, false, false);
    this.runtime?.owners.delete(this.owner);
    this.runtime?.update();
  }
}
