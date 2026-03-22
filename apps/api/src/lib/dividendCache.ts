/**
 * dividend_data テーブルの内容をメモリキャッシュ（TTL: 24h）で保持するモジュール。
 *
 * - getDividendData(ticker)     : 銘柄1件を返す（キャッシュ経由）
 * - getAllDividendData()        : 全件 Map を返す（キャッシュ経由）
 * - invalidateDividendCache()  : キャッシュを手動で破棄する
 */
import { db } from "@assetbridge/db/client";
import { DividendDataRepo } from "@assetbridge/db/repos/dividend_data";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DividendCacheValue {
  months: string | null;
  annualJpy: number | null;
  perPaymentJpy: number | null;
  isUnknown: boolean;
}

interface CacheEntry {
  data: Map<string, DividendCacheValue>;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

/**
 * 指定 ticker の配当データを返す。DB に存在しない場合は null。
 */
export async function getDividendData(ticker: string): Promise<DividendCacheValue | null> {
  await ensureCacheLoaded();
  return cache!.data.get(ticker) ?? null;
}

/**
 * 全 ticker の配当データ Map を返す。
 */
export async function getAllDividendData(): Promise<Map<string, DividendCacheValue>> {
  await ensureCacheLoaded();
  return cache!.data;
}

/**
 * キャッシュを破棄する（スクレイプ後など更新時に呼ぶ）。
 */
export function invalidateDividendCache(): void {
  cache = null;
}

async function ensureCacheLoaded(): Promise<void> {
  if (cache && Date.now() < cache.expiresAt) return;

  const repo = new DividendDataRepo(db);
  const rows = repo.findAll();
  const map = new Map<string, DividendCacheValue>(
    rows.map((r) => [
      r.ticker,
      {
        months: r.months ?? null,
        annualJpy: r.annualJpy ?? null,
        perPaymentJpy: r.perPaymentJpy ?? null,
        isUnknown: !!r.isUnknown,
      },
    ])
  );
  cache = { data: map, expiresAt: Date.now() + CACHE_TTL_MS };
}
