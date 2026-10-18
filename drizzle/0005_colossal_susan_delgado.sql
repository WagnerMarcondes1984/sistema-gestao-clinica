ALTER TABLE `accounts_payable` ADD `tenantId` int;--> statement-breakpoint
ALTER TABLE `cash_sessions` ADD `tenantId` int;--> statement-breakpoint
ALTER TABLE `financial_audit_logs` ADD `actorUserId` int;--> statement-breakpoint
ALTER TABLE `financial_audit_logs` ADD `tenantId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `tenantId` int;--> statement-breakpoint
CREATE INDEX `accounts_payable_tenant_idx` ON `accounts_payable` (`tenantId`);--> statement-breakpoint
CREATE INDEX `cash_sessions_tenant_idx` ON `cash_sessions` (`tenantId`);--> statement-breakpoint
CREATE INDEX `financial_audit_logs_tenant_idx` ON `financial_audit_logs` (`tenantId`);--> statement-breakpoint
CREATE INDEX `transactions_tenant_idx` ON `transactions` (`tenantId`);