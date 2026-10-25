CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_token` text NOT NULL,
	`include_rumors` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_feed_token_unique` ON `accounts` (`feed_token`);--> statement-breakpoint
CREATE TABLE `library` (
	`user_id` text NOT NULL,
	`movie_id` text NOT NULL,
	`movie` text NOT NULL,
	`tracked` integer DEFAULT 0 NOT NULL,
	`added_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `movie_id`)
);
--> statement-breakpoint
CREATE TABLE `source_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
