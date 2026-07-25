CREATE TABLE `game_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`player_id` text NOT NULL,
	`round` integer NOT NULL,
	`action` text NOT NULL,
	`points` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_actions_player_round_unique` ON `game_actions` (`player_id`,`round`);--> statement-breakpoint
CREATE INDEX `game_actions_room_round_idx` ON `game_actions` (`room_id`,`round`);--> statement-breakpoint
CREATE TABLE `game_players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`player_token` text NOT NULL,
	`role` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`last_action` text,
	`last_action_at` integer,
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `game_players_room_score_idx` ON `game_players` (`room_id`,`score`);--> statement-breakpoint
CREATE UNIQUE INDEX `game_players_token_unique` ON `game_players` (`player_token`);--> statement-breakpoint
CREATE TABLE `game_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`host_token` text NOT NULL,
	`scenario_id` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`phase_started_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_rooms_code_unique` ON `game_rooms` (`code`);