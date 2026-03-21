import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

// 小額資産を確認（1-30円）
const small = db.query(`
  SELECT a.id, a.name, a.symbol, a.asset_type, ps.value_jpy, ps.quantity
  FROM assets a
  JOIN portfolio_snapshots ps ON a.id = ps.asset_id
  WHERE ps.date = (SELECT MAX(date) FROM portfolio_snapshots)
    AND ps.value_jpy < 50
  ORDER BY ps.value_jpy
`).all();
console.log("小額資産（50円未満）:");
console.log(JSON.stringify(small, null, 2));

// symbolにU+003C(<), U+003E(>), U+2039(‹), U+203A(›)を含むもの
const allAssets = db.query("SELECT id, name, symbol FROM assets").all();
const withSpecial = allAssets.filter(a => {
  const s = (a.symbol || "") + (a.name || "");
  return [...s].some(c => {
    const code = c.charCodeAt(0);
    return code === 0x003C || code === 0x003E || code === 0x2039 || code === 0x203A;
  });
});
console.log("\n特殊文字（<>‹›）含む資産:", withSpecial.length, "件");
if (withSpecial.length > 0) console.log(JSON.stringify(withSpecial, null, 2));

// symbolの文字コードを確認
allAssets.forEach(a => {
  const sym = a.symbol || "";
  if (sym.length > 0) {
    const firstChar = sym.charCodeAt(0);
    if (firstChar < 0x41 || (firstChar > 0x5A && firstChar < 0x61) || firstChar > 0x7A) {
      // 英字以外から始まるシンボル
      if (!/^[0-9]/.test(sym) && sym !== "314A") {
        console.log(`非英数シンボル: "${sym}" (0x${firstChar.toString(16)}) name="${a.name}"`);
      }
    }
  }
});

db.close();
