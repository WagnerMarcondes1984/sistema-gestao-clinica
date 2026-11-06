CREATE TABLE `mindos_sales_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`opportunityId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`summary` varchar(1000) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_sales_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_sales_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`ownerUserId` int NOT NULL,
	`targetAmount` int NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`recordedByUserId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mindos_sales_goals_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_goal_month_owner` UNIQUE(`tenantId`,`month`,`ownerUserId`)
);
--> statement-breakpoint
CREATE TABLE `mindos_sales_opportunities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`leadId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`amount` int NOT NULL,
	`stage` enum('QUALIFICATION','PROPOSAL','NEGOTIATION','WON','LOST') NOT NULL DEFAULT 'QUALIFICATION',
	`source` varchar(32) NOT NULL,
	`ownerUserId` int NOT NULL,
	`expectedCloseDate` varchar(10) NOT NULL,
	`lostReason` varchar(500),
	`revision` int NOT NULL DEFAULT 1,
	`stageVersion` int NOT NULL DEFAULT 1,
	`creationKey` varchar(36) NOT NULL,
	`creationHash` varchar(64) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`stageEnteredAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	CONSTRAINT `mindos_sales_opportunities_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_op_creation` UNIQUE(`tenantId`,`creationKey`)
);
--> statement-breakpoint
CREATE TABLE `mindos_sales_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`leadId` int NOT NULL,
	`emailAllowed` boolean NOT NULL DEFAULT false,
	`whatsappAllowed` boolean NOT NULL DEFAULT false,
	`reason` varchar(500) NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`recordedByUserId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mindos_sales_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_preference_lead` UNIQUE(`tenantId`,`leadId`)
);
--> statement-breakpoint
CREATE TABLE `mindos_sales_proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`opportunityId` int NOT NULL,
	`version` int NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`title` varchar(160) NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` int NOT NULL,
	`discount` int NOT NULL,
	`total` int NOT NULL,
	`validUntil` varchar(10) NOT NULL,
	`terms` text NOT NULL,
	`status` enum('DRAFT','PRESENTED','ACCEPTED','DECLINED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
	`evidence` varchar(500),
	`decidedByUserId` int,
	`decidedAt` timestamp,
	`creationKey` varchar(36) NOT NULL,
	`creationHash` varchar(64) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_sales_proposals_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_proposal_creation` UNIQUE(`tenantId`,`creationKey`),
	CONSTRAINT `sales_proposal_version` UNIQUE(`tenantId`,`opportunityId`,`version`)
);
--> statement-breakpoint
CREATE TABLE `mindos_sales_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`stage` enum('QUALIFICATION','PROPOSAL','NEGOTIATION') NOT NULL,
	`channel` enum('EMAIL','WHATSAPP_DISCREET') NOT NULL,
	`delayDays` int NOT NULL,
	`enabled` boolean NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`recordedByUserId` int NOT NULL,
	CONSTRAINT `mindos_sales_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_sales_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`opportunityId` int NOT NULL,
	`ruleId` int NOT NULL,
	`stageVersion` int NOT NULL,
	`ruleRevision` int NOT NULL,
	`taskId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_sales_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_run_once` UNIQUE(`tenantId`,`opportunityId`,`ruleId`,`stageVersion`,`ruleRevision`)
);
--> statement-breakpoint
CREATE INDEX `sales_events_opportunity` ON `mindos_sales_events` (`tenantId`,`opportunityId`);--> statement-breakpoint
CREATE INDEX `sales_op_stage` ON `mindos_sales_opportunities` (`tenantId`,`stage`);--> statement-breakpoint
CREATE INDEX `sales_op_owner` ON `mindos_sales_opportunities` (`tenantId`,`ownerUserId`);--> statement-breakpoint
CREATE INDEX `sales_rules_tenant` ON `mindos_sales_rules` (`tenantId`);