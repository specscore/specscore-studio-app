// Mock window.matchMedia for PrimeNG components (not available in jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => {
    const noop = (): void => undefined;
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    };
  },
});

// Polyfill localStorage as a global. The @angular/build:unit-test executor's
// jsdom integration provides window.localStorage but doesn't expose it as a
// top-level global, and Node 22+'s experimental localStorage requires a
// --localstorage-file flag that isn't set. Tests in this repo reference
// `localStorage` as a global (browser convention), so we shim it here.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        store.set(key, String(value));
      },
      removeItem: (key: string): void => {
        store.delete(key);
      },
      clear: (): void => store.clear(),
      key: (i: number): string | null => Array.from(store.keys())[i] ?? null,
      get length(): number {
        return store.size;
      },
    } satisfies Storage,
  });
}
