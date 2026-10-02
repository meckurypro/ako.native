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
