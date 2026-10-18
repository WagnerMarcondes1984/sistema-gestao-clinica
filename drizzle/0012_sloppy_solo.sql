ALTER TABLE `mindos_clinical_records` MODIFY COLUMN `content` mediumtext NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_clinical_versions` MODIFY COLUMN `snapshotJson` mediumtext NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_consent_decisions` MODIFY COLUMN `snapshotJson` mediumtext NOT NULL;--> statement-breakpoint
ALTER TABLE `mindos_consent_templates` MODIFY COLUMN `body` mediumtext NOT NULL;