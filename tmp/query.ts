import { db } from "@assetbridge/db/client";
import { assets } from "@assetbridge/db/schema";

const allAssets = db.select().from(assets).all();
console.log("=== All Assets ===");
allAssets.forEach(a => {
  console.log(`ID:${a.id}, Symbol:${a.symbol}, Name:${a.name}, Type:${a.assetType}, Institution:${a.institutionName ?? "NULL"}`);
});

console.log("\n=== Assets with institutionName ===");
const withInst = allAssets.filter(a => a.institutionName);
console.log(`Count: ${withInst.length}`);
withInst.slice(0, 10).forEach(a => {
  console.log(`${a.symbol}: ${a.institutionName}`);
});

console.log("\n=== Assets WITHOUT institutionName ===");
const withoutInst = allAssets.filter(a => !a.institutionName);
console.log(`Count: ${withoutInst.length}`);
withoutInst.slice(0, 10).forEach(a => {
  console.log(`${a.symbol}: ${a.name}`);
});
