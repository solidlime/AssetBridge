export default function LinkedServicesPage() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>連携サービス</h1>
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24 }}>
        <p style={{ color: "#94a3b8" }}>スクレイパーを実行すると連携サービスの情報が表示されます。</p>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #334155" }}>
            <span>マネーフォワード for 住信SBI銀行</span>
            <span style={{ color: "#94a3b8", fontSize: 14 }}>未接続</span>
          </div>
        </div>
      </div>
    </div>
  );
}
