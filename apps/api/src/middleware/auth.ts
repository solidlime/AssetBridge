import { sqlite } from "@assetbridge/db/client";
import { SettingsRepo } from "@assetbridge/db/repos/settings";

const settingsRepo = new SettingsRepo(sqlite);

export function isValidApiKey(key: string | undefined): boolean {
  // DBから動的取得（即時反映、キャッシュなし）
  const dbKey = settingsRepo.get("web_api_key") ?? "";
  const envKey = process.env.API_KEY ?? "";
  const effectiveKey = dbKey || envKey;

  if (!effectiveKey) {
    // 未設定 → 全アクセス許可（初回セットアップ用。この時点では秘密情報も未登録）
    return true;
  }
  return key === effectiveKey;
}
