"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,       // 5分間データをフレッシュとみなす
            gcTime: 10 * 60 * 1000,          // 10分間キャッシュを保持
            retry: 1,                         // 失敗時1回のみリトライ
            refetchOnWindowFocus: false,       // ウィンドウフォーカス時の自動再取得を無効化
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
