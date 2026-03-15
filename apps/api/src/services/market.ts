import type { MarketContext, MarketIndex, NewsItem } from "@assetbridge/types";
import { getCached, setCached } from "../lib/cache";
import { sqlite } from "@assetbridge/db/client";
import { SettingsRepo } from "@assetbridge/db/repos/settings";

const settingsRepo = new SettingsRepo(sqlite);

async function fetchMarketIndices(): Promise<MarketIndex[]> {
  try {
    // yahoo-finance2 は ESM モジュールのため dynamic import で読み込む
    const yf = await import("yahoo-finance2");
    const symbols = ["^N225", "^GSPC", "^TPX", "USDJPY=X"];
    const names: Record<string, string> = {
      "^N225": "日経225",
      "^GSPC": "S&P500",
      "^TPX": "TOPIX",
      "USDJPY=X": "USD/JPY",
    };

    const results = await Promise.allSettled(
      symbols.map((s) => (yf.default as unknown as { quote: (s: string) => Promise<unknown> }).quote(s))
    );

    return results
      .map((r, i) => {
        if (r.status === "rejected") return null;
        const q = r.value as Record<string, number>;
        return {
          symbol: symbols[i],
          name: names[symbols[i]],
          price: q.regularMarketPrice ?? 0,
          change: q.regularMarketChange ?? 0,
          changePct: q.regularMarketChangePercent ?? 0,
        };
      })
      .filter((item): item is MarketIndex => item !== null);
  } catch {
    return [];
  }
}

export async function getMarketContext(): Promise<MarketContext> {
  const cacheKey = "market_context";
  const cached = getCached<MarketContext>(cacheKey);
  if (cached) return cached;

  const indices = await fetchMarketIndices();
  const result: MarketContext = { indices, cacheAgeMinutes: 0 };
  // 1時間キャッシュ
  setCached(cacheKey, result, 3600);
  return result;
}

export async function searchNews(params: {
  query?: string;
  symbols?: string[];
  days?: number;
}): Promise<NewsItem[]> {
  const searxngUrl =
    settingsRepo.get("searxng_url") ?? process.env.SEARXNG_URL ?? "http://localhost:8080";

  let query = params.query ?? "";
  if (params.symbols?.length) {
    query = params.symbols.join(" OR ") + (query ? ` ${query}` : "");
  }
  if (!query) query = "日本株 市場";

  try {
    const url = new URL(`${searxngUrl}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("categories", "news");
    url.searchParams.set("time_range", "day");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];

    const data = (await res.json()) as { results?: Record<string, string>[] };
    return (data.results ?? []).slice(0, 10).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      publishedAt: r.publishedDate ?? new Date().toISOString(),
      snippet: (r.content ?? "").slice(0, 200),
    }));
  } catch {
    return [];
  }
}
