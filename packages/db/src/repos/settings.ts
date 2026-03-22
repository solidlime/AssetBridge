/// <reference types="bun-types" />
import type { Database } from "bun:sqlite";

export const SECRET_SETTING_KEYS = [
  "mf_email",
  "mf_password",
  "discord_token",
  "web_api_key",
] as const satisfies readonly [string, ...string[]];

export type SecretSettingKey = typeof SECRET_SETTING_KEYS[number];

function maskSecret(value: string): string {
  if (value.length <= 12) return "***";
  return value.slice(0, 8) + "****..****" + value.slice(-4);
}

function maskEmail(value: string): string {
  const atIdx = value.indexOf("@");
  if (atIdx < 0) return maskSecret(value);
  const local = value.slice(0, atIdx);
  const domain = value.slice(atIdx + 1);
  const maskedLocal = local.length <= 2 ? "***" : local.slice(0, 2) + "****...****";
  const maskedDomain = domain.length === 0 ? "***" : domain.slice(0, 1) + "**";
  return `${maskedLocal}@${maskedDomain}`;
}

export class SettingsRepo {
  constructor(private sqlite: Database) {}

  get(key: string): string | null {
    const row = this.sqlite.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string | null } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string | null): void {
    if (!value) {
      this.sqlite.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
      return;
    }
    this.sqlite.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).run(key, value);
  }

  getScrapeSchedule(): { hour: number; minute: number } {
    const hourRaw = this.get("scrape_hour");
    const minuteRaw = this.get("scrape_minute");
    const hour = hourRaw ? parseInt(hourRaw, 10) : 6;
    const minute = minuteRaw ? parseInt(minuteRaw, 10) : 0;
    return {
      hour: isNaN(hour) ? 6 : hour,
      minute: isNaN(minute) ? 0 : minute,
    };
  }

  private getUpdatedAt(keys: string[]): number | null {
    if (keys.length === 0) return null;
    const rows = this.sqlite
      .prepare(`SELECT updated_at FROM app_settings WHERE key IN (${keys.map(() => "?").join(", ")})`)
      .all(...keys) as { updated_at: number | null }[];
    const values = rows.map(r => r.updated_at).filter((v): v is number => v !== null);
    return values.length > 0 ? Math.max(...values) : null;
  }

  setScrapeSchedule(hour: number, minute: number): void {
    this.set("scrape_hour", String(hour));
    this.set("scrape_minute", String(minute));
  }

  setSecret(key: SecretSettingKey, value: string): void {
    this.set(key, value);
  }

  getSecretStatus(key: SecretSettingKey): { isSet: boolean; masked: string | null } {
    const val = this.get(key);
    if (!val) return { isSet: false, masked: null };
    const masked = key === "mf_email" ? maskEmail(val) : maskSecret(val);
    return { isSet: true, masked };
  }

  getAllSettings(): {
    discordChannelId: string;
    scrapeSchedule: { hour: number; minute: number };
    secrets: Record<SecretSettingKey, { isSet: boolean; masked: string | null }>;
    updatedAt: {
      scrapeSchedule: number | null;
      secrets: number | null;
      discordChannelId: number | null;
    };
  } {
    const secrets = {} as Record<SecretSettingKey, { isSet: boolean; masked: string | null }>;
    for (const key of SECRET_SETTING_KEYS) {
      secrets[key] = this.getSecretStatus(key);
    }
    return {
      discordChannelId: this.get("discord_channel_id") ?? "",
      scrapeSchedule: this.getScrapeSchedule(),
      secrets,
      updatedAt: {
        scrapeSchedule: this.getUpdatedAt(["scrape_hour", "scrape_minute"]),
        secrets: this.getUpdatedAt([...SECRET_SETTING_KEYS]),
        discordChannelId: this.getUpdatedAt(["discord_channel_id"]),
      },
    };
  }
}
