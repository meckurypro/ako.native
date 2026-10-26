// src/lib/polyfills.ts
// Import FIRST (see src/app/_layout.tsx). The web code reads/writes
// localStorage and sessionStorage synchronously in a lot of places (sound
// settings, account switcher, search history, affiliate click tokens…).
// Rather than rewrite every call site to AsyncStorage's async API, install
// the same synchronous globals:
//   • localStorage   → expo-sqlite's kv-store (persistent, synchronous)
//   • sessionStorage → in-memory map, cleared on every cold start — the
//                      native equivalent of "lasts until the tab closes"
import "expo-sqlite/localStorage/install";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
}

const g = globalThis as unknown as { sessionStorage?: MemoryStorage };
if (!g.sessionStorage) g.sessionStorage = new MemoryStorage();

// ── TextDecoder("latin1") ────────────────────────────────────────────────────────────────────────────────
// Hermes ships a TextDecoder that only understands UTF-8 (and a few UTF-16 forms): `new TextDecoder("latin1")`
// throws "RangeError: Unknown encoding: latin1". fast-png builds exactly that decoder at module level, so merely
// *loading* it threw — and because Metro reports an error thrown while a module loads as fatal (before any
// try/catch around the require can see it), every screen whose import graph reached fast-png (the custom-page
// editor, via the image-palette picker) closed the app on open. This wrapper adds the Latin-1 family and leaves
// every other encoding to the native decoder. Installed from this file, which _layout.tsx imports first.
interface DecoderLike {
  readonly encoding: string;
  decode(input?: ArrayBuffer | ArrayBufferView, options?: { stream?: boolean }): string;
}
type DecoderCtor = new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }) => DecoderLike;
const NativeTextDecoder = (globalThis as { TextDecoder?: DecoderCtor }).TextDecoder;

const LATIN1_LABELS = new Set(["latin1", "iso-8859-1", "iso8859-1", "iso_8859-1", "l1", "ascii", "us-ascii"]);

function nativeSupportsLatin1(): boolean {
  try {
    new NativeTextDecoder!("latin1");
    return true;
  } catch {
    return false;
  }
}

if (typeof NativeTextDecoder === "function" && !nativeSupportsLatin1()) {
  class LatinAwareTextDecoder {
    readonly encoding: string;
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
    private readonly native: DecoderLike | null;

    constructor(label: string = "utf-8", options?: { fatal?: boolean; ignoreBOM?: boolean }) {
      const normalized = String(label).trim().toLowerCase();
      this.fatal = !!options?.fatal;
      this.ignoreBOM = !!options?.ignoreBOM;
      if (LATIN1_LABELS.has(normalized)) {
        this.encoding = "windows-1252";
        this.native = null;
      } else {
        this.native = new NativeTextDecoder!(label, options);
        this.encoding = this.native.encoding;
      }
    }

    decode(input?: ArrayBuffer | ArrayBufferView, options?: { stream?: boolean }): string {
      if (this.native) return this.native.decode(input, options);
      if (input == null) return "";
      const bytes =
        input instanceof Uint8Array
          ? input
          : ArrayBuffer.isView(input)
            ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
            : new Uint8Array(input);
      // Latin-1 maps each byte to the code point of the same number. Chunked so a big buffer can't overflow
      // the argument limit of String.fromCharCode.apply.
      let out = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
      }
      return out;
    }
  }
  (globalThis as { TextDecoder?: unknown }).TextDecoder = LatinAwareTextDecoder;
}
