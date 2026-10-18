ALTER TABLE `mindos_cms_versions` MODIFY COLUMN `contentJson` mediumtext NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_cms_versions` ADD `creationKey` varchar(36);--> statement-breakpoint
ALTER TABLE `mindos_cms_versions` ADD `creationHash` varchar(64);--> statement-breakpoint
ALTER TABLE `mindos_cms_versions` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `mindos_tenants` ADD `cmsRevision` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_tenants` ADD `cmsPublishedVersionId` int;