/**
 * Yahoo Finance 価格キャッシュ
 * 
 * 24時間のメモリキャッシュで Yahoo Finance 呼び出しを削減。
 * 同じティッカーへの再取得時にキャッシュから値を返す。
 */

interface CacheEntry {
  value: number;
  expiry: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * キャッシュされた価格変動率を取得。
 * キャッシュが有効期限内なら値を返す、無ければ undefined を返す。
 */
export function getCachedPrice(symbol: string): number | undefined {
  const entry = cache.get(symbol);
  if (!entry || Date.now() > entry.expiry) {
    cache.delete(symbol);
    return undefined;
  }
  return entry.value;
}

/**
 * 価格変動率をキャッシュに保存。
 * TTL は 24 時間。
 */
export function setCachedPrice(symbol: string, value: number): void {
  cache.set(symbol, { value, expiry: Date.now() + TTL_MS });
}

/**
 * ティッカーがキャッシュに存在して有効期限内か確認。
 */
export function hasCachedPrice(symbol: string): boolean {
  const entry = cache.get(symbol);
  if (!entry || Date.now() > entry.expiry) {
    cache.delete(symbol);
    return false;
  }
  return true;
}

/**
 * キャッシュの統計情報を取得（デバッグ用）。
 */
export function getCacheStats(): { size: number; entries: string[] } {
  const now = Date.now();
  const validEntries = Array.from(cache.entries())
    .filter(([, entry]) => now <= entry.expiry)
    .map(([symbol]) => symbol);

  return {
    size: validEntries.length,
    entries: validEntries,
  };
}
