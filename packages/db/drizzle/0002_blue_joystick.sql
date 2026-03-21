CREATE TABLE `fixed_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`amount_jpy` real NOT NULL,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`withdrawal_day` integer,
	`withdrawal_month` integer,
	`category` text,
	`asset_id` integer,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `credit_card_details` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_name` text NOT NULL,
	`card_type` text,
	`card_number_last4` text,
	`total_debt_jpy` real,
	`scheduled_amount_jpy` real,
	`scraped_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_card_details_card_name_unique` ON `credit_card_details` (`card_name`);--> statement-breakpoint
CREATE TABLE `dividend_data` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`months` text,
	`annual_jpy` real,
	`is_unknown` integer DEFAULT false,
	`scraped_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dividend_data_ticker_unique` ON `dividend_data` (`ticker`);--> statement-breakpoint
ALTER TABLE `portfolio_snapshots` ADD `current_price_jpy` real;