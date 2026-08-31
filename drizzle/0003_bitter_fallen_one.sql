CREATE TABLE `pdf_sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`syncSource` varchar(256),
	`filesProcessed` int,
	`filesAdded` int,
	`filesFailed` int,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`status` enum('running','success','partial-error','failed') NOT NULL DEFAULT 'running',
	`errorLog` text,
	CONSTRAINT `pdf_sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `pdfs` ADD `extractedTitle` varchar(255);--> statement-breakpoint
ALTER TABLE `pdfs` ADD `category` varchar(128) DEFAULT 'Unclassified';--> statement-breakpoint
ALTER TABLE `pdfs` ADD `thumbnailUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `pdfs` ADD `metadata` json;--> statement-breakpoint
ALTER TABLE `pdfs` ADD `syncSource` varchar(256);--> statement-breakpoint
ALTER TABLE `pdfs` ADD `lastSyncedAt` timestamp;--> statement-breakpoint
ALTER TABLE `pdf_sync_logs` ADD CONSTRAINT `pdf_sync_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;