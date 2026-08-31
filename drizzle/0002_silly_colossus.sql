CREATE TABLE `ai_memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`insight` text NOT NULL,
	`context` text,
	`importance` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_memory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`section` enum('Sabbath','Daily','Prayer','Feast','Memory','History') NOT NULL,
	`title` varchar(255) NOT NULL,
	`scripture` varchar(255),
	`notes` text,
	`prayer` text,
	`tags` varchar(512),
	`handwritingData` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `journal_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `live_transcripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`studyId` int,
	`transcript` text NOT NULL,
	`duration` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `live_transcripts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `streaming_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`studyId` int,
	`messages` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `streaming_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cornell_notes` ADD `attachments` text;--> statement-breakpoint
ALTER TABLE `ai_memory` ADD CONSTRAINT `ai_memory_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `live_transcripts` ADD CONSTRAINT `live_transcripts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `live_transcripts` ADD CONSTRAINT `live_transcripts_studyId_studies_id_fk` FOREIGN KEY (`studyId`) REFERENCES `studies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `streaming_conversations` ADD CONSTRAINT `streaming_conversations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `streaming_conversations` ADD CONSTRAINT `streaming_conversations_studyId_studies_id_fk` FOREIGN KEY (`studyId`) REFERENCES `studies`(`id`) ON DELETE no action ON UPDATE no action;