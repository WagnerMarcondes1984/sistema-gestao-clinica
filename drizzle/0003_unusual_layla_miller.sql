ALTER TABLE `mindos_cms_versions` MODIFY COLUMN `contentJson` text NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_memberships` MODIFY COLUMN `permissionsJson` text NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_tenants` MODIFY COLUMN `siteConfigJson` text NOT NULL;