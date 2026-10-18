CREATE TABLE `mindos_clinical_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`recordId` int NOT NULL,
	`revision` int NOT NULL,
	`snapshotJson` text NOT NULL,
	`integrityHash` varchar(64) NOT NULL,
	`previousHash` varchar(64),
	`actorUserId` int NOT NULL,
	`action` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_clinical_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `mindos_clinical_versions_unique` UNIQUE(`tenantId`,`recordId`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `mindos_consent_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`patientId` int NOT NULL,
	`templateId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`decision` enum('ACCEPTED','DECLINED','WITHDRAWN') NOT NULL,
	`snapshotJson` text NOT NULL,
	`bodyHash` varchar(64) NOT NULL,
	`previousHash` varchar(64),
	`evidenceHash` varchar(64) NOT NULL,
	`decidedAt` timestamp(3) NOT NULL,
	CONSTRAINT `mindos_consent_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_consent_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`code` varchar(64) NOT NULL,
	`version` int NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`bodyHash` varchar(64) NOT NULL,
	`status` enum('DRAFT','PUBLISHED','RETIRED') NOT NULL DEFAULT 'DRAFT',
	`createdByUserId` int NOT NULL,
	`publishedByUserId` int,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_consent_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `mindos_consent_template_version_unique` UNIQUE(`tenantId`,`code`,`version`)
);
--> statement-breakpoint
CREATE TABLE `mindos_patient_clinicians` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`patientId` int NOT NULL,
	`userId` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`assignedByUserId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mindos_patient_clinicians_id` PRIMARY KEY(`id`),
	CONSTRAINT `mindos_patient_clinicians_unique` UNIQUE(`tenantId`,`patientId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `mindos_reschedule_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`patientId` int NOT NULL,
	`appointmentId` int NOT NULL,
	`activeKey` varchar(64),
	`date` varchar(10) NOT NULL,
	`time` varchar(8) NOT NULL,
	`status` enum('PENDING','APPROVED','DECLINED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`revision` int NOT NULL DEFAULT 1,
	`requestedByUserId` int NOT NULL,
	`resolvedByUserId` int,
	`replacementAppointmentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `mindos_reschedule_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `mindos_reschedule_requests_active_unique` UNIQUE(`tenantId`,`activeKey`)
);
--> statement-breakpoint
ALTER TABLE `mindos_clinical_records` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_clinical_records` ADD `parentRecordId` int;--> statement-breakpoint
ALTER TABLE `mindos_clinical_records` ADD `integrityVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_portal_documents` ADD `fileKey` varchar(64);--> statement-breakpoint
ALTER TABLE `mindos_portal_documents` ADD `fileName` varchar(180);--> statement-breakpoint
ALTER TABLE `mindos_portal_documents` ADD `mimeType` varchar(64);--> statement-breakpoint
ALTER TABLE `mindos_portal_documents` ADD `fileSize` int;--> statement-breakpoint
ALTER TABLE `mindos_portal_documents` ADD `fileHash` varchar(64);--> statement-breakpoint
ALTER TABLE `mindos_portal_documents` ADD `portalVisible` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_portal_documents` ADD `scope` enum('ADMINISTRATIVE','CLINICAL') DEFAULT 'ADMINISTRATIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_portal_documents` ADD `uploadedByUserId` int;--> statement-breakpoint
ALTER TABLE `mindos_portal_documents` ADD `revokedAt` timestamp;--> statement-breakpoint
ALTER TABLE `mindos_portal_documents` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `patientId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `portalVisible` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `mindos_consent_decisions_patient_idx` ON `mindos_consent_decisions` (`tenantId`,`patientId`,`templateId`);
--> statement-breakpoint
UPDATE `mindos_portal_documents` SET `portalVisible` = true WHERE `status` = 'AVAILABLE';
