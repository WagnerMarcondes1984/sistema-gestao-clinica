import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { clinicParts } from "../shared/scheduling";
import { and, desc, sql, like, inArray, eq, gt, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  clinicalVerticals,
  transactions,
  transactionItems,
  accountsPayable,
  cashSessions,
  financialAuditLogs,
  type Transaction,
  type InsertTransaction,
  mindosTenants,
  mindosMemberships,
  mindosPatients,
  mindosAppointments,
  mindosClinicalRecords,
  mindosCmsVersions,
  mindosAccessAudits,
  mindosFinancialRules,
  mindosBookingRequests,
  mindosInstitutionalProfiles,
  mindosServiceAreas,
  mindosPortalDocuments,
  mindosReceptionEvents,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Verticais clínicas
 */
export async function listClinicalVerticals() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(clinicalVerticals);
}

export async function getClinicalVerticalByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clinicalVerticals).where(eq(clinicalVerticals.code, code)).limit(1);
  return result[0];
}

export type FinancialActor = {
  tenantId: number;
  userId: number;
  operatorName: string;
};

/**
 * Transações e Cobranças
 */
export async function listTransactions(actor: FinancialActor, filters: {
  verticalCode?: string;
  status?: string;
  paymentMethod?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(transactions.tenantId, actor.tenantId)];
  if (filters.verticalCode && filters.verticalCode !== 'ALL') {
    conditions.push(eq(transactions.verticalCode, filters.verticalCode));
  }
  if (filters.status && filters.status !== 'ALL') {
    conditions.push(eq(transactions.status, filters.status as any));
  }
  if (filters.paymentMethod && filters.paymentMethod !== 'ALL') {
    conditions.push(eq(transactions.paymentMethod, filters.paymentMethod as any));
  }
  if (filters.search && filters.search.trim() !== '') {
    const s = `%${filters.search.trim()}%`;
    conditions.push(sql`(${transactions.patientName} LIKE ${s} OR ${transactions.patientDocument} LIKE ${s} OR ${transactions.code} LIKE ${s} OR ${transactions.title} LIKE ${s})`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const txs = await db
    .select()
    .from(transactions)
    .where(whereClause)
    .orderBy(desc(transactions.createdAt))
    .limit(filters.limit || 50)
    .offset(filters.offset || 0);

  return txs;
}

export async function getTransactionByCode(actor: FinancialActor, code: string) {
  const db = await getDb();
  if (!db) return undefined;

  const txList = await db.select().from(transactions).where(and(eq(transactions.tenantId, actor.tenantId), eq(transactions.code, code))).limit(1);
  if (txList.length === 0) return undefined;
  const tx = txList[0];

  const items = await db.select().from(transactionItems).where(eq(transactionItems.transactionId, tx.id));
  const vertical = await getClinicalVerticalByCode(tx.verticalCode);

  return {
    ...tx,
    items,
    vertical,
  };
}

export async function createTransactionWithItems(actor: FinancialActor, data: {
  verticalCode: string;
  patientName: string;
  patientDocument: string;
  patientEmail?: string;
  patientPhone?: string;
  professionalName: string;
  unitName?: string;
  title: string;
  category: string;
  paymentMethod: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO" | "CASH" | "TRANSFER";
  status?: "PENDING" | "PAID" | "OVERDUE" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  subtotal: number;
  discount: number;
  addition: number;
  totalAmount: number;
  paidAmount?: number;
  installments: number;
  installmentValue?: number;
  dueDate: Date;
  paidAt?: Date;
  cardBrand?: string;
  cardLast4?: string;
  cashReceived?: number;
  cashChange?: number;
  operatorName?: string;
  notes?: string;
  items: Array<{
    name: string;
    type?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const code = `COB-2026-${randomSuffix}`;

  // Gerar dados específicos por método
  let pixQrCode: string | null = null;
  let pixCopiaECola: string | null = null;
  let pixExpiresAt: Date | null = null;
  let barcode: string | null = null;
  let digitableLine: string | null = null;
  let nsu: string | null = null;
  let authorizationCode: string | null = null;
  let invoiceNumber: string | null = null;
  let invoiceStatus: "NOT_ISSUED" | "ISSUED" | "CANCELLED" | "ERROR" = "NOT_ISSUED";
  let invoiceKey: string | null = null;
  let invoiceIssuedAt: Date | null = null;

  const isPaid = data.status === "PAID" || data.paymentMethod === "CASH";
  const finalStatus = isPaid ? "PAID" : (data.status || "PENDING");
  const finalPaidAmount = isPaid ? data.totalAmount : (data.paidAmount || 0);
  const finalPaidAt = isPaid ? (data.paidAt || new Date()) : null;

  if (data.paymentMethod === "PIX") {
    const formattedTotal = (data.totalAmount / 100).toFixed(2);
    pixQrCode = `00020126580014br.gov.bcb.pix0136pix-${data.verticalCode.toLowerCase()}@fluxa.med.br520400005303986540${formattedTotal.length < 10 ? '0' + formattedTotal.length : formattedTotal.length}${formattedTotal}5802BR5920Fluxa Clinical Core6009SAO PAULO62140510${code}6304`;
    pixCopiaECola = `pix-${data.verticalCode.toLowerCase()}@fluxa.med.br/qr/${code}`;
    pixExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min expiração
  } else if (data.paymentMethod === "BOLETO") {
    barcode = `23793${Math.floor(100000000000 + Math.random() * 900000000000)}${data.totalAmount.toString().padStart(10, '0')}`;
    digitableLine = `23793.${Math.floor(10000 + Math.random() * 90000)} ${Math.floor(10000 + Math.random() * 90000)}.${Math.floor(100000 + Math.random() * 900000)} ${Math.floor(10000 + Math.random() * 90000)}.${Math.floor(100000 + Math.random() * 900000)} 1 ${Math.floor(10000000000000 + Math.random() * 90000000000000)}`;
  } else if (data.paymentMethod === "CREDIT_CARD" || data.paymentMethod === "DEBIT_CARD") {
    nsu = `${Math.floor(10000000 + Math.random() * 90000000)}`;
    authorizationCode = `AUTH${Math.floor(1000 + Math.random() * 9000)}`;
  }

  if (isPaid) {
    invoiceNumber = `NFS-2026/0${Math.floor(1000 + Math.random() * 9000)}`;
    invoiceStatus = "ISSUED";
    invoiceKey = `NFS-SP-3550308-2026-09-${randomSuffix}`;
    invoiceIssuedAt = new Date();
  }

  const [result] = await db.insert(transactions).values({
    tenantId: actor.tenantId,
    code,
    verticalCode: data.verticalCode,
    patientName: data.patientName,
    patientDocument: data.patientDocument,
    patientEmail: data.patientEmail,
    patientPhone: data.patientPhone,
    professionalName: data.professionalName,
    unitName: data.unitName || "Unidade Central",
    title: data.title,
    type: "RECEITA",
    category: data.category,
    paymentMethod: data.paymentMethod,
    status: finalStatus,
    subtotal: data.subtotal,
    discount: data.discount,
    addition: data.addition,
    totalAmount: data.totalAmount,
    paidAmount: finalPaidAmount,
    installments: data.installments || 1,
    installmentValue: data.installmentValue || Math.round(data.totalAmount / (data.installments || 1)),
    dueDate: data.dueDate,
    paidAt: finalPaidAt,
    pixQrCode,
    pixCopiaECola,
    pixExpiresAt,
    barcode,
    digitableLine,
    cardBrand: data.cardBrand,
    cardLast4: data.cardLast4,
    nsu,
    authorizationCode,
    cashReceived: data.cashReceived,
    cashChange: data.cashChange,
    invoiceNumber,
    invoiceStatus,
    invoiceKey,
    invoiceIssuedAt,
    operatorName: actor.operatorName,
    notes: data.notes,
  });

  const transactionId = (result as any).insertId;

  if (data.items && data.items.length > 0) {
    for (const it of data.items) {
      await db.insert(transactionItems).values({
        transactionId,
        name: it.name,
        type: it.type || "PROCEDURE",
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal,
      });
    }
  }

  // Auditoria
  await db.insert(financialAuditLogs).values({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    verticalCode: data.verticalCode,
    transactionCode: code,
    action: isPaid ? "CONFIRM_PAYMENT" : "CREATE_CHARGE",
    operator: actor.operatorName,
    details: `Cobrança ${code} criada no valor de R$ ${(data.totalAmount / 100).toFixed(2)} via ${data.paymentMethod}. Status: ${finalStatus}.`,
  });

  return await getTransactionByCode(actor, code);
}

export async function confirmTransactionPayment(actor: FinancialActor, code: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const tx = await getTransactionByCode(actor, code);
  if (!tx) throw new Error("Transação não encontrada");
  if (tx.status === "PAID") return tx;

  const now = new Date();
  const randomInvoice = `NFS-2026/0${Math.floor(1000 + Math.random() * 9000)}`;
  const randomKey = `NFS-SP-3550308-2026-09-${code.replace(/\D/g, '') || Math.floor(1000 + Math.random() * 9000)}`;

  await db
    .update(transactions)
    .set({
      status: "PAID",
      paidAmount: tx.totalAmount,
      paidAt: now,
      invoiceNumber: tx.invoiceNumber || randomInvoice,
      invoiceStatus: "ISSUED",
      invoiceKey: tx.invoiceKey || randomKey,
      invoiceIssuedAt: now,
      nsu: tx.nsu || `${Math.floor(10000000 + Math.random() * 90000000)}`,
      authorizationCode: tx.authorizationCode || `AUTH${Math.floor(1000 + Math.random() * 9000)}`,
    })
    .where(and(eq(transactions.tenantId, actor.tenantId), eq(transactions.code, code)));

  await db.insert(financialAuditLogs).values({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    verticalCode: tx.verticalCode,
    transactionCode: code,
    action: "CONFIRM_PAYMENT",
    operator: actor.operatorName,
    details: `Pagamento de R$ ${(tx.totalAmount / 100).toFixed(2)} confirmado para a cobrança ${code}. Nota fiscal ${randomInvoice} emitida automaticamente.`,
  });

  return await getTransactionByCode(actor, code);
}

export async function refundTransactionPayment(actor: FinancialActor, code: string, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const tx = await getTransactionByCode(actor, code);
  if (!tx) throw new Error("Transação não encontrada");

  await db
    .update(transactions)
    .set({
      status: "REFUNDED",
      invoiceStatus: "CANCELLED",
      notes: sql`CONCAT(COALESCE(${transactions.notes}, ''), '\n[ESTORNO]: ', ${reason})`,
    })
    .where(and(eq(transactions.tenantId, actor.tenantId), eq(transactions.code, code)));

  await db.insert(financialAuditLogs).values({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    verticalCode: tx.verticalCode,
    transactionCode: code,
    action: "REFUND",
    operator: actor.operatorName,
    details: `Estorno realizado para a cobrança ${code}. Motivo: ${reason}. Nota fiscal cancelada.`,
  });

  return await getTransactionByCode(actor, code);
}

/**
 * Métricas Consolidadas do Dashboard
 */
export async function getDashboardMetrics(actor: FinancialActor, verticalCode?: string) {
  const db = await getDb();
  if (!db) {
    return {
      totalReceived: 0,
      totalReceivable: 0,
      totalOverdue: 0,
      totalPayable: 0,
      paidPayable: 0,
      cashBalance: 0,
      transactionCount: 0,
      methodDistribution: [],
      statusDistribution: [],
      recentTransactions: [],
    };
  }

  const whereTx = and(eq(transactions.tenantId, actor.tenantId), verticalCode && verticalCode !== 'ALL' ? eq(transactions.verticalCode, verticalCode) : undefined);
  const allTxs = await db.select().from(transactions).where(whereTx);

  let totalReceived = 0;
  let totalReceivable = 0;
  let totalOverdue = 0;
  let totalFailed = 0;
  let totalRefunded = 0;

  const methodCounts: Record<string, { count: number; total: number }> = {
    PIX: { count: 0, total: 0 },
    CREDIT_CARD: { count: 0, total: 0 },
    DEBIT_CARD: { count: 0, total: 0 },
    BOLETO: { count: 0, total: 0 },
    CASH: { count: 0, total: 0 },
  };

  const statusCounts: Record<string, { count: number; total: number }> = {
    PAID: { count: 0, total: 0 },
    PENDING: { count: 0, total: 0 },
    OVERDUE: { count: 0, total: 0 },
    FAILED: { count: 0, total: 0 },
    REFUNDED: { count: 0, total: 0 },
  };

  for (const t of allTxs) {
    if (t.status === "PAID") {
      totalReceived += t.paidAmount || t.totalAmount;
    } else if (t.status === "PENDING") {
      totalReceivable += t.totalAmount;
    } else if (t.status === "OVERDUE") {
      totalOverdue += t.totalAmount;
    } else if (t.status === "FAILED") {
      totalFailed += t.totalAmount;
    } else if (t.status === "REFUNDED") {
      totalRefunded += t.totalAmount;
    }

    if (methodCounts[t.paymentMethod]) {
      methodCounts[t.paymentMethod].count += 1;
      if (t.status === "PAID") {
        methodCounts[t.paymentMethod].total += t.paidAmount || t.totalAmount;
      }
    }

    if (statusCounts[t.status]) {
      statusCounts[t.status].count += 1;
      statusCounts[t.status].total += t.totalAmount;
    }
  }

  // Contas a pagar
  const wherePay = and(eq(accountsPayable.tenantId, actor.tenantId), verticalCode && verticalCode !== 'ALL' ? eq(accountsPayable.verticalCode, verticalCode) : undefined);
  const allPayables = await db.select().from(accountsPayable).where(wherePay);

  let totalPayable = 0;
  let paidPayable = 0;
  for (const p of allPayables) {
    if (p.status === "PENDING" || p.status === "OVERDUE") {
      totalPayable += p.amount;
    } else if (p.status === "PAID") {
      paidPayable += p.amount;
    }
  }

  // Caixa
  const whereCash = and(eq(cashSessions.tenantId, actor.tenantId), verticalCode && verticalCode !== 'ALL' ? eq(cashSessions.verticalCode, verticalCode) : undefined);
  const activeCash = await db.select().from(cashSessions).where(whereCash).orderBy(desc(cashSessions.openedAt)).limit(1);
  const cashBalance = activeCash.length > 0 ? activeCash[0].expectedBalance : 0;

  const recentTransactions = await listTransactions(actor, {
    verticalCode,
    limit: 6,
  });

  return {
    totalReceived,
    totalReceivable,
    totalOverdue,
    totalPayable,
    paidPayable,
    totalFailed,
    totalRefunded,
    cashBalance,
    netBalance: totalReceived - paidPayable,
    transactionCount: allTxs.length,
    methodDistribution: Object.entries(methodCounts).map(([method, data]) => ({
      method,
      count: data.count,
      total: data.total,
    })),
    statusDistribution: Object.entries(statusCounts).map(([status, data]) => ({
      status,
      count: data.count,
      total: data.total,
    })),
    recentTransactions,
  };
}

/**
 * Contas a Pagar
 */
export async function listAccountsPayable(actor: FinancialActor, verticalCode?: string, status?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(accountsPayable.tenantId, actor.tenantId)];
  if (verticalCode && verticalCode !== 'ALL') {
    conditions.push(eq(accountsPayable.verticalCode, verticalCode));
  }
  if (status && status !== 'ALL') {
    conditions.push(eq(accountsPayable.status, status as any));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  return await db.select().from(accountsPayable).where(whereClause).orderBy(desc(accountsPayable.dueDate));
}

export async function payAccountPayable(actor: FinancialActor, code: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const [existing] = await db.select().from(accountsPayable).where(and(eq(accountsPayable.tenantId, actor.tenantId), eq(accountsPayable.code, code))).limit(1);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada nesta clínica" });

  await db
    .update(accountsPayable)
    .set({
      status: "PAID",
      paidAt: new Date(),
    })
    .where(and(eq(accountsPayable.tenantId, actor.tenantId), eq(accountsPayable.code, code)));

  return true;
}

/**
 * Caixa
 */
export async function getCurrentCashSession(actor: FinancialActor, verticalCode: string) {
  const db = await getDb();
  if (!db) return undefined;

  const sessions = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.tenantId, actor.tenantId), eq(cashSessions.verticalCode, verticalCode), eq(cashSessions.status, "OPEN")))
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);

  return sessions[0];
}

export async function listCashSessions(actor: FinancialActor, verticalCode?: string) {
  const db = await getDb();
  if (!db) return [];

  const whereClause = and(eq(cashSessions.tenantId, actor.tenantId), verticalCode && verticalCode !== 'ALL' ? eq(cashSessions.verticalCode, verticalCode) : undefined);
  return await db.select().from(cashSessions).where(whereClause).orderBy(desc(cashSessions.openedAt));
}

export async function closeCashSession(actor: FinancialActor, sessionId: number, closingBalance: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const existing = await db.select().from(cashSessions).where(and(eq(cashSessions.tenantId, actor.tenantId), eq(cashSessions.id, sessionId))).limit(1);
  if (existing.length === 0) throw new Error("Sessão de caixa não encontrada");

  const diff = closingBalance - existing[0].expectedBalance;

  await db
    .update(cashSessions)
    .set({
      status: "CLOSED",
      closingBalance,
      difference: diff,
      closedAt: new Date(),
      closingNotes: notes,
    })
    .where(and(eq(cashSessions.tenantId, actor.tenantId), eq(cashSessions.id, sessionId)));

  return true;
}

/**
 * Logs de Auditoria
 */
export async function listAuditLogs(actor: FinancialActor, verticalCode?: string, limit: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const whereClause = and(eq(financialAuditLogs.tenantId, actor.tenantId), verticalCode && verticalCode !== 'ALL' ? eq(financialAuditLogs.verticalCode, verticalCode) : undefined);
  return await db.select().from(financialAuditLogs).where(whereClause).orderBy(desc(financialAuditLogs.createdAt)).limit(limit);
}


/**
 * MindOS: tenant e autorização.
 * O tenant é sempre derivado da associação do usuário autenticado; nunca recebe tenantId do cliente.
 */
async function getMindosMembership(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const rows = await db
    .select()
    .from(mindosMemberships)
    .where(and(eq(mindosMemberships.userId, userId), eq(mindosMemberships.active, true)))
    .limit(2);
  if (rows.length > 1) throw new TRPCError({ code: "CONFLICT", message: "Seleção explícita de clínica necessária" });
  return rows[0];
}

export async function ensureMindosTenantForUser(userId: number, userRole: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const membership = await getMindosMembership(userId);
  if (membership) {
    const tenantRows = await db.select().from(mindosTenants).where(eq(mindosTenants.id, membership.tenantId)).limit(1);
    if (tenantRows[0]?.status === "ACTIVE") return { tenant: tenantRows[0], membership };
    throw new TRPCError({ code: "FORBIDDEN", message: "Clínica indisponível" });
  }

  throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem associação ativa a uma clínica" });
}

export function hasMindosPermission(membership: { role: string; permissionsJson: string }, permission: string) {
  let permissions: string[] = [];
  try { permissions = JSON.parse(membership.permissionsJson || "[]") as string[]; } catch { permissions = []; }
  if (!Array.isArray(permissions) || !permissions.every(value => typeof value === "string")) permissions = [];
  const elevated = ["OWNER", "CLINIC_ADMIN", "SUPER_ADMIN"].includes(membership.role);
  return elevated || permissions.includes("ALL") || permissions.includes(permission);
}

export async function assertMindosPermission(userId: number, userRole: string, permission: string) {
  const { tenant, membership } = await ensureMindosTenantForUser(userId, userRole);
  if (!hasMindosPermission(membership, permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Permissão insuficiente: ${permission}` });
  }
  return { tenant, membership };
}

export async function getMindosDashboardData(userId: number, userRole: string) {
  const { tenant, membership } = await assertMindosPermission(userId, userRole, "VIEW_PATIENT_BASIC");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const patients = await db.select().from(mindosPatients).where(eq(mindosPatients.tenantId, tenant.id));
  const appointments = await db.select().from(mindosAppointments).where(eq(mindosAppointments.tenantId, tenant.id)).orderBy(mindosAppointments.startsAt);
  const authorizedAppointments = hasMindosPermission(membership,"MANAGE_APPOINTMENTS") ? appointments : [];
  const today = clinicParts(new Date(),tenant.timezone).date;
  const daySessions = authorizedAppointments.filter(a => clinicParts(a.startsAt,tenant.timezone).date === today);
  return {
    tenant,
    metrics: {
      sessionsToday: daySessions.filter(a=>!["CANCELLED","RESCHEDULED"].includes(a.status)).length,
      confirmed: daySessions.filter((a) => a.status === "CONFIRMED").length,
      waiting: daySessions.filter((a) => a.status === "WAITING").length,
      activePatients: patients.filter((p) => p.administrativeStatus === "ACTIVE").length,
      newPatients: patients.filter((p) => p.administrativeStatus === "LEAD").length,
      futureSessions: authorizedAppointments.filter((a) => new Date(a.startsAt) >= new Date() && !["CANCELLED","RESCHEDULED"].includes(a.status)).length,
    },
    appointments: authorizedAppointments,
    patients,
  };
}

export async function listMindosAppointments(userId: number, userRole: string) {
  const { tenant } = await assertMindosPermission(userId, userRole, "MANAGE_APPOINTMENTS");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const appointments = await db.select().from(mindosAppointments).where(eq(mindosAppointments.tenantId, tenant.id)).orderBy(mindosAppointments.startsAt);
  const patientIds = Array.from(new Set(appointments.map((item) => item.patientId)));
  const patients = patientIds.length > 0 ? await db.select().from(mindosPatients).where(and(eq(mindosPatients.tenantId, tenant.id), inArray(mindosPatients.id, patientIds))) : [];
  const patientMap = new Map(patients.map((patient) => [patient.id, patient]));
  return appointments.map((appointment) => ({ ...appointment, patient: patientMap.get(appointment.patientId) || null }));
}

export async function createMindosAppointment(userId: number, userRole: string, input: {
  patientId: number;
  professionalName: string;
  unitName: string;
  serviceType: string;
  mode: "IN_PERSON" | "ONLINE";
  status?: "SCHEDULED" | "CONFIRMED";
  startsAt: Date;
  endsAt: Date;
  recurrenceId?: string;
}) {
  const { tenant } = await assertMindosPermission(userId, userRole, "MANAGE_APPOINTMENTS");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [patient] = await db.select().from(mindosPatients).where(and(eq(mindosPatients.tenantId, tenant.id),eq(mindosPatients.id,input.patientId)));
  if (!patient) throw new TRPCError({code:"NOT_FOUND",message:"Paciente não encontrado nesta clínica"});
  if (["INACTIVE","CLOSED"].includes(patient.administrativeStatus)) throw new TRPCError({code:"BAD_REQUEST",message:"Reative o paciente antes de agendar"});
  throw new TRPCError({code:"PRECONDITION_FAILED",message:"Use a nova agenda com profissional, unidade e serviço cadastrados"});
}

export async function getMindosPatient360(userId: number, userRole: string, patientId: number) {
  const { tenant, membership } = await assertMindosPermission(userId, userRole, "VIEW_PATIENT_BASIC");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const patientRows = await db.select().from(mindosPatients).where(and(eq(mindosPatients.id, patientId), eq(mindosPatients.tenantId, tenant.id))).limit(1);
  if (!patientRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Paciente não encontrado nesta clínica" });
  await db.insert(mindosAccessAudits).values({ tenantId: tenant.id, actorUserId: userId, subjectType: "PATIENT", subjectId: patientId, dataLayer: "ADMINISTRATIVE", action: "VIEW_PATIENT_360", reason: "Consulta operacional" });
  const appointments = await db.select().from(mindosAppointments).where(and(eq(mindosAppointments.tenantId, tenant.id), eq(mindosAppointments.patientId, patientId))).orderBy(desc(mindosAppointments.startsAt));
  const { portalUserId, ...patient } = patientRows[0];
  return { patient, appointments: hasMindosPermission(membership, "MANAGE_APPOINTMENTS") ? appointments : [] };
}

export async function listMindosCmsVersions(userId: number, userRole: string) {
  const { tenant } = await assertMindosPermission(userId, userRole, "MANAGE_PUBLIC_SITE");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  return await db.select().from(mindosCmsVersions).where(eq(mindosCmsVersions.tenantId, tenant.id)).orderBy(desc(mindosCmsVersions.versionNumber));
}

export async function saveMindosCmsDraft(userId: number, userRole: string, contentJson: string, changeSummary?: string) {
  const { tenant } = await assertMindosPermission(userId, userRole, "MANAGE_PUBLIC_SITE");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const current = await db.select().from(mindosCmsVersions).where(eq(mindosCmsVersions.tenantId, tenant.id)).orderBy(desc(mindosCmsVersions.versionNumber)).limit(1);
  const versionNumber = (current[0]?.versionNumber || 0) + 1;
  const [result] = await db.insert(mindosCmsVersions).values({ tenantId: tenant.id, versionNumber, status: "DRAFT", contentJson, changeSummary, createdByUserId: userId });
  return await db.select().from(mindosCmsVersions).where(eq(mindosCmsVersions.id, Number((result as any).insertId))).limit(1);
}

export async function publishMindosCmsVersion(userId: number, userRole: string, versionId: number) {
  const { tenant } = await assertMindosPermission(userId, userRole, "MANAGE_PUBLIC_SITE");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const target = await db.select().from(mindosCmsVersions).where(and(eq(mindosCmsVersions.id, versionId), eq(mindosCmsVersions.tenantId, tenant.id))).limit(1);
  if (!target[0]) throw new Error("Versão CMS não encontrada no tenant atual");
  await db.update(mindosCmsVersions).set({ status: "ARCHIVED" }).where(and(eq(mindosCmsVersions.tenantId, tenant.id), eq(mindosCmsVersions.status, "PUBLISHED")));
  await db.update(mindosCmsVersions).set({ status: "PUBLISHED", publishedAt: new Date(), approvedByUserId: userId }).where(eq(mindosCmsVersions.id, versionId));
  await db.insert(mindosAccessAudits).values({ tenantId: tenant.id, actorUserId: userId, subjectType: "CMS_VERSION", subjectId: versionId, dataLayer: "PUBLIC", action: "PUBLISH_CMS", reason: "Publicação aprovada" });
  return true;
}

export async function listMindosFinancialRules(userId: number, userRole: string) {
  const { tenant } = await assertMindosPermission(userId, userRole, "VIEW_FINANCIAL");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  return await db.select().from(mindosFinancialRules).where(and(eq(mindosFinancialRules.tenantId, tenant.id), eq(mindosFinancialRules.active, true)));
}


export async function approveMindosCmsVersion(userId: number, userRole: string, versionId: number) {
  const { tenant } = await assertMindosPermission(userId, userRole, "MANAGE_PUBLIC_SITE");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const target = await db.select().from(mindosCmsVersions).where(and(eq(mindosCmsVersions.id, versionId), eq(mindosCmsVersions.tenantId, tenant.id))).limit(1);
  if (!target[0]) throw new Error("Versão CMS não encontrada no tenant atual");
  await db.update(mindosCmsVersions).set({ status: "APPROVED", approvedByUserId: userId }).where(eq(mindosCmsVersions.id, versionId));
  await db.insert(mindosAccessAudits).values({ tenantId: tenant.id, actorUserId: userId, subjectType: "CMS_VERSION", subjectId: versionId, dataLayer: "PUBLIC", action: "APPROVE_CMS", reason: "Aprovação de conteúdo institucional" });
  return true;
}

export async function rollbackMindosCmsVersion(userId: number, userRole: string, versionId: number) {
  const { tenant } = await assertMindosPermission(userId, userRole, "MANAGE_PUBLIC_SITE");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const target = await db.select().from(mindosCmsVersions).where(and(eq(mindosCmsVersions.id, versionId), eq(mindosCmsVersions.tenantId, tenant.id))).limit(1);
  if (!target[0]) throw new Error("Versão CMS não encontrada no tenant atual");
  await db.update(mindosCmsVersions).set({ status: "ARCHIVED" }).where(and(eq(mindosCmsVersions.tenantId, tenant.id), eq(mindosCmsVersions.status, "PUBLISHED")));
  await db.update(mindosCmsVersions).set({ status: "PUBLISHED", publishedAt: new Date(), approvedByUserId: userId }).where(eq(mindosCmsVersions.id, versionId));
  await db.insert(mindosAccessAudits).values({ tenantId: tenant.id, actorUserId: userId, subjectType: "CMS_VERSION", subjectId: versionId, dataLayer: "PUBLIC", action: "ROLLBACK_CMS", reason: `Rollback para versão ${target[0].versionNumber}` });
  return true;
}


export async function createMindosRecurringAppointments(userId: number, userRole: string, input: {
  patientId: number;
  professionalName: string;
  unitName: string;
  serviceType: string;
  mode: "IN_PERSON" | "ONLINE";
  startsAt: Date;
  endsAt: Date;
  count: number;
  intervalWeeks: number;
}) {
  if (input.count < 1 || input.count > 24) throw new Error("A série deve ter entre 1 e 24 ocorrências");
  if (input.intervalWeeks < 1 || input.intervalWeeks > 8) throw new Error("O intervalo deve estar entre 1 e 8 semanas");
  const recurrenceId = `rec-${Date.now()}-${userId}`;
  const created = [];
  for (let index = 0; index < input.count; index += 1) {
    const startsAt = new Date(input.startsAt.getTime() + index * input.intervalWeeks * 7 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(input.endsAt.getTime() + index * input.intervalWeeks * 7 * 24 * 60 * 60 * 1000);
    created.push(await createMindosAppointment(userId, userRole, { ...input, startsAt, endsAt, recurrenceId }));
  }
  return { recurrenceId, appointments: created };
}


async function careUser(userId:number){const db=await getDb();if(!db)throw new Error("Banco indisponível");const[user]=await db.select().from(users).where(eq(users.id,userId));if(!user)throw new TRPCError({code:"UNAUTHORIZED",message:"Conta não encontrada"});return user;}
export async function listMindosClinicalRecords(userId:number,_role:string,patientId:number){return (await import("./clinical")).listClinical(await careUser(userId),patientId);}
export async function createMindosClinicalRecord(userId:number,_role:string,input:{patientId:number;appointmentId?:number;recordType:"ANAMNESIS"|"EVOLUTION"|"RESTRICTED_NOTE"|"GOAL"|"CARE_PLAN";content:string}){return(await import("./clinical")).createClinical(await careUser(userId),input);}
export async function finalizeMindosClinicalRecord(userId:number,_role:string,recordId:number,revision:number){await(await import("./clinical")).updateClinical(await careUser(userId),{recordId,revision,finalize:true});return true;}


async function getMindosPublicTenant() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const slug = process.env.PUBLIC_TENANT_SLUG;
  if (!slug) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Clínica pública não configurada" });
  const rows = await db.select().from(mindosTenants).where(and(eq(mindosTenants.status, "ACTIVE"), eq(mindosTenants.slug, slug))).limit(1);
  if (!rows[0]) throw new Error("Nenhum tenant MindOS ativo encontrado");
  return { db, tenant: rows[0] };
}

export async function listMindosBookingRequests(userId: number, userRole: string) {
  const { tenant } = await assertMindosPermission(userId, userRole, "VIEW_ADMINISTRATIVE");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  return db.select().from(mindosBookingRequests).where(eq(mindosBookingRequests.tenantId, tenant.id)).orderBy(desc(mindosBookingRequests.createdAt));
}

export async function listMindosPortalData(userId:number,_role:string){return (await import("./portal-care")).portalData(await careUser(userId));}

export async function createMindosReceptionEvent(userId: number, userRole: string, input: { patientId: number; eventType: "CHECK_IN" | "MESSAGE_SENT" | "CALL_LOGGED" | "PROFILE_REVIEWED"; messageTemplate?: string; appointmentId?: number }) {
  const { tenant } = await assertMindosPermission(userId, userRole, "VIEW_ADMINISTRATIVE");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const [patient] = await db.select().from(mindosPatients).where(and(eq(mindosPatients.id, input.patientId), eq(mindosPatients.tenantId, tenant.id))).limit(1);
  if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Paciente não encontrado nesta clínica" });
  if (input.eventType === "CHECK_IN") throw new TRPCError({code:"PRECONDITION_FAILED",message:"Faça check-in na sessão selecionada na nova recepção"});
  if (input.eventType === "MESSAGE_SENT") throw new TRPCError({code:"PRECONDITION_FAILED",message:"Envio de mensagens depende de provedor na etapa 6"});
  if (input.appointmentId) {
    const [session] = await db.select().from(mindosAppointments).where(and(eq(mindosAppointments.tenantId,tenant.id),eq(mindosAppointments.id,input.appointmentId),eq(mindosAppointments.patientId,input.patientId)));
    if (!session) throw new TRPCError({code:"NOT_FOUND",message:"Sessão não encontrada para este paciente"});
  }
  const [result] = await db.insert(mindosReceptionEvents).values({ tenantId: tenant.id, createdByUserId: userId, ...input });
  await db.insert(mindosAccessAudits).values({ tenantId: tenant.id, actorUserId: userId, subjectType: "PATIENT", subjectId: input.patientId, dataLayer: "ADMINISTRATIVE", action: input.eventType, reason: "Evento operacional de recepção" });
  return Number((result as any).insertId);
}

export async function getMindosInstitutionalProfile(userId: number, userRole: string) {
  const { tenant } = await assertMindosPermission(userId, userRole, "VIEW_ADMINISTRATIVE");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  return db.select().from(mindosInstitutionalProfiles).where(eq(mindosInstitutionalProfiles.tenantId, tenant.id)).limit(1);
}

export async function saveMindosInstitutionalProfile(userId: number, userRole: string, input: { title: string; metaDescription: string; city?: string; faqJson: string; llmsTxt: string }) {
  const { tenant } = await assertMindosPermission(userId, userRole, "MANAGE_PUBLIC_SITE");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  await db.insert(mindosInstitutionalProfiles).values({ tenantId: tenant.id, updatedByUserId: userId, ...input }).onDuplicateKeyUpdate({ set: { ...input, updatedByUserId: userId } });
  await db.insert(mindosAccessAudits).values({ tenantId: tenant.id, actorUserId: userId, subjectType: "INSTITUTIONAL_PROFILE", dataLayer: "PUBLIC", action: "UPDATE_INSTITUTIONAL_PROFILE", reason: "Atualização SEO/GEO/AEO/LLM" });
  return true;
}

export async function listMindosServiceAreas() {
  const { db, tenant } = await getMindosPublicTenant();
  return db.select().from(mindosServiceAreas).where(and(eq(mindosServiceAreas.tenantId, tenant.id), eq(mindosServiceAreas.active, true))).orderBy(mindosServiceAreas.sortOrder);
}


export async function listMindosReceptionQueue(userId: number, userRole: string) {
  const { tenant } = await assertMindosPermission(userId, userRole, "VIEW_ADMINISTRATIVE");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const [appointments, patients, events] = await Promise.all([
    db.select().from(mindosAppointments).where(eq(mindosAppointments.tenantId, tenant.id)).orderBy(mindosAppointments.startsAt),
    db.select().from(mindosPatients).where(eq(mindosPatients.tenantId, tenant.id)),
    db.select().from(mindosReceptionEvents).where(eq(mindosReceptionEvents.tenantId, tenant.id)).orderBy(desc(mindosReceptionEvents.createdAt)),
  ]);
  const patientMap = new Map(patients.map((patient) => [patient.id, patient]));
  const eventMap = new Map<number, typeof events[number]>();
  for (const event of events) if (!eventMap.has(event.patientId)) eventMap.set(event.patientId, event);
  return appointments.map((appointment) => {
    const patient = patientMap.get(appointment.patientId);
    const event = eventMap.get(appointment.patientId);
    return {
      id: appointment.patientId,
      appointmentId: appointment.id,
      name: patient?.preferredName || patient?.fullName || "Paciente",
      time: new Date(appointment.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      status: appointment.status,
      channel: patient?.preferredChannel || "WHATSAPP_DISCREET",
      lastEvent: event?.eventType || null,
    };
  });
}
