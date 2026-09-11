CREATE TABLE `cluster_vote_totals` (
	`scale` integer NOT NULL,
	`community_id` text NOT NULL,
	`community_size` integer NOT NULL,
	`familiarity_unfamiliar` integer DEFAULT 0 NOT NULL,
	`familiarity_moderate` integer DEFAULT 0 NOT NULL,
	`familiarity_very` integer DEFAULT 0 NOT NULL,
	`boundary_no_match` integer DEFAULT 0 NOT NULL,
	`boundary_moderate_match` integer DEFAULT 0 NOT NULL,
	`boundary_strong_match` integer DEFAULT 0 NOT NULL,
	`total_votes` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`scale`, `community_id`)
);
