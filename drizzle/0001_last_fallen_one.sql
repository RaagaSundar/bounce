CREATE TABLE `game_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`game_id` text NOT NULL,
	`scope` text NOT NULL,
	`player_count` integer NOT NULL,
	`group_count` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`results` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `game_sessions_room_idx` ON `game_sessions` (`room_code`,`ended_at`);--> statement-breakpoint
CREATE INDEX `game_sessions_game_idx` ON `game_sessions` (`game_id`,`ended_at`);