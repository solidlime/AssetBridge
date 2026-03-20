import { Database } from "bun:sqlite";
const db = new Database("data/assetbridge_v2.db");

const types = db.query(`
  SELECT a.asset_type, COUNT(*) cnt 
  FROM portfolio_snapshots ps 
  JOIN assets a ON ps.asset_id=a.id 
  WHERE ps.date=(SELECT MAX(date) FROM portfolio_snapshots) 
  GROUP BY a.asset_type
`).all() as any[];
console.log("Snapshot distribution:", JSON.stringify(types));

const totalAssets = db.query("SELECT COUNT(*) cnt FROM assets").get() as any;
console.log("Total assets:", totalAssets.cnt); // 47以下であるべき
