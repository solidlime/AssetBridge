import Database from "bun:sqlite";

const db = new Database("data/assetbridge_v2.db");
const rows = db
  .query(
    "SELECT name, asset_type, institution_name FROM assets WHERE asset_type IN ('CASH','POINT','PENSION') ORDER BY asset_type, name"
  )
  .all();

const hasTotal = rows.filter((r: any) => r.name.includes("合計"));
console.log("合計行残存:", hasTotal.length, "件");
console.log(
  "CASH institution_name 空:",
  rows.filter((r: any) => r.asset_type === "CASH" && !r.institution_name)
    .length,
  "件"
);
rows.slice(0, 15).forEach((r: any) =>
  console.log(r.asset_type, "|", r.name, "|", r.institution_name || "(空)")
);
