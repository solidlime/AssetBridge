const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

const headers = {
  "X-API-Key": API_KEY,
  "Content-Type": "application/json",
};

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${API_URL}/api${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString(), { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  portfolio: {
    summary: (date?: string) => get<any>("/portfolio/summary", date ? { date_str: date } : undefined),
    history: (days = 30) => get<any>("/portfolio/history", { days }),
  },
  assets: {
    list: (type?: string) => get<any[]>("/assets", type && type !== "all" ? { asset_type: type } : undefined),
    history: (id: number, days = 30) => get<any>(`/assets/${id}/history`, { days }),
  },
  incomeExpense: {
    get: (months = 12) => get<any>("/income-expense", { months }),
  },
  insights: {
    allocation: () => get<any>("/insights/allocation"),
    pnlRanking: (top = 10) => get<any>("/insights/pnl-ranking", { top }),
  },
  simulator: {
    run: (params: any) => post<any>("/simulator/run", params),
  },
  scrape: {
    trigger: () => post<any>("/scrape/trigger"),
    status: () => get<any>("/scrape/status"),
  },
  settings: {
    getSystemPrompt: () => get<{ prompt: string }>("/settings/system-prompt"),
    updateSystemPrompt: (prompt: string) =>
      fetch(`${API_URL}/api/settings/system-prompt`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ prompt }),
      }).then((r) => r.json()),
    getScrapeSchedule: () => get<{ hour: number; minute: number }>("/settings/scrape-schedule"),
    updateScrapeSchedule: (hour: number, minute: number) =>
      fetch(`${API_URL}/api/settings/scrape-schedule`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ hour, minute }),
      }).then((r) => r.json()),
    getAiCommentTtl: () => get<{ hours: number }>("/settings/ai-comment-ttl"),
    updateAiCommentTtl: (hours: number) =>
      fetch(`${API_URL}/api/settings/ai-comment-ttl`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ hours }),
      }).then((r) => r.json()),
  },
  aiComments: {
    portfolio: () => get<{ comment: string }>("/ai/comments/portfolio"),
    pnl: () => get<{ comment: string }>("/ai/comments/pnl"),
    refresh: () => post<{ portfolio: string; pnl: string }>("/ai/comments/refresh"),
    asset: (data: {
      symbol: string;
      name: string;
      value_jpy: number;
      unrealized_pnl_jpy: number;
      unrealized_pnl_pct: number;
    }) => post<{ comment: string }>("/ai/comments/asset", data),
  },
  dividends: {
    summary: () => get<any>("/dividends/summary"),
  },
};
