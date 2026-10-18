import { randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mysql, {
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
// @ts-expect-error Guard compartilhado com o seed JavaScript.
import { assertDemoSeedAllowed } from "./seed-safety.mjs";

describe("gestão de equipe, convites e associações", () => {
  let db: Connection;
  const tenants: number[] = [],
    userIds: number[] = [];
  const suffix = randomUUID().slice(0, 8);
  type Caller = ReturnType<typeof appRouter.createCaller>;
  type Account = { id: number; email: string; caller: Caller };
  let ownerA: Account, ownerB: Account, viewer: Account;
  let ownerMembership: number,
    viewerMembership: number,
    patientId: number,
    foreignPatientId: number;
  async function insert(sql: string, params: unknown[]) {
    const [result] = await db.execute<ResultSetHeader>(sql, params);
    return result.insertId;
  }
  async function account(
    label: string,
    role: "user" | "admin" = "user"
  ): Promise<Account> {
    const email = `${label}-${randomUUID()}@example.com`;
    const id = await insert(
      "INSERT INTO users (openId, name, email, role) VALUES (?, ?, ?, ?)",
      [`team-${randomUUID()}`, label, email, role]
    );
    userIds.push(id);
    const now = new Date();
    const ctx: TrpcContext = {
      user: {
        id,
        openId: `fixture-${id}`,
        name: label,
        email,
        role,
        loginMethod: "test",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      req: { headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    return { id, email, caller: appRouter.createCaller(ctx) };
  }
  beforeAll(async () => {
    assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
    db = await mysql.createConnection(process.env.DATABASE_URL!);
    for (const name of ["A", "B"])
      tenants.push(
        await insert(
          "INSERT INTO mindos_tenants (slug, name, siteConfigJson) VALUES (?, ?, ?)",
          [`team-${name}-${suffix}`, `Equipe fictícia ${name}`, "{}"]
        )
      );
    ownerA = await account("proprietario-a");
    ownerB = await account("proprietario-b");
    viewer = await account("consulta");
    ownerMembership = await insert(
      "INSERT INTO mindos_memberships (tenantId, userId, role, permissionsJson) VALUES (?, ?, ?, ?)",
      [tenants[0], ownerA.id, "OWNER", '["ALL"]']
    );
    await insert(
      "INSERT INTO mindos_memberships (tenantId, userId, role, permissionsJson) VALUES (?, ?, ?, ?)",
      [tenants[1], ownerB.id, "OWNER", '["ALL"]']
    );
    viewerMembership = await insert(
      "INSERT INTO mindos_memberships (tenantId, userId, role, permissionsJson) VALUES (?, ?, ?, ?)",
      [tenants[0], viewer.id, "VIEWER", '["VIEW_PATIENT_BASIC"]']
    );
    patientId = await insert(
      "INSERT INTO mindos_patients (tenantId, fullName) VALUES (?, ?)",
      [tenants[0], "Paciente fictício A"]
    );
    foreignPatientId = await insert(
      "INSERT INTO mindos_patients (tenantId, fullName) VALUES (?, ?)",
      [tenants[1], "Paciente fictício B"]
    );
  });
  afterAll(async () => {
    if (!db) return;
    try {
      for (const tenant of tenants) {
        for (const table of [
          "mindos_team_invites",
          "mindos_access_audits",
          "mindos_memberships",
          "mindos_patients",
        ])
          await db.execute("DELETE FROM `" + table + "` WHERE tenantId = ?", [
            tenant,
          ]);
        await db.execute("DELETE FROM mindos_tenants WHERE id = ?", [tenant]);
      }
      for (const id of userIds)
        await db.execute("DELETE FROM users WHERE id = ?", [id]);
    } finally {
      await db.end();
    }
  });

  it("limita listagens à própria clínica e oculta equipe de não administradores", async () => {
    const overview = await ownerA.caller.team.overview();
    expect(overview.members.map(member => member.userId).sort()).toEqual(
      [ownerA.id, viewer.id].sort()
    );
    expect(overview.members.some(member => member.userId === ownerB.id)).toBe(
      false
    );
    const readonly = await viewer.caller.team.overview();
    expect(readonly.canManage).toBe(false);
    expect(readonly.members).toEqual([]);
    expect(readonly.invites).toEqual([]);
    await expect(
      viewer.caller.team.createInvite({
        email: "alguem@example.com",
        role: "RECEPTIONIST",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("armazena só o hash, exige o e-mail destinatário e aceita convite uma única vez", async () => {
    const recipient = await account("convidado");
    const other = await account("outra-conta");
    const invite = await ownerA.caller.team.createInvite({
      email: recipient.email.toUpperCase(),
      role: "FINANCIAL",
      permissions: ["VIEW_FINANCIAL"],
    });
    const [[stored]] = await db.query<RowDataPacket[]>(
      "SELECT tokenHash FROM mindos_team_invites WHERE id = ?",
      [invite.id]
    );
    expect(stored.tokenHash).toBe(
      createHash("sha256").update(invite.token).digest("hex")
    );
    expect(JSON.stringify(await ownerA.caller.team.overview())).not.toContain(
      invite.token
    );
    await expect(
      other.caller.team.previewInvite({ token: invite.token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      other.caller.team.acceptInvite({ token: invite.token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await recipient.caller.team.previewInvite({ token: invite.token })).role
    ).toBe("FINANCIAL");
    const results = await Promise.allSettled([
      recipient.caller.team.acceptInvite({ token: invite.token }),
      recipient.caller.team.acceptInvite({ token: invite.token }),
    ]);
    expect(
      results.filter(result => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(
      1
    );
    await expect(recipient.caller.transactions.list({})).resolves.toEqual([]);
    await expect(
      recipient.caller.transactions.confirm({ code: "teste" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      recipient.caller.team.acceptInvite({ token: invite.token })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("recusa duplicação de convite, cancelamento entre clínicas e convites expirados", async () => {
    const recipient = await account("cancelamento");
    const input = { email: recipient.email, role: "RECEPTIONIST" as const };
    const invite = await ownerA.caller.team.createInvite(input);
    await expect(ownerA.caller.team.createInvite(input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      ownerB.caller.team.revokeInvite({ inviteId: invite.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await ownerA.caller.team.revokeInvite({ inviteId: invite.id });
    await expect(
      recipient.caller.team.acceptInvite({ token: invite.token })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const expired = await ownerA.caller.team.createInvite(input);
    await db.execute(
      "UPDATE mindos_team_invites SET expiresAt = ? WHERE id = ?",
      [new Date(Date.now() - 60_000), expired.id]
    );
    await expect(
      recipient.caller.team.previewInvite({ token: expired.token })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      (await ownerA.caller.team.overview()).invites.find(
        item => item.id === expired.id
      )?.expired
    ).toBe(true);
  });
  it("bloqueia alterações de outra clínica, autoalteração e desativação do proprietário", async () => {
    await expect(
      ownerB.caller.team.updateMember({
        membershipId: viewerMembership,
        role: "VIEWER",
        active: false,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ownerA.caller.team.updateMember({
        membershipId: ownerMembership,
        role: "VIEWER",
        active: false,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const peer = await account("administrador");
    const invite = await ownerA.caller.team.createInvite({
      email: peer.email,
      role: "CLINIC_ADMIN",
    });
    await peer.caller.team.acceptInvite({ token: invite.token });
    await expect(
      peer.caller.team.updateMember({
        membershipId: ownerMembership,
        role: "VIEWER",
        active: false,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      peer.caller.team.createInvite({
        email: "admin-novo@example.com",
        role: "CLINIC_ADMIN",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const next = await account("convite-do-administrador");
    const pending = await peer.caller.team.createInvite({
      email: next.email,
      role: "RECEPTIONIST",
    });
    const membership = (await ownerA.caller.team.overview()).members.find(
      member => member.userId === peer.id
    )!;
    await ownerA.caller.team.updateMember({
      membershipId: membership.id,
      role: "CLINIC_ADMIN",
      active: false,
    });
    await expect(
      peer.caller.team.createInvite({
        email: "nao@example.com",
        role: "VIEWER",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      next.caller.team.acceptInvite({ token: pending.token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("desativa, reativa e aplica permissões granulares nas próximas requisições", async () => {
    await ownerA.caller.team.updateMember({
      membershipId: viewerMembership,
      role: "FINANCIAL",
      permissions: ["VIEW_FINANCIAL"],
      active: true,
    });
    await expect(viewer.caller.transactions.list({})).resolves.toEqual([]);
    await ownerA.caller.team.updateMember({
      membershipId: viewerMembership,
      role: "FINANCIAL",
      permissions: ["VIEW_FINANCIAL"],
      active: false,
    });
    await expect(viewer.caller.transactions.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await ownerA.caller.team.updateMember({
      membershipId: viewerMembership,
      role: "FINANCIAL",
      permissions: ["VIEW_FINANCIAL"],
      active: true,
    });
    await expect(viewer.caller.transactions.list({})).resolves.toEqual([]);
    await expect(
      viewer.caller.transactions.confirm({ code: "teste" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [audits] = await db.query<RowDataPacket[]>(
      "SELECT * FROM mindos_access_audits WHERE tenantId = ? AND action = 'UPDATE_TEAM_MEMBER'",
      [tenants[0]]
    );
    expect(
      audits.some(
        audit =>
          audit.actorUserId === ownerA.id &&
          audit.subjectId === viewerMembership
      )
    ).toBe(true);
  });
  it("vincula o convite de paciente ao cadastro correto e impede vínculo entre clínicas", async () => {
    const recipient = await account("portal");
    await expect(
      ownerA.caller.team.createInvite({
        email: recipient.email,
        role: "PATIENT",
        patientId: foreignPatientId,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const invite = await ownerA.caller.team.createInvite({
      email: recipient.email,
      role: "PATIENT",
      patientId,
    });
    await recipient.caller.team.acceptInvite({ token: invite.token });
    expect((await recipient.caller.mindos.portalData()).patient.id).toBe(
      patientId
    );
    await expect(recipient.caller.transactions.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      ownerA.caller.team.createInvite({
        email: "outro-paciente@example.com",
        role: "PATIENT",
        patientId,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const member = (await ownerA.caller.team.overview()).members.find(
      row => row.userId === recipient.id
    )!;
    await ownerA.caller.team.updateMember({
      membershipId: member.id,
      role: "PATIENT",
      patientId,
      active: false,
    });
    await expect(recipient.caller.mindos.portalData()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("não cria outra clínica automaticamente para contas vinculadas ou revogadas", async () => {
    const regular = await account("sem-autorizacao");
    await expect(
      regular.caller.team.createClinic({
        name: "Não autorizada",
        slug: `negada-${suffix}`,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const installer = await account("instalacao-autorizada", "admin");
    expect((await installer.caller.team.overview()).canCreateClinic).toBe(true);
    const result = await installer.caller.team.createClinic({
      name: "Clínica autorizada",
      slug: `autorizada-${suffix}`,
    });
    tenants.push(result.tenantId);
    expect((await installer.caller.team.overview()).role).toBe("OWNER");
    await expect(
      installer.caller.team.createClinic({
        name: "Duplicada",
        slug: `duplicada-${suffix}`,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await db.execute(
      "UPDATE mindos_memberships SET active = false WHERE userId = ?",
      [installer.id]
    );
    expect((await installer.caller.team.overview()).canCreateClinic).toBe(
      false
    );
    await expect(
      installer.caller.team.createClinic({
        name: "Revogada",
        slug: `revogada-${suffix}`,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("não aceita convite de outra clínica quando a conta já possui associação ativa", async () => {
    const invite = await ownerB.caller.team.createInvite({
      email: viewer.email,
      role: "VIEWER",
    });
    await expect(
      viewer.caller.team.acceptInvite({ token: invite.token })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await viewer.caller.team.overview()).clinic?.id).toBe(tenants[0]);
  });
});
