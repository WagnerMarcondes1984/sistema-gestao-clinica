// Conferência somente de leitura, exclusiva dos bancos locais de desenvolvimento.
import "dotenv/config";
import mysql from "mysql2/promise";
import { assertDemoSeedAllowed } from "../server/seed-safety.mjs";

let db;
try {
  assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
  if (process.env.APP_ENV === "production")
    throw new Error("Conferência exclusiva do ambiente local");
  db = await mysql.createConnection(process.env.DATABASE_URL);
  // Um snapshot mantém os totais coerentes entre as consultas. Nenhuma correção
  // ou associação de legado é inferida por esta ferramenta.
  await db.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
  const references = [
    [
      "salesLead",
      "mindos_sales_opportunities",
      "mindos_crm_leads",
      "p.id=a.leadId",
      "TRUE",
    ],
    [
      "salesProposal",
      "mindos_sales_proposals",
      "mindos_sales_opportunities",
      "p.id=a.opportunityId",
      "TRUE",
    ],
    [
      "salesPreference",
      "mindos_sales_preferences",
      "mindos_crm_leads",
      "p.id=a.leadId",
      "TRUE",
    ],
    [
      "salesRunOpportunity",
      "mindos_sales_runs",
      "mindos_sales_opportunities",
      "p.id=a.opportunityId",
      "TRUE",
    ],
    [
      "salesRunRule",
      "mindos_sales_runs",
      "mindos_sales_rules",
      "p.id=a.ruleId",
      "TRUE",
    ],
    [
      "salesRunTask",
      "mindos_sales_runs",
      "mindos_crm_tasks",
      "p.id=a.taskId",
      "TRUE",
    ],
    [
      "salesEvent",
      "mindos_sales_events",
      "mindos_sales_opportunities",
      "p.id=a.opportunityId",
      "TRUE",
    ],
    [
      "appointmentsPatient",
      "mindos_appointments",
      "mindos_patients",
      "p.id=a.patientId",
      "TRUE",
    ],
    [
      "appointmentsProfessional",
      "mindos_appointments",
      "mindos_professionals",
      "p.id=a.professionalId",
      "a.professionalId IS NOT NULL",
    ],
    [
      "appointmentsUnit",
      "mindos_appointments",
      "mindos_units",
      "p.id=a.unitId",
      "a.unitId IS NOT NULL",
    ],
    [
      "appointmentsService",
      "mindos_appointments",
      "mindos_services",
      "p.id=a.serviceId",
      "a.serviceId IS NOT NULL",
    ],
    [
      "clinicalPatient",
      "mindos_clinical_records",
      "mindos_patients",
      "p.id=a.patientId",
      "TRUE",
    ],
    [
      "clinicalSession",
      "mindos_clinical_records",
      "mindos_appointments",
      "p.id=a.appointmentId AND p.patientId=a.patientId",
      "a.appointmentId IS NOT NULL",
    ],
    [
      "documentsPatient",
      "mindos_portal_documents",
      "mindos_patients",
      "p.id=a.patientId",
      "TRUE",
    ],
    [
      "chargesPatient",
      "transactions",
      "mindos_patients",
      "p.id=a.patientId",
      "a.patientId IS NOT NULL",
    ],
    [
      "chargesSession",
      "transactions",
      "mindos_appointments",
      "p.id=a.appointmentId AND p.patientId=a.patientId",
      "a.appointmentId IS NOT NULL",
    ],
  ];
  const counts = {};
  for (const [name, source, target, join, applicable] of references) {
    const [[row]] = await db.query(
      `SELECT COUNT(*) n FROM ${source} a LEFT JOIN ${target} p ON ${join} AND p.tenantId=a.tenantId WHERE (${applicable}) AND p.id IS NULL`
    );
    counts[name] = Number(row.n);
  }
  const legacy = {};
  for (const table of ["transactions", "accounts_payable", "cash_sessions"]) {
    const [[row]] = await db.query(
      `SELECT COUNT(*) n FROM ${table} WHERE tenantId IS NULL`
    );
    legacy[table] = Number(row.n);
  }
  await db.rollback();
  const valid = Object.values(counts).every(n => n === 0);
  const assigned = Object.values(legacy).every(n => n === 0);
  console.log(
    JSON.stringify({
      scope: "LOCAL_REFERENCE_AUDIT",
      result: valid && assigned ? "PASS" : "REVIEW_REQUIRED",
      incompatibleReferences: counts,
      financialWithoutClinic: legacy,
    })
  );
  if (!valid || !assigned) process.exitCode = 1;
} catch {
  console.error(
    "Conferência local não concluída; conexão e dados não foram registrados."
  );
  process.exitCode = 1;
} finally {
  await db?.end().catch(() => {});
}
