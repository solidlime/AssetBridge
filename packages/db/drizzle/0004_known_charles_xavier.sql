CREATE TABLE `app_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`detail` text,
	`created_at` text DEFAULT (datetime('now', 'localtime'))
);
