// src/types/globals.d.ts
// The browser's Storage globals, as installed by src/lib/polyfills.ts.
interface KeyValueStorage {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
}
declare var localStorage: KeyValueStorage;
declare var sessionStorage: KeyValueStorage;
