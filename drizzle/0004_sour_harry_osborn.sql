CREATE TABLE `mindos_booking_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`contactChannel` enum('WHATSAPP_DISCREET','EMAIL','PHONE') NOT NULL DEFAULT 'WHATSAPP_DISCREET',
	`contactValue` varchar(200) NOT NULL,
	`serviceType` varchar(160) NOT NULL,
	`preferredDate` timestamp NOT NULL,
	`preferredTime` varchar(8) NOT NULL,
	`status` enum('NEW','CONTACTED','CONFIRMED','DECLINED','SPAM') NOT NULL DEFAULT 'NEW',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mindos_booking_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_institutional_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`metaDescription` varchar(320) NOT NULL,
	`city` varchar(96),
	`faqJson` text NOT NULL,
	`llmsTxt` text NOT NULL,
	`updatedByUserId` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mindos_institutional_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `mindos_institutional_profiles_tenantId_unique` UNIQUE(`tenantId`)
);
--> statement-breakpoint
CREATE TABLE `mindos_portal_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`patientId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`documentType` enum('CONSENT','ADMINISTRATIVE','RECEIPT','GUIDANCE') NOT NULL,
	`status` enum('AVAILABLE','REVOKED','SIGNED') NOT NULL DEFAULT 'AVAILABLE',
	`version` int NOT NULL DEFAULT 1,
	`releasedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_portal_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_reception_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`patientId` int NOT NULL,
	`eventType` enum('CHECK_IN','MESSAGE_SENT','CALL_LOGGED','PROFILE_REVIEWED') NOT NULL,
	`messageTemplate` varchar(160),
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_reception_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_service_areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`publicDescription` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_service_areas_id` PRIMARY KEY(`id`)
);
