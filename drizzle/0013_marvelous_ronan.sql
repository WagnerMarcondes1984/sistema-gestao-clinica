CREATE TABLE `financial_installments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`transactionId` int NOT NULL,
	`number` int NOT NULL,
	`amount` int NOT NULL,
	`paidAmount` int NOT NULL DEFAULT 0,
	`refundedAmount` int NOT NULL DEFAULT 0,
	`dueDate` timestamp NOT NULL,
	CONSTRAINT `financial_installments_id` PRIMARY KEY(`id`),
	CONSTRAINT `financial_installment_number` UNIQUE(`transactionId`,`number`)
);
--> statement-breakpoint
CREATE TABLE `financial_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`operationId` int NOT NULL,
	`transactionId` int,
	`payableId` int,
	`cashSessionId` int,
	`kind` enum('RECEIPT','REVERSAL','PAYABLE_PAYMENT','CASH_IN','CASH_OUT') NOT NULL,
	`amount` int NOT NULL,
	`method` varchar(32) NOT NULL,
	`reference` varchar(160) NOT NULL,
	`reason` text,
	`actorUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financial_movements_id` PRIMARY KEY(`id`),
	CONSTRAINT `financial_movement_operation` UNIQUE(`operationId`)
);
--> statement-breakpoint
CREATE TABLE `financial_operations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`requestId` varchar(36) NOT NULL,
	`payloadHash` varchar(64) NOT NULL,
	`actorUserId` int NOT NULL,
	`action` varchar(48) NOT NULL,
	`resultJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financial_operations_id` PRIMARY KEY(`id`),
	CONSTRAINT `financial_operation_key` UNIQUE(`tenantId`,`requestId`)
);
--> statement-breakpoint
ALTER TABLE `accounts_payable` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts_payable` ADD `ledgerVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts_payable` ADD `settledAmount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_sessions` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_sessions` ADD `ledgerVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_sessions` ADD `activeKey` varchar(96);--> statement-breakpoint
ALTER TABLE `transactions` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `ledgerVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `appointmentId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `refundedAmount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_sessions` ADD CONSTRAINT `cash_sessions_activeKey_unique` UNIQUE(`activeKey`);--> statement-breakpoint
CREATE INDEX `financial_installments_tenant` ON `financial_installments` (`tenantId`);--> statement-breakpoint
CREATE INDEX `financial_movements_tenant` ON `financial_movements` (`tenantId`);