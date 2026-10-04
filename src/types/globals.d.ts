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

// qrcode's pure-JS core (the package root pulls in Node-only modules that Metro can't bundle).
declare module "qrcode/lib/core/qrcode" {
  interface QrModules {
    size: number;
    get(row: number, col: number): number | boolean;
  }
  const QRCode: {
    create(text: string, options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" }): { modules: QrModules };
  };
  export default QRCode;
}
