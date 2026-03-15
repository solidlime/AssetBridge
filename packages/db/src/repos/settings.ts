import type { Database } from "bun:sqlite";

export class SettingsRepo {
  constructor(private sqlite: Database) {}

  get(key: string): string | null {
    const row = this.sqlite.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string | null } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.sqlite.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).run(key, value);
  }

  getScrapeSchedule(): { hour: number; minute: number } {
    const hour = parseInt(this.get("scrape_hour") ?? "6", 10);
    const minute = parseInt(this.get("scrape_minute") ?? "0", 10);
    return { hour, minute };
  }

  setScrapeSchedule(hour: number, minute: number): void {
    this.set("scrape_hour", String(hour));
    this.set("scrape_minute", String(minute));
  }
}
