CREATE TABLE `mindos_team_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('CLINIC_ADMIN','PSYCHOLOGIST','ASSISTANT','RECEPTIONIST','FINANCIAL','SALES','VIEWER','PATIENT') NOT NULL,
	`permissionsJson` text NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`patientId` int,
	`status` enum('PENDING','ACCEPTED','REVOKED') NOT NULL DEFAULT 'PENDING',
	`createdByUserId` int NOT NULL,
	`acceptedByUserId` int,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mindos_team_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `mindos_team_invites_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `mindos_memberships` ADD CONSTRAINT `mindos_memberships_tenant_user_unique` UNIQUE(`tenantId`,`userId`);--> statement-breakpoint
CREATE INDEX `mindos_team_invites_tenant_idx` ON `mindos_team_invites` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `mindos_memberships_user_active_idx` ON `mindos_memberships` (`userId`,`active`);