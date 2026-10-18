CREATE TABLE `mindos_availability` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`professionalId` int NOT NULL,
	`unitId` int NOT NULL,
	`weekday` int NOT NULL,
	`startMinute` int NOT NULL,
	`endMinute` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`revision` int NOT NULL DEFAULT 1,
	CONSTRAINT `mindos_availability_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mindos_booking_limits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`keyHash` varchar(64) NOT NULL,
	`windowStart` timestamp NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	CONSTRAINT `mindos_booking_limits_id` PRIMARY KEY(`id`),
	CONSTRAINT `mindos_booking_limits_key_unique` UNIQUE(`tenantId`,`keyHash`)
);
--> statement-breakpoint
CREATE TABLE `mindos_professionals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`nameKey` varchar(160) NOT NULL,
	`registration` varchar(80),
	`userId` int,
	`active` boolean NOT NULL DEFAULT true,
	`revision` int NOT NULL DEFAULT 1,
	CONSTRAINT `mindos_professionals_id` PRIMARY KEY(`id`),
	CONSTRAINT `mindos_professionals_name_unique` UNIQUE(`tenantId`,`nameKey`)
);
--> statement-breakpoint
CREATE TABLE `mindos_services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`nameKey` varchar(160) NOT NULL,
	`durationMinutes` int NOT NULL,
	`mode` enum('BOTH','ONLINE','IN_PERSON') NOT NULL DEFAULT 'BOTH',
	`publicEnabled` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`revision` int NOT NULL DEFAULT 1,
	CONSTRAINT `mindos_services_id` PRIMARY KEY(`id`),
	CONSTRAINT `mindos_services_name_unique` UNIQUE(`tenantId`,`nameKey`)
);
--> statement-breakpoint
CREATE TABLE `mindos_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`nameKey` varchar(128) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`revision` int NOT NULL DEFAULT 1,
	CONSTRAINT `mindos_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `mindos_units_name_unique` UNIQUE(`tenantId`,`nameKey`)
);
--> statement-breakpoint
ALTER TABLE `mindos_appointments` ADD `professionalId` int;--> statement-breakpoint
ALTER TABLE `mindos_appointments` ADD `unitId` int;--> statement-breakpoint
ALTER TABLE `mindos_appointments` ADD `serviceId` int;--> statement-breakpoint
ALTER TABLE `mindos_appointments` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_appointments` ADD `replacedByAppointmentId` int;--> statement-breakpoint
ALTER TABLE `mindos_booking_requests` ADD `serviceId` int;--> statement-breakpoint
ALTER TABLE `mindos_booking_requests` ADD `patientId` int;--> statement-breakpoint
ALTER TABLE `mindos_booking_requests` ADD `appointmentId` int;--> statement-breakpoint
ALTER TABLE `mindos_booking_requests` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_reception_events` ADD `appointmentId` int;--> statement-breakpoint
ALTER TABLE `mindos_tenants` ADD `timezone` varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
CREATE INDEX `mindos_availability_professional_idx` ON `mindos_availability` (`tenantId`,`professionalId`);