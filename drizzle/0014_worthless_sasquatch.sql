CREATE TABLE `mindos_contact_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`patientId` int NOT NULL,
	`emailAllowed` boolean NOT NULL DEFAULT false,
	`whatsappAllowed` boolean NOT NULL DEFAULT false,
	`revision` int NOT NULL DEFAULT 1,
	`source` enum('STAFF_RECORDED','PATIENT_PORTAL') NOT NULL,
	`recordedByUserId` int NOT NULL,
	`reason` varchar(500) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mindos_contact_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_preference_patient` UNIQUE(`tenantId`,`patientId`)
);
--> statement-breakpoint
CREATE TABLE `mindos_crm_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`leadId` int,
	`patientId` int,
	`channel` varchar(32) NOT NULL,
	`outcome` varchar(32) NOT NULL,
	`summary` varchar(1000) NOT NULL,
	`actorUserId` int NOT NULL,
	`creationKey` varchar(64) NOT NULL,
	`creationHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_crm_interactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `crm_interaction_creation` UNIQUE(`tenantId`,`creationKey`)
);
--> statement-breakpoint
CREATE TABLE `mindos_crm_leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`email` varchar(200),
	`phone` varchar(40),
	`source` enum('MANUAL','PUBLIC_BOOKING','REFERRAL','OTHER') NOT NULL,
	`stage` enum('NEW','CONTACTED','QUALIFIED','CONVERTED','LOST') NOT NULL DEFAULT 'NEW',
	`ownerUserId` int,
	`nextContactAt` timestamp,
	`patientId` int,
	`contactAllowed` boolean NOT NULL DEFAULT false,
	`preferredChannel` varchar(32) NOT NULL,
	`lostReason` varchar(500),
	`revision` int NOT NULL DEFAULT 1,
	`creationKey` varchar(64) NOT NULL,
	`creationHash` varchar(64) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`convertedAt` timestamp,
	CONSTRAINT `mindos_crm_leads_id` PRIMARY KEY(`id`),
	CONSTRAINT `crm_lead_creation` UNIQUE(`tenantId`,`creationKey`)
);
--> statement-breakpoint
CREATE TABLE `mindos_crm_reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`patientId` int NOT NULL,
	`appointmentId` int,
	`appointmentRevision` int,
	`taskId` int,
	`kind` enum('SESSION_REMINDER','CONFIRMATION','RETURN') NOT NULL,
	`channel` varchar(32) NOT NULL,
	`dueAt` timestamp NOT NULL,
	`status` enum('WAITING_PROVIDER','SUPPRESSED','CANCELLED') NOT NULL,
	`reason` varchar(180) NOT NULL,
	`templateText` varchar(320) NOT NULL,
	`dedupeKey` varchar(64) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_crm_reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `crm_reminder_dedupe` UNIQUE(`tenantId`,`dedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `mindos_crm_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`leadId` int,
	`patientId` int,
	`title` varchar(180) NOT NULL,
	`kind` enum('FOLLOW_UP','RETURN') NOT NULL,
	`ownerUserId` int NOT NULL,
	`dueAt` timestamp NOT NULL,
	`status` enum('OPEN','DONE','CANCELLED') NOT NULL DEFAULT 'OPEN',
	`revision` int NOT NULL DEFAULT 1,
	`creationKey` varchar(36) NOT NULL,
	`creationHash` varchar(64) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`resolvedByUserId` int,
	`resolution` varchar(500),
	CONSTRAINT `mindos_crm_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `crm_task_creation` UNIQUE(`tenantId`,`creationKey`)
);
--> statement-breakpoint
ALTER TABLE `mindos_booking_requests` ADD `crmLeadId` int;--> statement-breakpoint
CREATE INDEX `crm_interactions_tenant` ON `mindos_crm_interactions` (`tenantId`);--> statement-breakpoint
CREATE INDEX `crm_leads_tenant` ON `mindos_crm_leads` (`tenantId`);--> statement-breakpoint
CREATE INDEX `crm_reminders_tenant` ON `mindos_crm_reminders` (`tenantId`);--> statement-breakpoint
CREATE INDEX `crm_tasks_tenant_due` ON `mindos_crm_tasks` (`tenantId`,`dueAt`);