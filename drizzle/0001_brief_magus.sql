CREATE TABLE `ai_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`sourceStudyIds` varchar(1024),
	`generatedPdfUrl` varchar(512),
	`relatedVideoUrls` varchar(1024),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_interactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cornell_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`studyId` int NOT NULL,
	`questions` text,
	`notes` text,
	`summary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cornell_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('lesson_completed','notes_created','pdf_uploaded','ai_question_asked') NOT NULL,
	`studyId` int,
	`description` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `milestones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdfs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`studyId` int,
	`fileName` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` varchar(512) NOT NULL,
	`fileSize` int,
	`mimeType` varchar(64) DEFAULT 'application/pdf',
	`textContent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pdfs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `studies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`topic` varchar(128),
	`category` varchar(64),
	`description` text,
	`videoUrl` varchar(512),
	`thumbnail` varchar(512),
	`summary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `studies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `study_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studyId` int NOT NULL,
	`tagId` int NOT NULL,
	CONSTRAINT `study_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` enum('keyword','scripture','topic') DEFAULT 'keyword',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ai_interactions` ADD CONSTRAINT `ai_interactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cornell_notes` ADD CONSTRAINT `cornell_notes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cornell_notes` ADD CONSTRAINT `cornell_notes_studyId_studies_id_fk` FOREIGN KEY (`studyId`) REFERENCES `studies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestones` ADD CONSTRAINT `milestones_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `milestones` ADD CONSTRAINT `milestones_studyId_studies_id_fk` FOREIGN KEY (`studyId`) REFERENCES `studies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pdfs` ADD CONSTRAINT `pdfs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pdfs` ADD CONSTRAINT `pdfs_studyId_studies_id_fk` FOREIGN KEY (`studyId`) REFERENCES `studies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studies` ADD CONSTRAINT `studies_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `study_tags` ADD CONSTRAINT `study_tags_studyId_studies_id_fk` FOREIGN KEY (`studyId`) REFERENCES `studies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `study_tags` ADD CONSTRAINT `study_tags_tagId_tags_id_fk` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tags` ADD CONSTRAINT `tags_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;