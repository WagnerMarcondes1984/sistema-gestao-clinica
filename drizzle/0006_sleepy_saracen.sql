ALTER TABLE `mindos_patients` ADD `portalUserId` int;--> statement-breakpoint
ALTER TABLE `mindos_patients` ADD CONSTRAINT `mindos_patients_portal_user_unique` UNIQUE(`tenantId`,`portalUserId`);--> statement-breakpoint
ALTER TABLE `mindos_tenants` ADD CONSTRAINT `mindos_tenants_slug_unique` UNIQUE(`slug`);