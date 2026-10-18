CREATE TABLE `mindos_access_audits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`subjectType` varchar(64) NOT NULL,
	`subjectId` int,
	`dataLayer` enum('ADMINISTRATIVE','CLINICAL','HIGHLY_RESTRICTED_CLINICAL','FINANCIAL','PUBLIC') NOT NULL,
	`action` varchar(64) NOT NULL,
	`reason` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_access_audits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`patientId` int NOT NULL,
	`professionalUserId` int,
	`professionalName` varchar(160) NOT NULL,
	`unitName` varchar(128) NOT NULL,
	`serviceType` varchar(160) NOT NULL,
	`mode` enum('IN_PERSON','ONLINE') NOT NULL DEFAULT 'IN_PERSON',
	`status` enum('SCHEDULED','CONFIRMED','ARRIVED','WAITING','IN_PROGRESS','COMPLETED','NO_SHOW','CANCELLED','RESCHEDULED') NOT NULL DEFAULT 'SCHEDULED',
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`recurrenceId` varchar(64),
	`notesAdmin` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mindos_appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_clinical_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`patientId` int NOT NULL,
	`appointmentId` int,
	`authorUserId` int NOT NULL,
	`recordType` enum('ANAMNESIS','EVOLUTION','RESTRICTED_NOTE','GOAL','CARE_PLAN') NOT NULL,
	`status` enum('DRAFT','FINALIZED','ADDENDUM') NOT NULL DEFAULT 'DRAFT',
	`content` text NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`integrityHash` varchar(128),
	`finalizedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mindos_clinical_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_cms_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`versionNumber` int NOT NULL DEFAULT 1,
	`status` enum('DRAFT','PREVIEW','APPROVED','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
	`contentJson` text NOT NULL DEFAULT ('{}'),
	`changeSummary` varchar(255),
	`createdByUserId` int NOT NULL,
	`approvedByUserId` int,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_cms_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_financial_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`ruleType` enum('SESSION','PACKAGE','PAYOUT','COMMISSION') NOT NULL,
	`name` varchar(160) NOT NULL,
	`valueInCents` int,
	`percentageBps` int,
	`basis` enum('PER_SESSION','PER_RECEIPT','PER_PRODUCTION') NOT NULL DEFAULT 'PER_SESSION',
	`version` int NOT NULL DEFAULT 1,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_financial_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('OWNER','CLINIC_ADMIN','PSYCHOLOGIST','ASSISTANT','RECEPTIONIST','FINANCIAL','SALES','VIEWER','PATIENT','SUPER_ADMIN') NOT NULL DEFAULT 'VIEWER',
	`permissionsJson` text NOT NULL DEFAULT ('[]'),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_memberships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`preferredName` varchar(96),
	`email` varchar(200),
	`phone` varchar(40),
	`birthDate` timestamp,
	`administrativeStatus` enum('LEAD','ACTIVE','INACTIVE','CLOSED') NOT NULL DEFAULT 'LEAD',
	`preferredChannel` enum('WHATSAPP_DISCREET','EMAIL','PHONE') NOT NULL DEFAULT 'WHATSAPP_DISCREET',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mindos_patients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(96) NOT NULL,
	`name` varchar(160) NOT NULL,
	`legalName` varchar(200),
	`businessType` varchar(64) NOT NULL DEFAULT 'PSYCHOLOGY_CLINIC',
	`status` enum('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
	`primaryColor` varchar(32) NOT NULL DEFAULT '#4338CA',
	`accentColor` varchar(32) NOT NULL DEFAULT '#6366F1',
	`siteConfigJson` text NOT NULL DEFAULT ('{}'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mindos_tenants_id` PRIMARY KEY(`id`)
);
