CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text(50) NOT NULL,
	`name` text(200) NOT NULL,
	`asset_type` text NOT NULL,
	`exchange` text(50),
	`currency` text(10) DEFAULT 'JPY' NOT NULL,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_symbol_type` ON `assets` (`symbol`,`asset_type`);--> statement-breakpoint
CREATE TABLE `scrape_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scraped_at` integer NOT NULL,
	`raw_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text,
	`result` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`started_at` integer,
	`done_at` integer,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `crawler_sessions` (
	`name` text PRIMARY KEY NOT NULL,
	`cookies_json` text NOT NULL,
	`saved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `daily_totals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`total_jpy` real DEFAULT 0 NOT NULL,
	`stock_jp_jpy` real DEFAULT 0 NOT NULL,
	`stock_us_jpy` real DEFAULT 0 NOT NULL,
	`fund_jpy` real DEFAULT 0 NOT NULL,
	`cash_jpy` real DEFAULT 0 NOT NULL,
	`pension_jpy` real DEFAULT 0 NOT NULL,
	`point_jpy` real DEFAULT 0 NOT NULL,
	`prev_diff_jpy` real DEFAULT 0 NOT NULL,
	`prev_diff_pct` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_totals_date_unique` ON `daily_totals` (`date`);--> statement-breakpoint
CREATE INDEX `ix_daily_date` ON `daily_totals` (`date`);--> statement-breakpoint
CREATE TABLE `portfolio_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`date` text NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	`price_jpy` real DEFAULT 0 NOT NULL,
	`value_jpy` real DEFAULT 0 NOT NULL,
	`cost_basis_jpy` real DEFAULT 0 NOT NULL,
	`cost_per_unit_jpy` real DEFAULT 0 NOT NULL,
	`unrealized_pnl_jpy` real DEFAULT 0 NOT NULL,
	`unrealized_pnl_pct` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_snapshot` ON `portfolio_snapshots` (`asset_id`,`date`);--> statement-breakpoint
CREATE INDEX `ix_snapshot_date` ON `portfolio_snapshots` (`date`);