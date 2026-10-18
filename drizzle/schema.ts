import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  mediumtext,
  timestamp,
  varchar,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Configuração das verticais clínicas suportadas
 */
export const clinicalVerticals = mysqlTable("clinical_verticals", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(), // DENTAL_CLINIC, MEDICAL_CLINIC, etc.
  name: varchar("name", { length: 128 }).notNull(),
  tagline: varchar("tagline", { length: 255 }).notNull(),
  primaryColor: varchar("primaryColor", { length: 32 }).notNull(),
  accentColor: varchar("accentColor", { length: 32 }).notNull(),
  badgeLabel: varchar("badgeLabel", { length: 64 }).notNull(),
  cnpj: varchar("cnpj", { length: 20 }),
  municipalRegistration: varchar("municipalRegistration", { length: 32 }),
  city: varchar("city", { length: 64 }).default("São Paulo - SP"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClinicalVertical = typeof clinicalVerticals.$inferSelect;

/**
 * Transações Financeiras e Cobranças Clínicas
 */
export const transactions = mysqlTable(
  "transactions",
  {
    revision: int("revision").default(1).notNull(),
    ledgerVersion: int("ledgerVersion").default(0).notNull(),
    appointmentId: int("appointmentId"),
    refundedAmount: int("refundedAmount").default(0).notNull(),
    patientId: int("patientId"),
    portalVisible: boolean("portalVisible").default(false).notNull(),
    // Legado sem associação explícita permanece invisível até migração revisada.
    tenantId: int("tenantId"),
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(), // ex: COB-2026-8812
    verticalCode: varchar("verticalCode", { length: 32 }).notNull(), // DENTAL_CLINIC, etc.
    patientName: varchar("patientName", { length: 128 }).notNull(),
    patientDocument: varchar("patientDocument", { length: 32 }).notNull(), // CPF ou CNPJ
    patientEmail: varchar("patientEmail", { length: 128 }),
    patientPhone: varchar("patientPhone", { length: 32 }),
    professionalName: varchar("professionalName", { length: 128 }).notNull(),
    unitName: varchar("unitName", { length: 128 }).default("Unidade Central"),
    title: varchar("title", { length: 255 }).notNull(),
    type: mysqlEnum("type", ["RECEITA", "DESPESA"])
      .default("RECEITA")
      .notNull(),
    category: varchar("category", { length: 64 }).notNull(), // Consulta, Procedimento, Pacote, Exame, etc.
    paymentMethod: mysqlEnum("paymentMethod", [
      "PIX",
      "CREDIT_CARD",
      "DEBIT_CARD",
      "BOLETO",
      "CASH",
      "TRANSFER",
    ])
      .default("PIX")
      .notNull(),
    status: mysqlEnum("status", [
      "PENDING",
      "PAID",
      "OVERDUE",
      "FAILED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
    ])
      .default("PENDING")
      .notNull(),
    subtotal: int("subtotal").notNull(), // em centavos
    discount: int("discount").default(0).notNull(), // em centavos
    addition: int("addition").default(0).notNull(), // em centavos
    totalAmount: int("totalAmount").notNull(), // subtotal - discount + addition
    paidAmount: int("paidAmount").default(0).notNull(),
    installments: int("installments").default(1).notNull(),
    installmentValue: int("installmentValue"),
    dueDate: timestamp("dueDate").notNull(),
    paidAt: timestamp("paidAt"),
    // Dados do método específico
    pixQrCode: text("pixQrCode"),
    pixCopiaECola: text("pixCopiaECola"),
    pixExpiresAt: timestamp("pixExpiresAt"),
    barcode: varchar("barcode", { length: 64 }),
    digitableLine: varchar("digitableLine", { length: 64 }),
    cardBrand: varchar("cardBrand", { length: 32 }),
    cardLast4: varchar("cardLast4", { length: 4 }),
    nsu: varchar("nsu", { length: 64 }),
    authorizationCode: varchar("authorizationCode", { length: 64 }),
    cashReceived: int("cashReceived"),
    cashChange: int("cashChange"),
    // Informações Fiscais
    invoiceNumber: varchar("invoiceNumber", { length: 64 }),
    invoiceSeries: varchar("invoiceSeries", { length: 16 }).default("1"),
    invoiceStatus: mysqlEnum("invoiceStatus", [
      "NOT_ISSUED",
      "ISSUED",
      "CANCELLED",
      "ERROR",
    ])
      .default("NOT_ISSUED")
      .notNull(),
    invoiceKey: varchar("invoiceKey", { length: 64 }),
    invoiceIssuedAt: timestamp("invoiceIssuedAt"),
    notes: text("notes"),
    operatorName: varchar("operatorName", { length: 64 }).default(
      "Recepção Central"
    ),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("transactions_tenant_idx").on(table.tenantId)]
);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Itens de Procedimentos/Serviços do Atendimento
 */
export const transactionItems = mysqlTable("transaction_items", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 32 }).default("PROCEDURE").notNull(),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: int("unitPrice").notNull(), // centavos
  subtotal: int("subtotal").notNull(), // centavos
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TransactionItem = typeof transactionItems.$inferSelect;

/**
 * Contas a Pagar (Despesas clínicas, fornecedores, repasses)
 */
export const accountsPayable = mysqlTable(
  "accounts_payable",
  {
    revision: int("revision").default(1).notNull(),
    ledgerVersion: int("ledgerVersion").default(0).notNull(),
    settledAmount: int("settledAmount").default(0).notNull(),
    // Legado sem associação explícita permanece invisível até migração revisada.
    tenantId: int("tenantId"),
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    verticalCode: varchar("verticalCode", { length: 32 }).notNull(),
    supplierName: varchar("supplierName", { length: 128 }).notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 64 }).notNull(), // Materiais Clínicos, Aluguel, Repasse Médico, Energia, etc.
    amount: int("amount").notNull(), // centavos
    dueDate: timestamp("dueDate").notNull(),
    paidAt: timestamp("paidAt"),
    status: mysqlEnum("status", ["PENDING", "PAID", "OVERDUE", "CANCELLED"])
      .default("PENDING")
      .notNull(),
    paymentMethod: varchar("paymentMethod", { length: 32 }).default("BOLETO"),
    beneficiaryDocument: varchar("beneficiaryDocument", { length: 32 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("accounts_payable_tenant_idx").on(table.tenantId)]
);

export type AccountPayable = typeof accountsPayable.$inferSelect;

/**
 * Sessões de Caixa (Abertura, Movimentações e Fechamento)
 */
export const cashSessions = mysqlTable(
  "cash_sessions",
  {
    revision: int("revision").default(1).notNull(),
    ledgerVersion: int("ledgerVersion").default(0).notNull(),
    activeKey: varchar("activeKey", { length: 96 }).unique(),
    // Legado sem associação explícita permanece invisível até migração revisada.
    tenantId: int("tenantId"),
    id: int("id").autoincrement().primaryKey(),
    verticalCode: varchar("verticalCode", { length: 32 }).notNull(),
    sessionNumber: varchar("sessionNumber", { length: 32 }).notNull(),
    operatorName: varchar("operatorName", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["OPEN", "CLOSED"]).default("OPEN").notNull(),
    openingBalance: int("openingBalance").default(0).notNull(), // centavos
    cashInflow: int("cashInflow").default(0).notNull(),
    cashOutflow: int("cashOutflow").default(0).notNull(),
    expectedBalance: int("expectedBalance").default(0).notNull(),
    closingBalance: int("closingBalance"),
    difference: int("difference").default(0),
    openedAt: timestamp("openedAt").defaultNow().notNull(),
    closedAt: timestamp("closedAt"),
    closingNotes: text("closingNotes"),
  },
  table => [index("cash_sessions_tenant_idx").on(table.tenantId)]
);

export type CashSession = typeof cashSessions.$inferSelect;

/**
 * Log de Auditoria de Operações Financeiras
 */
export const financialAuditLogs = mysqlTable(
  "financial_audit_logs",
  {
    actorUserId: int("actorUserId"),
    // Legado sem associação explícita permanece invisível até migração revisada.
    tenantId: int("tenantId"),
    id: int("id").autoincrement().primaryKey(),
    verticalCode: varchar("verticalCode", { length: 32 }).notNull(),
    transactionCode: varchar("transactionCode", { length: 32 }),
    action: varchar("action", { length: 64 }).notNull(), // CREATE_CHARGE, CONFIRM_PAYMENT, REFUND, ISSUE_INVOICE, CASH_OPEN, CASH_CLOSE
    operator: varchar("operator", { length: 64 }).notNull(),
    details: text("details").notNull(),
    ipAddress: varchar("ipAddress", { length: 45 }).default("127.0.0.1"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("financial_audit_logs_tenant_idx").on(table.tenantId)]
);

export type FinancialAuditLog = typeof financialAuditLogs.$inferSelect;

/**
 * Tenant MindOS. Todas as entidades operacionais abaixo devem ser filtradas por tenantId no backend.
 */
export const mindosTenants = mysqlTable("mindos_tenants", {
  timezone: varchar("timezone", { length: 64 })
    .default("America/Sao_Paulo")
    .notNull(),
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  legalName: varchar("legalName", { length: 200 }),
  businessType: varchar("businessType", { length: 64 })
    .default("PSYCHOLOGY_CLINIC")
    .notNull(),
  status: mysqlEnum("status", ["ACTIVE", "PAUSED"]).default("ACTIVE").notNull(),
  primaryColor: varchar("primaryColor", { length: 32 })
    .default("#4338CA")
    .notNull(),
  accentColor: varchar("accentColor", { length: 32 })
    .default("#6366F1")
    .notNull(),
  siteConfigJson: text("siteConfigJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MindosTenant = typeof mindosTenants.$inferSelect;
export type InsertMindosTenant = typeof mindosTenants.$inferInsert;

export const mindosMemberships = mysqlTable(
  "mindos_memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", [
      "OWNER",
      "CLINIC_ADMIN",
      "PSYCHOLOGIST",
      "ASSISTANT",
      "RECEPTIONIST",
      "FINANCIAL",
      "SALES",
      "VIEWER",
      "PATIENT",
      "SUPER_ADMIN",
    ])
      .default("VIEWER")
      .notNull(),
    permissionsJson: text("permissionsJson").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("mindos_memberships_tenant_user_unique").on(
      table.tenantId,
      table.userId
    ),
    index("mindos_memberships_user_active_idx").on(table.userId, table.active),
  ]
);
export type MindosMembership = typeof mindosMemberships.$inferSelect;

export const mindosTeamInvites = mysqlTable(
  "mindos_team_invites",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    role: mysqlEnum("role", [
      "CLINIC_ADMIN",
      "PSYCHOLOGIST",
      "ASSISTANT",
      "RECEPTIONIST",
      "FINANCIAL",
      "SALES",
      "VIEWER",
      "PATIENT",
    ]).notNull(),
    permissionsJson: text("permissionsJson").notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    patientId: int("patientId"),
    status: mysqlEnum("status", ["PENDING", "ACCEPTED", "REVOKED"])
      .default("PENDING")
      .notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    acceptedByUserId: int("acceptedByUserId"),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("mindos_team_invites_tenant_idx").on(table.tenantId, table.status),
  ]
);

export const mindosPatients = mysqlTable(
  "mindos_patients",
  {
    revision: int("revision").default(1).notNull(),
    portalUserId: int("portalUserId"),
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    preferredName: varchar("preferredName", { length: 96 }),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 40 }),
    birthDate: timestamp("birthDate"),
    administrativeStatus: mysqlEnum("administrativeStatus", [
      "LEAD",
      "ACTIVE",
      "INACTIVE",
      "CLOSED",
    ])
      .default("LEAD")
      .notNull(),
    preferredChannel: mysqlEnum("preferredChannel", [
      "WHATSAPP_DISCREET",
      "EMAIL",
      "PHONE",
    ])
      .default("WHATSAPP_DISCREET")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mindos_patients_portal_user_unique").on(
      table.tenantId,
      table.portalUserId
    ),
  ]
);
export type MindosPatient = typeof mindosPatients.$inferSelect;
export type InsertMindosPatient = typeof mindosPatients.$inferInsert;

export const mindosAppointments = mysqlTable(
  "mindos_appointments",
  {
    professionalId: int("professionalId"),
    unitId: int("unitId"),
    serviceId: int("serviceId"),
    revision: int("revision").default(1).notNull(),
    replacedByAppointmentId: int("replacedByAppointmentId"),
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    patientId: int("patientId").notNull(),
    professionalUserId: int("professionalUserId"),
    professionalName: varchar("professionalName", { length: 160 }).notNull(),
    unitName: varchar("unitName", { length: 128 }).notNull(),
    serviceType: varchar("serviceType", { length: 160 }).notNull(),
    mode: mysqlEnum("mode", ["IN_PERSON", "ONLINE"])
      .default("IN_PERSON")
      .notNull(),
    status: mysqlEnum("status", [
      "SCHEDULED",
      "CONFIRMED",
      "ARRIVED",
      "WAITING",
      "IN_PROGRESS",
      "COMPLETED",
      "NO_SHOW",
      "CANCELLED",
      "RESCHEDULED",
    ])
      .default("SCHEDULED")
      .notNull(),
    startsAt: timestamp("startsAt").notNull(),
    endsAt: timestamp("endsAt").notNull(),
    recurrenceId: varchar("recurrenceId", { length: 64 }),
    notesAdmin: text("notesAdmin"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("mindos_appointments_tenant_starts_idx").on(
      table.tenantId,
      table.startsAt
    ),
    index("mindos_appointments_tenant_series_idx").on(
      table.tenantId,
      table.recurrenceId
    ),
  ]
);
export type MindosAppointment = typeof mindosAppointments.$inferSelect;
export type InsertMindosAppointment = typeof mindosAppointments.$inferInsert;

export const mindosClinicalRecords = mysqlTable("mindos_clinical_records", {
  revision: int("revision").default(1).notNull(),
  parentRecordId: int("parentRecordId"),
  integrityVersion: int("integrityVersion").default(0).notNull(),
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  patientId: int("patientId").notNull(),
  appointmentId: int("appointmentId"),
  authorUserId: int("authorUserId").notNull(),
  recordType: mysqlEnum("recordType", [
    "ANAMNESIS",
    "EVOLUTION",
    "RESTRICTED_NOTE",
    "GOAL",
    "CARE_PLAN",
  ]).notNull(),
  status: mysqlEnum("status", ["DRAFT", "FINALIZED", "ADDENDUM"])
    .default("DRAFT")
    .notNull(),
  content: mediumtext("content").notNull(),
  version: int("version").default(1).notNull(),
  integrityHash: varchar("integrityHash", { length: 128 }),
  finalizedAt: timestamp("finalizedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MindosClinicalRecord = typeof mindosClinicalRecords.$inferSelect;

export const mindosCmsVersions = mysqlTable("mindos_cms_versions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  versionNumber: int("versionNumber").default(1).notNull(),
  status: mysqlEnum("status", [
    "DRAFT",
    "PREVIEW",
    "APPROVED",
    "PUBLISHED",
    "ARCHIVED",
  ])
    .default("DRAFT")
    .notNull(),
  contentJson: text("contentJson").notNull(),
  changeSummary: varchar("changeSummary", { length: 255 }),
  createdByUserId: int("createdByUserId").notNull(),
  approvedByUserId: int("approvedByUserId"),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MindosCmsVersion = typeof mindosCmsVersions.$inferSelect;

export const mindosAccessAudits = mysqlTable("mindos_access_audits", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  actorUserId: int("actorUserId").notNull(),
  subjectType: varchar("subjectType", { length: 64 }).notNull(),
  subjectId: int("subjectId"),
  dataLayer: mysqlEnum("dataLayer", [
    "ADMINISTRATIVE",
    "CLINICAL",
    "HIGHLY_RESTRICTED_CLINICAL",
    "FINANCIAL",
    "PUBLIC",
  ]).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MindosAccessAudit = typeof mindosAccessAudits.$inferSelect;

export const mindosFinancialRules = mysqlTable("mindos_financial_rules", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  ruleType: mysqlEnum("ruleType", [
    "SESSION",
    "PACKAGE",
    "PAYOUT",
    "COMMISSION",
  ]).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  valueInCents: int("valueInCents"),
  percentageBps: int("percentageBps"),
  basis: mysqlEnum("basis", ["PER_SESSION", "PER_RECEIPT", "PER_PRODUCTION"])
    .default("PER_SESSION")
    .notNull(),
  version: int("version").default(1).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MindosFinancialRule = typeof mindosFinancialRules.$inferSelect;

export const mindosBookingRequests = mysqlTable("mindos_booking_requests", {
  serviceId: int("serviceId"),
  patientId: int("patientId"),
  appointmentId: int("appointmentId"),
  revision: int("revision").default(1).notNull(),
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  contactChannel: mysqlEnum("contactChannel", [
    "WHATSAPP_DISCREET",
    "EMAIL",
    "PHONE",
  ])
    .default("WHATSAPP_DISCREET")
    .notNull(),
  contactValue: varchar("contactValue", { length: 200 }).notNull(),
  serviceType: varchar("serviceType", { length: 160 }).notNull(),
  preferredDate: timestamp("preferredDate").notNull(),
  preferredTime: varchar("preferredTime", { length: 8 }).notNull(),
  status: mysqlEnum("status", [
    "NEW",
    "CONTACTED",
    "CONFIRMED",
    "DECLINED",
    "SPAM",
  ])
    .default("NEW")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MindosBookingRequest = typeof mindosBookingRequests.$inferSelect;

export const mindosInstitutionalProfiles = mysqlTable(
  "mindos_institutional_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().unique(),
    title: varchar("title", { length: 180 }).notNull(),
    metaDescription: varchar("metaDescription", { length: 320 }).notNull(),
    city: varchar("city", { length: 96 }),
    faqJson: text("faqJson").notNull(),
    llmsTxt: text("llmsTxt").notNull(),
    updatedByUserId: int("updatedByUserId"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);
export type MindosInstitutionalProfile =
  typeof mindosInstitutionalProfiles.$inferSelect;

export const mindosServiceAreas = mysqlTable("mindos_service_areas", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  publicDescription: text("publicDescription").notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MindosServiceArea = typeof mindosServiceAreas.$inferSelect;

export const mindosPortalDocuments = mysqlTable("mindos_portal_documents", {
  fileKey: varchar("fileKey", { length: 64 }),
  fileName: varchar("fileName", { length: 180 }),
  mimeType: varchar("mimeType", { length: 64 }),
  fileSize: int("fileSize"),
  fileHash: varchar("fileHash", { length: 64 }),
  portalVisible: boolean("portalVisible").default(false).notNull(),
  scope: mysqlEnum("scope", ["ADMINISTRATIVE", "CLINICAL"])
    .default("ADMINISTRATIVE")
    .notNull(),
  uploadedByUserId: int("uploadedByUserId"),
  revokedAt: timestamp("revokedAt"),
  revision: int("revision").default(1).notNull(),
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  patientId: int("patientId").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  documentType: mysqlEnum("documentType", [
    "CONSENT",
    "ADMINISTRATIVE",
    "RECEIPT",
    "GUIDANCE",
  ]).notNull(),
  status: mysqlEnum("status", ["AVAILABLE", "REVOKED", "SIGNED"])
    .default("AVAILABLE")
    .notNull(),
  version: int("version").default(1).notNull(),
  releasedAt: timestamp("releasedAt").defaultNow().notNull(),
});
export type MindosPortalDocument = typeof mindosPortalDocuments.$inferSelect;

export const mindosReceptionEvents = mysqlTable("mindos_reception_events", {
  appointmentId: int("appointmentId"),
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull(),
  patientId: int("patientId").notNull(),
  eventType: mysqlEnum("eventType", [
    "CHECK_IN",
    "MESSAGE_SENT",
    "CALL_LOGGED",
    "PROFILE_REVIEWED",
  ]).notNull(),
  messageTemplate: varchar("messageTemplate", { length: 160 }),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MindosReceptionEvent = typeof mindosReceptionEvents.$inferSelect;

export const mindosProfessionals = mysqlTable(
  "mindos_professionals",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    nameKey: varchar("nameKey", { length: 160 }).notNull(),
    registration: varchar("registration", { length: 80 }),
    userId: int("userId"),
    active: boolean("active").default(true).notNull(),
    revision: int("revision").default(1).notNull(),
  },
  table => [
    uniqueIndex("mindos_professionals_name_unique").on(
      table.tenantId,
      table.nameKey
    ),
  ]
);
export const mindosUnits = mysqlTable(
  "mindos_units",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    nameKey: varchar("nameKey", { length: 128 }).notNull(),
    active: boolean("active").default(true).notNull(),
    revision: int("revision").default(1).notNull(),
  },
  table => [
    uniqueIndex("mindos_units_name_unique").on(table.tenantId, table.nameKey),
  ]
);
export const mindosServices = mysqlTable(
  "mindos_services",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    nameKey: varchar("nameKey", { length: 160 }).notNull(),
    durationMinutes: int("durationMinutes").notNull(),
    mode: mysqlEnum("mode", ["BOTH", "ONLINE", "IN_PERSON"])
      .default("BOTH")
      .notNull(),
    publicEnabled: boolean("publicEnabled").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    revision: int("revision").default(1).notNull(),
  },
  table => [
    uniqueIndex("mindos_services_name_unique").on(
      table.tenantId,
      table.nameKey
    ),
  ]
);
export const mindosAvailability = mysqlTable(
  "mindos_availability",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    professionalId: int("professionalId").notNull(),
    unitId: int("unitId").notNull(),
    weekday: int("weekday").notNull(),
    startMinute: int("startMinute").notNull(),
    endMinute: int("endMinute").notNull(),
    active: boolean("active").default(true).notNull(),
    revision: int("revision").default(1).notNull(),
  },
  table => [
    index("mindos_availability_professional_idx").on(
      table.tenantId,
      table.professionalId
    ),
  ]
);
export const mindosBookingLimits = mysqlTable(
  "mindos_booking_limits",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    keyHash: varchar("keyHash", { length: 64 }).notNull(),
    windowStart: timestamp("windowStart").notNull(),
    attempts: int("attempts").default(0).notNull(),
  },
  table => [
    uniqueIndex("mindos_booking_limits_key_unique").on(
      table.tenantId,
      table.keyHash
    ),
  ]
);

export const mindosPatientClinicians = mysqlTable(
  "mindos_patient_clinicians",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    patientId: int("patientId").notNull(),
    userId: int("userId").notNull(),
    active: boolean("active").default(true).notNull(),
    assignedByUserId: int("assignedByUserId").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    uniqueIndex("mindos_patient_clinicians_unique").on(
      t.tenantId,
      t.patientId,
      t.userId
    ),
  ]
);
export const mindosClinicalVersions = mysqlTable(
  "mindos_clinical_versions",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    recordId: int("recordId").notNull(),
    revision: int("revision").notNull(),
    snapshotJson: mediumtext("snapshotJson").notNull(),
    integrityHash: varchar("integrityHash", { length: 64 }).notNull(),
    previousHash: varchar("previousHash", { length: 64 }),
    actorUserId: int("actorUserId").notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    uniqueIndex("mindos_clinical_versions_unique").on(
      t.tenantId,
      t.recordId,
      t.revision
    ),
  ]
);
export const mindosConsentTemplates = mysqlTable(
  "mindos_consent_templates",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    version: int("version").notNull(),
    revision: int("revision").default(1).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: mediumtext("body").notNull(),
    bodyHash: varchar("bodyHash", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["DRAFT", "PUBLISHED", "RETIRED"])
      .default("DRAFT")
      .notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    publishedByUserId: int("publishedByUserId"),
    publishedAt: timestamp("publishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    uniqueIndex("mindos_consent_template_version_unique").on(
      t.tenantId,
      t.code,
      t.version
    ),
  ]
);
export const mindosConsentDecisions = mysqlTable(
  "mindos_consent_decisions",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    patientId: int("patientId").notNull(),
    templateId: int("templateId").notNull(),
    actorUserId: int("actorUserId").notNull(),
    decision: mysqlEnum("decision", [
      "ACCEPTED",
      "DECLINED",
      "WITHDRAWN",
    ]).notNull(),
    snapshotJson: mediumtext("snapshotJson").notNull(),
    bodyHash: varchar("bodyHash", { length: 64 }).notNull(),
    previousHash: varchar("previousHash", { length: 64 }),
    evidenceHash: varchar("evidenceHash", { length: 64 }).notNull(),
    decidedAt: timestamp("decidedAt", { fsp: 3 }).notNull(),
  },
  t => [
    index("mindos_consent_decisions_patient_idx").on(
      t.tenantId,
      t.patientId,
      t.templateId
    ),
  ]
);
export const mindosRescheduleRequests = mysqlTable(
  "mindos_reschedule_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    patientId: int("patientId").notNull(),
    appointmentId: int("appointmentId").notNull(),
    activeKey: varchar("activeKey", { length: 64 }),
    date: varchar("date", { length: 10 }).notNull(),
    time: varchar("time", { length: 8 }).notNull(),
    status: mysqlEnum("status", [
      "PENDING",
      "APPROVED",
      "DECLINED",
      "CANCELLED",
    ])
      .default("PENDING")
      .notNull(),
    revision: int("revision").default(1).notNull(),
    requestedByUserId: int("requestedByUserId").notNull(),
    resolvedByUserId: int("resolvedByUserId"),
    replacementAppointmentId: int("replacementAppointmentId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
  },
  t => [
    uniqueIndex("mindos_reschedule_requests_active_unique").on(
      t.tenantId,
      t.activeKey
    ),
  ]
);

export const financialOperations = mysqlTable(
  "financial_operations",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    requestId: varchar("requestId", { length: 36 }).notNull(),
    payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
    actorUserId: int("actorUserId").notNull(),
    action: varchar("action", { length: 48 }).notNull(),
    resultJson: text("resultJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [uniqueIndex("financial_operation_key").on(t.tenantId, t.requestId)]
);
export const financialInstallments = mysqlTable(
  "financial_installments",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    transactionId: int("transactionId").notNull(),
    number: int("number").notNull(),
    amount: int("amount").notNull(),
    paidAmount: int("paidAmount").default(0).notNull(),
    refundedAmount: int("refundedAmount").default(0).notNull(),
    dueDate: timestamp("dueDate").notNull(),
  },
  t => [
    uniqueIndex("financial_installment_number").on(t.transactionId, t.number),
    index("financial_installments_tenant").on(t.tenantId),
  ]
);
export const financialMovements = mysqlTable(
  "financial_movements",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    operationId: int("operationId").notNull(),
    transactionId: int("transactionId"),
    payableId: int("payableId"),
    cashSessionId: int("cashSessionId"),
    kind: mysqlEnum("kind", [
      "RECEIPT",
      "REVERSAL",
      "PAYABLE_PAYMENT",
      "CASH_IN",
      "CASH_OUT",
    ]).notNull(),
    amount: int("amount").notNull(),
    method: varchar("method", { length: 32 }).notNull(),
    reference: varchar("reference", { length: 160 }).notNull(),
    reason: text("reason"),
    actorUserId: int("actorUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    uniqueIndex("financial_movement_operation").on(t.operationId),
    index("financial_movements_tenant").on(t.tenantId),
  ]
);
