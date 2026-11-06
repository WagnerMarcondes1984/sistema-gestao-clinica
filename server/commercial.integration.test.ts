import { randomUUID } from "node:crypto";
import { describe, beforeAll, afterAll, it, expect, vi } from "vitest";
import mysql, { type Connection, type ResultSetHeader } from "mysql2/promise";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { mindosAccessAudits } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { clinicParts } from "../shared/scheduling";
import { assertDemoSeedAllowed } from "./seed-safety.mjs";
const key = () => randomUUID();
describe("CRM comercial com MySQL, isolamento, consistência e autorizações", () => {
  let db: Connection,
    t: number,
    t2: number,
    ownerId: number,
    salesId: number,
    patientId: number,
    portalId: number;
  let owner: ReturnType<typeof appRouter.createCaller>,
    foreign: typeof owner,
    reader: typeof owner,
    sales: typeof owner,
    portal: typeof owner;
  const tenants: number[] = [],
    accounts: number[] = [];
  const today = () => clinicParts(new Date(), "America/Sao_Paulo").date;
  const month = () => today().slice(0, 7);
  async function insert(sql: string, args: unknown[]) {
    const [r] = await db.execute<ResultSetHeader>(sql, args);
    return r.insertId;
  }
  async function account(tenant: number, role: string, permissions: string[]) {
    const id = await insert("INSERT INTO users(openId,name) VALUES(?,?)", [
      `sales-${key()}`,
      "Responsável comercial fictício",
    ]);
    accounts.push(id);
    await insert(
      "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,?,?)",
      [tenant, id, role, JSON.stringify(permissions)]
    );
    const now = new Date();
    return {
      id,
      caller: appRouter.createCaller({
        user: {
          id,
          openId: `fixture-${id}`,
          name: "Contexto forjado não é identidade",
          role: "user",
          email: null,
          loginMethod: "test",
          createdAt: now,
          updatedAt: now,
          lastSignedIn: now,
        },
        req: { headers: {} },
        res: {},
      } as TrpcContext),
    };
  }
  async function newLead(allowed = true) {
    return owner.crm.create({
      requestKey: key(),
      fullName: `Contato fictício ${key().slice(0, 8)}`,
      email: `sales-${key().slice(0, 8)}@example.com`,
      preferredChannel: "EMAIL",
      contactAllowed: allowed,
      ownerUserId: ownerId,
    });
  }
  async function create(amount = 12345) {
    const l = await newLead();
    return owner.commercial.create({
      requestKey: key(),
      leadId: l.id,
      title: "Oportunidade fictícia",
      amount,
      ownerUserId: ownerId,
      expectedCloseDate: today(),
    });
  }
  async function detail(id: number) {
    return owner.commercial.detail({ opportunityId: id });
  }
  async function move(
    id: number,
    stage: "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST" | "QUALIFICATION",
    reason = "",
    confirmed = false
  ) {
    return owner.commercial.move({
      opportunityId: id,
      revision: (await detail(id)).opportunity.revision,
      stage,
      reason,
      confirmed,
    });
  }
  async function proposal(id: number) {
    const d = await detail(id);
    return owner.commercial.createProposal({
      requestKey: key(),
      opportunityId: id,
      revision: d.opportunity.revision,
      title: "Proposta administrativa",
      quantity: 3,
      unitPrice: 10001,
      discount: 2,
      validUntil: today(),
      terms: "Condições fictícias sem dados clínicos",
    });
  }
  async function decide(
    id: number,
    proposalId: number,
    status: "PRESENTED" | "ACCEPTED" | "CANCELLED"
  ) {
    const p = (await detail(id)).proposals.find(p => p.id === proposalId)!;
    return owner.commercial.decideProposal({
      proposalId,
      revision: p.revision,
      status,
      evidence: "Conferência administrativa fictícia",
      confirmed: true,
    });
  }
  async function counts() {
    const result: Record<string, number> = {};
    for (const table of [
      "mindos_sales_opportunities",
      "mindos_sales_events",
      "mindos_sales_proposals",
      "mindos_crm_tasks",
      "transactions",
      "financial_movements",
      "mindos_patients",
    ]) {
      const [[r]] = await db.query<any[]>(
        `SELECT COUNT(*) n FROM ${table} WHERE tenantId=?`,
        [t]
      );
      result[table] = r.n;
    }
    return result;
  }
  beforeAll(async () => {
    assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
    db = await mysql.createConnection(process.env.DATABASE_URL!);
    for (const s of ["a", "b"])
      tenants.push(
        await insert(
          "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES(?,?,'{}')",
          [`commercial-${s}-${key()}`, "Clínica comercial fictícia"]
        )
      );
    [t, t2] = tenants;
    const a = await account(t, "OWNER", []);
    owner = a.caller;
    ownerId = a.id;
    foreign = (await account(t2, "OWNER", [])).caller;
    reader = (await account(t, "SALES", ["VIEW_CRM", "VIEW_COMMERCIAL"]))
      .caller;
    const s = await account(t, "SALES", [
      "VIEW_CRM",
      "MANAGE_CRM",
      "VIEW_COMMERCIAL",
      "MANAGE_COMMERCIAL",
    ]);
    sales = s.caller;
    salesId = s.id;
    const p = await account(t, "PATIENT", []);
    portal = p.caller;
    portalId = p.id;
    patientId = await insert(
      "INSERT INTO mindos_patients(tenantId,fullName,email,administrativeStatus,portalUserId) VALUES(?,'Paciente comercial fictício','patient-sales@example.com','ACTIVE',?)",
      [t, portalId]
    );
  });
  afterAll(async () => {
    if (!db) return;
    try {
      for (const tenant of tenants) {
        for (const table of [
          "mindos_sales_runs",
          "mindos_sales_events",
          "mindos_sales_goals",
          "mindos_sales_preferences",
          "mindos_sales_proposals",
          "mindos_sales_rules",
          "mindos_sales_opportunities",
          "mindos_crm_interactions",
          "mindos_crm_tasks",
          "mindos_crm_leads",
          "mindos_contact_preferences",
          "mindos_access_audits",
          "mindos_patients",
          "mindos_memberships",
        ])
          await db.execute(`DELETE FROM ${table} WHERE tenantId=?`, [tenant]);
        await db.execute("DELETE FROM mindos_tenants WHERE id=?", [tenant]);
      }
      for (const id of accounts)
        await db.execute("DELETE FROM users WHERE id=?", [id]);
    } finally {
      await db.end();
    }
  });
  it("cria oportunidade com origem do lead, sem hashes, identidade forjada ou conteúdo clínico", async () => {
    const { id } = await create();
    const d = await detail(id);
    expect(d.opportunity.source).toBe("MANUAL");
    expect(d.opportunity.createdByUserId).toBe(ownerId);
    expect(d.opportunity).not.toHaveProperty("creationHash");
    expect(d.history[0].actorUserId).toBe(ownerId);
    expect(JSON.stringify(await owner.commercial.overview({}))).not.toContain(
      "clinicalRecords"
    );
  });
  it("reenvio concorrente não duplica e rejeita reutilização com outro valor", async () => {
    const l = await newLead();
    const input = {
      requestKey: key(),
      leadId: l.id,
      title: "Oportunidade repetida",
      amount: 100,
      ownerUserId: ownerId,
      expectedCloseDate: today(),
    };
    const [a, b] = await Promise.all([
      owner.commercial.create(input),
      owner.commercial.create(input),
    ]);
    expect(a.id).toBe(b.id);
    await expect(
      owner.commercial.create({ ...input, amount: 101 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("isola clínica, permissões de leitura e paciente em todos os acessos", async () => {
    const { id } = await create();
    const d = await detail(id);
    expect(
      (await reader.commercial.detail({ opportunityId: id })).opportunity.id
    ).toBe(id);
    await expect(
      reader.commercial.move({
        opportunityId: id,
        revision: d.opportunity.revision,
        stage: "PROPOSAL",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      foreign.commercial.detail({ opportunityId: id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      foreign.commercial.savePreference({
        leadId: d.lead.id,
        revision: 0,
        emailAllowed: true,
        whatsappAllowed: false,
        reason: "Tentativa externa",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(portal.commercial.overview({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(
      (await foreign.commercial.report({ month: month() })).wonAmount
    ).toBe(0);
  });
  it("não aceita responsável de outra clínica ou desativado", async () => {
    const { id } = await create();
    await db.execute(
      "UPDATE mindos_memberships SET active=false WHERE tenantId=? AND userId=?",
      [t, salesId]
    );
    try {
      const o = (await detail(id)).opportunity;
      await expect(
        owner.commercial.edit({
          opportunityId: id,
          revision: o.revision,
          title: o.title,
          amount: o.amount,
          ownerUserId: salesId,
          expectedCloseDate: today(),
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      await db.execute(
        "UPDATE mindos_memberships SET active=true WHERE tenantId=? AND userId=?",
        [t, salesId]
      );
    }
  });
  it("mudanças simultâneas recusam a revisão perdida e transições inválidas", async () => {
    const { id } = await create();
    const result = await Promise.allSettled([
      owner.commercial.move({
        opportunityId: id,
        revision: 1,
        stage: "PROPOSAL",
      }),
      owner.commercial.move({
        opportunityId: id,
        revision: 1,
        stage: "LOST",
        reason: "Motivo fictício válido",
      }),
    ]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (result.find(r => r.status === "rejected") as PromiseRejectedResult)
        .reason.code
    ).toBe("CONFLICT");
    const other = await create();
    await expect(move(other.id, "WON", "", true)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("calcula a proposta, preserva versões, soma exata e idempotência", async () => {
    const { id } = await create();
    const first = await proposal(id);
    let d = await detail(id);
    expect(d.proposals[0].total).toBe(30001);
    expect(d.opportunity.amount).toBe(30001);
    await decide(id, first.id, "PRESENTED");
    const p = await proposal(id);
    d = await detail(id);
    expect(d.proposals.find(p => p.id === first.id)?.status).toBe("CANCELLED");
    expect(d.proposals.find(q => q.id === p.id)?.version).toBe(2);
    const before = await counts();
    await expect(
      owner.commercial.createProposal({
        requestKey: key(),
        opportunityId: id,
        revision: d.opportunity.revision,
        title: "Valor inválido",
        quantity: 1,
        unitPrice: 100,
        discount: 100,
        validUntil: today(),
        terms: "Condições de teste",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await counts()).toEqual(before);
  });
  it("ganhar exige proposta apresentada e aceita, registra sem criar cobrança ou paciente", async () => {
    const { id } = await create();
    await move(id, "PROPOSAL");
    await move(id, "NEGOTIATION");
    await expect(move(id, "WON", "", true)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const p = await proposal(id);
    await expect(decide(id, p.id, "ACCEPTED")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await decide(id, p.id, "PRESENTED");
    await decide(id, p.id, "ACCEPTED");
    const before = await counts();
    await move(id, "WON", "", true);
    const after = await counts();
    expect(after.transactions).toBe(before.transactions);
    expect(after.financial_movements).toBe(before.financial_movements);
    expect(after.mindos_patients).toBe(before.mindos_patients);
    await expect(decide(id, p.id, "CANCELLED")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  it("recusa proposta vencida e não sobrescreve proposta aceita", async () => {
    const { id } = await create();
    const p = await proposal(id);
    await db.execute(
      "UPDATE mindos_sales_proposals SET validUntil='2000-01-01' WHERE id=? AND tenantId=?",
      [p.id, t]
    );
    await expect(decide(id, p.id, "PRESENTED")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const other = await create();
    const q = await proposal(other.id);
    await decide(other.id, q.id, "PRESENTED");
    await decide(other.id, q.id, "ACCEPTED");
    await expect(proposal(other.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  it("perda exige motivo, cancela propostas e reabre com histórico preservado", async () => {
    const { id } = await create();
    const p = await proposal(id);
    await expect(move(id, "LOST", "curto")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await move(id, "LOST", "Preferiu adiar a contratação");
    let d = await detail(id);
    expect(d.proposals.find(q => q.id === p.id)?.status).toBe("CANCELLED");
    expect(d.opportunity.lostReason).toContain("adiar");
    await move(id, "QUALIFICATION", "Solicitou nova negociação");
    d = await detail(id);
    expect(d.opportunity.closedAt).toBeNull();
    expect(d.history.some(h => h.summary.includes("adiar"))).toBe(true);
  });
  it("metas usam revisão, escopo de clínica/responsável e relatório mensal correto", async () => {
    await owner.commercial.saveGoal({
      month: month(),
      ownerUserId: null,
      targetAmount: 100000,
      revision: 0,
    });
    await owner.commercial.saveGoal({
      month: month(),
      ownerUserId: ownerId,
      targetAmount: 50000,
      revision: 0,
    });
    await expect(
      owner.commercial.saveGoal({
        month: month(),
        ownerUserId: null,
        targetAmount: 1,
        revision: 0,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const r = await sales.commercial.report({ month: month() });
    expect(r.won).toBe(1);
    expect(r.wonAmount).toBe(30001);
    expect(r.goals.find(g => g.ownerUserId === 0)?.achieved).toBe(30001);
    expect(r.bySource.find(g => g.id === "MANUAL")?.wonAmount).toBe(30001);
    expect(JSON.stringify(r)).not.toMatch(
      /patientId|clinical|terms|fullName|email/
    );
  });
  it("bloqueia automação por padrão, exige autorização comercial e evita duplicidade", async () => {
    const { id } = await create();
    const d = await detail(id);
    const r = await owner.commercial.saveRule({
      revision: 0,
      name: "Retorno fictício de qualificação",
      stage: "QUALIFICATION",
      channel: "EMAIL",
      delayDays: 1,
      enabled: true,
    });
    expect((await owner.commercial.applyRules()).created).toBe(0);
    await owner.commercial.savePreference({
      leadId: d.lead.id,
      revision: 0,
      emailAllowed: true,
      whatsappAllowed: false,
      reason: "Autorização comercial fictícia conferida",
    });
    const [a, b] = await Promise.all([
      owner.commercial.applyRules(),
      owner.commercial.applyRules(),
    ]);
    expect(a.created + b.created).toBe(1);
    const [[count]] = await db.query<any[]>(
      "SELECT COUNT(*) n FROM mindos_sales_runs WHERE tenantId=? AND ruleId=? AND opportunityId=?",
      [t, r.id, id]
    );
    expect(count.n).toBe(1);
    expect(
      (await owner.commercial.overview({ channel: "EMAIL" })).items.some(
        o => o.id === id
      )
    ).toBe(true);
    expect(
      (await owner.commercial.overview({ channel: "NONE" })).items.some(
        o => o.id === id
      )
    ).toBe(false);
  });
  it("retirar autorização cancela tarefas abertas e a repetição não recria", async () => {
    const rows = await owner.commercial.overview({ channel: "EMAIL" });
    const o = rows.items[0];
    const d = await detail(o.id);
    await owner.commercial.savePreference({
      leadId: d.lead.id,
      revision: d.preference.revision,
      emailAllowed: false,
      whatsappAllowed: false,
      reason: "Pessoa retirou a autorização comercial",
    });
    const [[task]] = await db.query<any[]>(
      "SELECT t.status FROM mindos_crm_tasks t JOIN mindos_sales_runs r ON r.taskId=t.id AND r.tenantId=t.tenantId WHERE r.tenantId=? AND r.opportunityId=? ORDER BY r.id DESC LIMIT 1",
      [t, o.id]
    );
    expect(task.status).toBe("CANCELLED");
    expect((await owner.commercial.applyRules()).created).toBe(0);
  });
  it("bloqueio geral no CRM prevalece e cancela tarefas comerciais", async () => {
    const { id } = await create();
    const d = await detail(id);
    await owner.commercial.savePreference({
      leadId: d.lead.id,
      revision: 0,
      emailAllowed: true,
      whatsappAllowed: false,
      reason: "Pessoa autorizou contato comercial",
    });
    await owner.commercial.applyRules();
    const l = (await owner.crm.overview()).leads.find(l => l.id === d.lead.id)!;
    await owner.crm.update({
      leadId: l.id,
      revision: l.revision,
      stage: "NEW",
      ownerUserId: ownerId,
      nextContactAt: null,
      contactAllowed: false,
      reason: "",
    });
    expect((await detail(id)).eligible.email).toBe(false);
    const [[task]] = await db.query<any[]>(
      "SELECT t.status FROM mindos_crm_tasks t JOIN mindos_sales_runs r ON r.taskId=t.id AND r.tenantId=t.tenantId WHERE r.tenantId=? AND r.opportunityId=? LIMIT 1",
      [t, id]
    );
    expect(task.status).toBe("CANCELLED");
  });
  it("permissão de lembretes não autoriza comércio; revogação pelo portal cancela retorno", async () => {
    const l = await newLead();
    await owner.crm.convert({
      leadId: l.id,
      revision: 1,
      patientId,
      identityConfirmed: true,
    });
    await portal.crm.saveMyPreferences({
      revision: 0,
      emailAllowed: true,
      whatsappAllowed: false,
    });
    const { id } = await owner.commercial.create({
      requestKey: key(),
      leadId: l.id,
      title: "Retorno comercial do paciente",
      amount: 200,
      ownerUserId: ownerId,
      expectedCloseDate: today(),
    });
    expect((await detail(id)).eligible.email).toBe(false);
    await owner.commercial.savePreference({
      leadId: l.id,
      revision: 0,
      emailAllowed: true,
      whatsappAllowed: false,
      reason: "Autorização comercial independente",
    });
    await owner.commercial.applyRules();
    await portal.crm.saveMyPreferences({
      revision: 1,
      emailAllowed: false,
      whatsappAllowed: false,
    });
    expect((await detail(id)).eligible.email).toBe(false);
    const [[task]] = await db.query<any[]>(
      "SELECT t.status FROM mindos_crm_tasks t JOIN mindos_sales_runs r ON r.taskId=t.id AND r.tenantId=t.tenantId WHERE r.tenantId=? AND r.opportunityId=? LIMIT 1",
      [t, id]
    );
    expect(task.status).toBe("CANCELLED");
  });
  it("revogação de associação bloqueia até reenvio de operação já criada", async () => {
    const l = await newLead();
    const input = {
      requestKey: key(),
      leadId: l.id,
      title: "Reenvio revogado",
      amount: 100,
      ownerUserId: ownerId,
      expectedCloseDate: today(),
    };
    await owner.commercial.create(input);
    await db.execute(
      "UPDATE mindos_memberships SET active=false WHERE tenantId=? AND userId=?",
      [t, ownerId]
    );
    try {
      await expect(owner.commercial.create(input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    } finally {
      await db.execute(
        "UPDATE mindos_memberships SET active=true WHERE tenantId=? AND userId=?",
        [t, ownerId]
      );
    }
  });
  it("falha de auditoria reverte oportunidade e histórico na mesma transação", async () => {
    const l = await newLead();
    const before = await counts();
    const database = (await getDb())!;
    const original = database.transaction.bind(database);
    const spy = vi
      .spyOn(database, "transaction")
      .mockImplementationOnce((async (action: any) =>
        original(async tx =>
          action(
            new Proxy(tx, {
              get(target, property) {
                if (property === "insert")
                  return (table: unknown) => {
                    if (table === mindosAccessAudits)
                      return {
                        values: () => {
                          throw new Error("falha de auditoria injetada");
                        },
                      };
                    return target.insert(table as any);
                  };
                const value = Reflect.get(target, property);
                return typeof value === "function" ? value.bind(target) : value;
              },
            })
          )
        )) as typeof database.transaction);
    try {
      await expect(
        owner.commercial.create({
          requestKey: key(),
          leadId: l.id,
          title: "Operação a reverter",
          amount: 100,
          ownerUserId: ownerId,
          expectedCloseDate: today(),
        })
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(await counts()).toEqual(before);
  });
  it("propostas repetidas em paralelo mantêm uma única versão e recusam alteração da chave", async () => {
    const { id } = await create();
    const input = {
      requestKey: key(),
      opportunityId: id,
      revision: 1,
      title: "Proposta concorrente",
      quantity: 1,
      unitPrice: 10001,
      discount: 0,
      validUntil: today(),
      terms: "Condições administrativas fictícias",
    };
    const [a, b] = await Promise.all([
      owner.commercial.createProposal(input),
      owner.commercial.createProposal(input),
    ]);
    expect(a.id).toBe(b.id);
    expect((await detail(id)).proposals).toHaveLength(1);
    await expect(
      owner.commercial.createProposal({ ...input, unitPrice: 20000 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("relatório respeita a virada do mês no fuso da clínica", async () => {
    // SQL UTC explícito: o mysql2 direto serializa Date no fuso do host,
    // enquanto o Drizzle grava/lê timestamps UTC.
    await db.query("SET time_zone='+00:00'");
    const a = await create(111),
      b = await create(222);
    await db.execute(
      "UPDATE mindos_sales_opportunities SET stage='WON',closedAt=? WHERE tenantId=? AND id=?",
      ["2030-06-01 01:00:00", t, a.id]
    );
    await db.execute(
      "UPDATE mindos_sales_opportunities SET stage='WON',closedAt=? WHERE tenantId=? AND id=?",
      ["2030-06-01 04:00:00", t, b.id]
    );
    expect(
      (await owner.commercial.report({ month: "2030-05" })).wonAmount
    ).toBe(111);
    expect(
      (await owner.commercial.report({ month: "2030-06" })).wonAmount
    ).toBe(222);
  });
  it("transferir responsável e desativar regra preserva a tarefa e sua autoria", async () => {
    const { id } = await create();
    const d = await detail(id);
    await owner.commercial.savePreference({
      leadId: d.lead.id,
      revision: 0,
      emailAllowed: true,
      whatsappAllowed: false,
      reason: "Escolha comercial fictícia confirmada",
    });
    await owner.commercial.applyRules();
    const task = (await owner.crm.overview()).tasks.find(t =>
      t.title.startsWith(`Retorno comercial #${id} •`)
    )!;
    const current = (await detail(id)).opportunity;
    await owner.commercial.edit({
      opportunityId: id,
      revision: current.revision,
      title: current.title,
      amount: current.amount,
      ownerUserId: salesId,
      expectedCloseDate: current.expectedCloseDate,
    });
    expect(
      (await owner.crm.overview()).tasks.find(t => t.id === task.id)
        ?.ownerUserId
    ).toBe(salesId);
    const r = (await owner.commercial.settings()).rules[0];
    await owner.commercial.saveRule({
      id: r.id,
      revision: r.revision,
      name: r.name,
      stage: r.stage,
      channel: r.channel,
      delayDays: r.delayDays,
      enabled: false,
    });
    expect(
      (await owner.crm.overview()).tasks.find(t => t.id === task.id)?.status
    ).toBe("CANCELLED");
    expect((await owner.commercial.applyRules()).created).toBe(0);
  });
  it("recusa referências estrangeiras de propostas, regras e responsáveis de metas", async () => {
    const { id } = await create();
    const p = await proposal(id);
    await expect(
      foreign.commercial.decideProposal({
        proposalId: p.id,
        revision: 1,
        status: "PRESENTED",
        evidence: "Tentativa em outra clínica",
        confirmed: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      foreign.commercial.createProposal({
        requestKey: key(),
        opportunityId: id,
        revision: 2,
        title: "Proposta estrangeira",
        quantity: 1,
        unitPrice: 100,
        discount: 0,
        validUntil: today(),
        terms: "Condições de teste",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const r = (await owner.commercial.settings()).rules[0];
    const { recordedByUserId, tenantId, ...rule } = r;
    await expect(
      foreign.commercial.saveRule({ ...rule, name: "Regra de outra clínica" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      foreign.commercial.saveGoal({
        month: month(),
        ownerUserId: ownerId,
        targetAmount: 100,
        revision: 0,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("acesso antigo de CRM não concede consulta ou gestão comercial", async () => {
    const legacy = (await account(t, "SALES", ["VIEW_CRM", "MANAGE_CRM"]))
      .caller;
    await expect(legacy.commercial.overview({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(legacy.commercial.applyRules()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await legacy.crm.overview()).canViewCommercial).toBe(false);
  });
});
