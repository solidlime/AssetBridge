import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分間データをフレッシュとみなす
      gcTime: 10 * 60 * 1000,   // 10分間キャッシュを保持
      retry: 1,                  // 失敗時1回のみリトライ
      refetchOnWindowFocus: false, // ウィンドウフォーカス時の自動再取得を無効化
    },
  },
});
