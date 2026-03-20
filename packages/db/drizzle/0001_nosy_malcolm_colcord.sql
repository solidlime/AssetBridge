CREATE TABLE `credit_card_withdrawals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_name` text NOT NULL,
	`withdrawal_date` text NOT NULL,
	`amount_jpy` real DEFAULT 0 NOT NULL,
	`bank_account` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`scraped_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_withdrawal_date` ON `credit_card_withdrawals` (`withdrawal_date`);--> statement-breakpoint
ALTER TABLE `assets` ADD `institution_name` text(200);--> statement-breakpoint
ALTER TABLE `portfolio_snapshots` ADD `dividend_frequency` text;--> statement-breakpoint
ALTER TABLE `portfolio_snapshots` ADD `dividend_amount` real;--> statement-breakpoint
ALTER TABLE `portfolio_snapshots` ADD `dividend_rate` real;--> statement-breakpoint
ALTER TABLE `portfolio_snapshots` ADD `ex_dividend_date` text;--> statement-breakpoint
ALTER TABLE `portfolio_snapshots` ADD `next_ex_dividend_date` text;--> statement-breakpoint
ALTER TABLE `portfolio_snapshots` ADD `distribution_type` text;--> statement-breakpoint
ALTER TABLE `portfolio_snapshots` ADD `last_dividend_update` integer;