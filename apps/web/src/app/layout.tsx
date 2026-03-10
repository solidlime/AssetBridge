import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AssetBridge",
  description: "ポートフォリオ管理ダッシュボード",
};

const navItems = [
  { href: "/", label: "ダッシュボード", icon: "📊" },
  { href: "/assets", label: "資産", icon: "💼" },
  { href: "/income-expense", label: "収支", icon: "💰" },
  { href: "/insights", label: "インサイト", icon: "🔍" },
  { href: "/linked-services", label: "連携サービス", icon: "🔗" },
  { href: "/simulator", label: "シミュレーター", icon: "🎯" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0f172a", color: "#e2e8f0", display: "flex", minHeight: "100vh" }}>
        {/* サイドバー */}
        <nav style={{ width: 220, background: "#1e293b", padding: "24px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 700, padding: "8px 12px", marginBottom: 16, color: "#60a5fa" }}>
            AssetBridge
          </div>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 8,
                color: "#94a3b8", textDecoration: "none",
                fontSize: 14,
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        {/* メインコンテンツ */}
        <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
