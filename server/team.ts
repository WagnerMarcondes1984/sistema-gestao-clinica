import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, ensureMindosTenantForUser, hasMindosPermission } from "./db";
import {
  users,
  mindosTenants,
  mindosMemberships,
  mindosPatients,
  mindosTeamInvites,
  mindosAccessAudits,
  type User,
  type MindosMembership,
} from "../drizzle/schema";
import {
  PERMISSIONS,
  allowedTeamPermissions,
  permissionsForRole,
  type Permission,
  type TeamRole,
} from "../shared/permissions";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type AccessInput = {
  role: TeamRole;
  permissions?: Permission[];
  patientId?: number;
};
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const forbidden = (message: string): never => {
  throw new TRPCError({ code: "FORBIDDEN", message });
};
const missing = (): never => {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Registro não encontrado nesta clínica",
  });
};

async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Banco de dados indisponível",
    });
  return db;
}
export function readPermissions(json: string): Permission[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter(
          (value): value is Permission =>
            typeof value === "string" &&
            (PERMISSIONS as readonly string[]).includes(value)
        )
      : [];
  } catch {
    return [];
  }
}
export function validateTeamPermissions(input: AccessInput): Permission[] {
  if (input.role === "CLINIC_ADMIN") {
    if (
      input.permissions &&
      (input.permissions.length !== 1 || input.permissions[0] !== "ALL")
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Administrador possui acesso total; escolha outro papel para limitar permissões",
      });
    }
    return ["ALL"];
  }
  const allowed = allowedTeamPermissions(input.role);
  const permissions = [
    ...new Set(input.permissions ?? permissionsForRole(input.role)),
  ];
  if (permissions.some(permission => !allowed.includes(permission))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Permissão incompatível com o papel selecionado",
    });
  }
  if (input.role === "PATIENT" && !input.patientId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Selecione o cadastro do paciente",
    });
  }
  if (input.role !== "PATIENT" && input.patientId !== undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Vínculo de paciente exclusivo do papel Paciente",
    });
  }
  return permissions;
}
function isManager(member: Pick<MindosMembership, "role" | "permissionsJson">) {
  return (
    ["OWNER", "CLINIC_ADMIN", "SUPER_ADMIN"].includes(member.role) &&
    hasMindosPermission(member, "MANAGE_TEAM")
  );
}
function assertGrant(manager: MindosMembership, role: string) {
  if (["OWNER", "SUPER_ADMIN"].includes(role))
    forbidden(
      "Proprietário e superadministrador não podem ser alterados por este fluxo"
    );
  if (role === "CLINIC_ADMIN" && manager.role === "CLINIC_ADMIN")
    forbidden("Somente o proprietário pode gerenciar administradores");
}
async function managerContext(user: User) {
  const context = await ensureMindosTenantForUser(user.id, user.role);
  if (!isManager(context.membership))
    forbidden("Somente administradores autorizados podem gerenciar a equipe");
  return context;
}
async function lockManager(tx: Transaction, tenantId: number, userId: number) {
  const [tenant] = await tx
    .select()
    .from(mindosTenants)
    .where(eq(mindosTenants.id, tenantId))
    .for("update");
  if (!tenant || tenant.status !== "ACTIVE") forbidden("Clínica indisponível");
  const [member] = await tx
    .select()
    .from(mindosMemberships)
    .where(
      and(
        eq(mindosMemberships.tenantId, tenantId),
        eq(mindosMemberships.userId, userId),
        eq(mindosMemberships.active, true)
      )
    )
    .for("update");
  if (!member || !isManager(member))
    forbidden("Acesso administrativo revogado");
  return member;
}
async function validatePatient(
  tx: Transaction,
  tenantId: number,
  patientId: number,
  userId?: number
) {
  const [patient] = await tx
    .select()
    .from(mindosPatients)
    .where(
      and(
        eq(mindosPatients.tenantId, tenantId),
        eq(mindosPatients.id, patientId)
      )
    )
    .for("update");
  if (!patient) missing();
  if (patient.portalUserId !== null && patient.portalUserId !== userId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Paciente já vinculado a outra conta",
    });
  }
  return patient;
}
async function setPatientLink(
  tx: Transaction,
  tenantId: number,
  userId: number,
  input: AccessInput
) {
  if (input.role === "PATIENT")
    await validatePatient(tx, tenantId, input.patientId!, userId);
  await tx
    .update(mindosPatients)
    .set({ portalUserId: null })
    .where(
      and(
        eq(mindosPatients.tenantId, tenantId),
        eq(mindosPatients.portalUserId, userId)
      )
    );
  if (input.role === "PATIENT")
    await tx
      .update(mindosPatients)
      .set({ portalUserId: userId })
      .where(
        and(
          eq(mindosPatients.tenantId, tenantId),
          eq(mindosPatients.id, input.patientId!)
        )
      );
}
async function audit(
  tx: Transaction,
  tenantId: number,
  actorUserId: number,
  subjectType: string,
  subjectId: number,
  action: string,
  reason: string
) {
  await tx
    .insert(mindosAccessAudits)
    .values({
      tenantId,
      actorUserId,
      subjectType,
      subjectId,
      dataLayer: "ADMINISTRATIVE",
      action,
      reason,
    });
}

export async function teamOverview(user: User) {
  const db = await database();
  const active = await db
    .select()
    .from(mindosMemberships)
    .where(
      and(
        eq(mindosMemberships.userId, user.id),
        eq(mindosMemberships.active, true)
      )
    )
    .limit(2);
  if (active.length > 1)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Seleção explícita de clínica necessária",
    });
  const [anyMembership] = active.length
    ? active
    : await db
        .select()
        .from(mindosMemberships)
        .where(eq(mindosMemberships.userId, user.id))
        .limit(1);
  const [tenant] = active.length
    ? await db
        .select()
        .from(mindosTenants)
        .where(eq(mindosTenants.id, active[0].tenantId))
    : [];
  const member = active[0];
  const available = !!tenant && tenant.status === "ACTIVE";
  const canManage = available && !!member && isManager(member);
  const members = canManage
    ? await db
        .select({
          id: mindosMemberships.id,
          userId: users.id,
          name: users.name,
          email: users.email,
          role: mindosMemberships.role,
          permissionsJson: mindosMemberships.permissionsJson,
          active: mindosMemberships.active,
        })
        .from(mindosMemberships)
        .innerJoin(users, eq(users.id, mindosMemberships.userId))
        .where(eq(mindosMemberships.tenantId, tenant.id))
        .orderBy(users.name)
    : [];
  const patients = canManage
    ? await db
        .select({
          id: mindosPatients.id,
          name: mindosPatients.fullName,
          portalUserId: mindosPatients.portalUserId,
        })
        .from(mindosPatients)
        .where(eq(mindosPatients.tenantId, tenant.id))
    : [];
  const invites = canManage
    ? await db
        .select({
          id: mindosTeamInvites.id,
          email: mindosTeamInvites.email,
          role: mindosTeamInvites.role,
          status: mindosTeamInvites.status,
          expiresAt: mindosTeamInvites.expiresAt,
          createdAt: mindosTeamInvites.createdAt,
        })
        .from(mindosTeamInvites)
        .where(eq(mindosTeamInvites.tenantId, tenant.id))
        .orderBy(desc(mindosTeamInvites.createdAt))
        .limit(100)
    : [];
  return {
    clinic: available ? { id: tenant.id, name: tenant.name } : null,
    state: available
      ? ("ACTIVE" as const)
      : anyMembership
        ? ("INACTIVE" as const)
        : ("UNASSIGNED" as const),
    currentUserId: user.id,
    role: available ? member.role : null,
    canManage,
    canCreateClinic: !anyMembership && user.role === "admin",
    members: members.map(({ permissionsJson, ...row }) => ({
      ...row,
      permissions: readPermissions(permissionsJson),
      patientId:
        patients.find(patient => patient.portalUserId === row.userId)?.id ??
        null,
    })),
    patients: patients.map(({ id, name, portalUserId }) => ({
      id,
      name,
      linked: portalUserId !== null,
    })),
    invites: invites.map(invite => ({
      ...invite,
      expired: invite.status === "PENDING" && invite.expiresAt <= new Date(),
    })),
  };
}

export async function createClinic(
  user: User,
  input: { name: string; slug: string }
) {
  if (user.role !== "admin")
    forbidden(
      "A entrada de uma nova clínica exige autorização do administrador da instalação"
    );
  const db = await database();
  return db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .for("update");
    if (!current || current.role !== "admin")
      forbidden("Autorização de instalação revogada");
    const existing = await tx
      .select({ id: mindosMemberships.id })
      .from(mindosMemberships)
      .where(eq(mindosMemberships.userId, user.id))
      .limit(1);
    if (existing.length)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Conta já possui uma associação; solicite revisão ao administrador",
      });
    const [sameSlug] = await tx
      .select({ id: mindosTenants.id })
      .from(mindosTenants)
      .where(eq(mindosTenants.slug, input.slug));
    if (sameSlug)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Identificador da clínica já está em uso",
      });
    const [result] = await tx
      .insert(mindosTenants)
      .values({ name: input.name, slug: input.slug, siteConfigJson: "{}" });
    const tenantId = Number(result.insertId);
    await tx
      .insert(mindosMemberships)
      .values({
        tenantId,
        userId: user.id,
        role: "OWNER",
        permissionsJson: '["ALL"]',
        active: true,
      });
    await audit(
      tx,
      tenantId,
      user.id,
      "TENANT",
      tenantId,
      "CREATE_CLINIC",
      "Entrada explícita de clínica autorizada"
    );
    return { tenantId };
  });
}

export async function createTeamInvite(
  user: User,
  input: AccessInput & { email: string }
) {
  const permissions = validateTeamPermissions(input);
  const { tenant } = await managerContext(user);
  const db = await database();
  const token = randomBytes(32).toString("base64url");
  const email = normalizeEmail(input.email);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  return db.transaction(async tx => {
    const manager = await lockManager(tx, tenant.id, user.id);
    assertGrant(manager, input.role);
    if (input.role === "PATIENT")
      await validatePatient(tx, tenant.id, input.patientId!);
    const existing = await tx
      .select({ id: mindosMemberships.id })
      .from(mindosMemberships)
      .innerJoin(users, eq(users.id, mindosMemberships.userId))
      .where(
        and(eq(mindosMemberships.tenantId, tenant.id), eq(users.email, email))
      )
      .limit(1);
    if (existing.length)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Conta já vinculada; altere ou reative o vínculo existente",
      });
    const pending = await tx
      .select()
      .from(mindosTeamInvites)
      .where(
        and(
          eq(mindosTeamInvites.tenantId, tenant.id),
          eq(mindosTeamInvites.email, email),
          eq(mindosTeamInvites.status, "PENDING")
        )
      );
    if (pending.some(invite => invite.expiresAt > new Date()))
      throw new TRPCError({
        code: "CONFLICT",
        message: "Já existe convite válido para este e-mail",
      });
    const [result] = await tx
      .insert(mindosTeamInvites)
      .values({
        tenantId: tenant.id,
        email,
        role: input.role,
        permissionsJson: JSON.stringify(permissions),
        tokenHash: hashToken(token),
        patientId: input.patientId,
        createdByUserId: user.id,
        expiresAt,
      });
    await audit(
      tx,
      tenant.id,
      user.id,
      "TEAM_INVITE",
      Number(result.insertId),
      "CREATE_TEAM_INVITE",
      `Convite criado para papel ${input.role}; expiração em 72 horas`
    );
    return { id: Number(result.insertId), token, expiresAt };
  });
}

async function invitation(token: string) {
  const db = await database();
  const [invite] = await db
    .select()
    .from(mindosTeamInvites)
    .where(eq(mindosTeamInvites.tokenHash, hashToken(token)))
    .limit(1);
  if (!invite || invite.status !== "PENDING" || invite.expiresAt <= new Date())
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Convite inválido, expirado ou já utilizado",
    });
  return invite;
}
function assertRecipient(email: string | null, expected: string) {
  if (!email || normalizeEmail(email) !== expected)
    forbidden("Entre com a conta do e-mail destinatário deste convite");
}
export async function previewTeamInvite(user: User, token: string) {
  const invite = await invitation(token);
  assertRecipient(user.email, invite.email);
  const db = await database();
  const [tenant] = await db
    .select()
    .from(mindosTenants)
    .where(
      and(
        eq(mindosTenants.id, invite.tenantId),
        eq(mindosTenants.status, "ACTIVE")
      )
    );
  if (!tenant) forbidden("Clínica indisponível");
  return {
    clinicName: tenant.name,
    email: invite.email,
    role: invite.role,
    permissions: readPermissions(invite.permissionsJson),
    expiresAt: invite.expiresAt,
  };
}

export async function acceptTeamInvite(user: User, token: string) {
  const initial = await invitation(token);
  const db = await database();
  return db.transaction(async tx => {
    const [tenant] = await tx
      .select()
      .from(mindosTenants)
      .where(eq(mindosTenants.id, initial.tenantId))
      .for("update");
    if (!tenant || tenant.status !== "ACTIVE")
      forbidden("Clínica indisponível");
    const [invite] = await tx
      .select()
      .from(mindosTeamInvites)
      .where(
        and(
          eq(mindosTeamInvites.id, initial.id),
          eq(mindosTeamInvites.tokenHash, hashToken(token))
        )
      )
      .for("update");
    if (
      !invite ||
      invite.status !== "PENDING" ||
      invite.expiresAt <= new Date()
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Convite inválido, expirado ou já utilizado",
      });
    const [currentUser] = await tx
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .for("update");
    if (!currentUser) forbidden("Conta indisponível");
    assertRecipient(currentUser.email, invite.email);
    const [creator] = await tx
      .select()
      .from(mindosMemberships)
      .where(
        and(
          eq(mindosMemberships.tenantId, tenant.id),
          eq(mindosMemberships.userId, invite.createdByUserId),
          eq(mindosMemberships.active, true)
        )
      );
    if (!creator || !isManager(creator))
      forbidden("Convite revogado pela saída de seu administrador");
    assertGrant(creator, invite.role);
    const memberships = await tx
      .select()
      .from(mindosMemberships)
      .where(eq(mindosMemberships.userId, user.id))
      .for("update");
    if (memberships.some(member => member.active))
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Conta já possui clínica ativa; solicite revisão de sua associação",
      });
    const input: AccessInput = {
      role: invite.role,
      permissions: readPermissions(invite.permissionsJson),
      ...(invite.patientId ? { patientId: invite.patientId } : {}),
    };
    const permissions = validateTeamPermissions(input);
    await setPatientLink(tx, tenant.id, user.id, input);
    const previous = memberships.find(member => member.tenantId === tenant.id);
    let membershipId: number;
    if (previous) {
      membershipId = previous.id;
      await tx
        .update(mindosMemberships)
        .set({
          active: true,
          role: invite.role,
          permissionsJson: JSON.stringify(permissions),
        })
        .where(eq(mindosMemberships.id, previous.id));
    } else {
      const [result] = await tx
        .insert(mindosMemberships)
        .values({
          tenantId: tenant.id,
          userId: user.id,
          role: invite.role,
          permissionsJson: JSON.stringify(permissions),
          active: true,
        });
      membershipId = Number(result.insertId);
    }
    await tx
      .update(mindosTeamInvites)
      .set({
        status: "ACCEPTED",
        acceptedByUserId: user.id,
        acceptedAt: new Date(),
      })
      .where(eq(mindosTeamInvites.id, invite.id));
    await audit(
      tx,
      tenant.id,
      user.id,
      "MEMBERSHIP",
      membershipId,
      "ACCEPT_TEAM_INVITE",
      `Vínculo aceito para papel ${invite.role}`
    );
    return { role: invite.role, clinicName: tenant.name };
  });
}

export async function revokeTeamInvite(user: User, inviteId: number) {
  const { tenant } = await managerContext(user);
  const db = await database();
  return db.transaction(async tx => {
    const manager = await lockManager(tx, tenant.id, user.id);
    const [invite] = await tx
      .select()
      .from(mindosTeamInvites)
      .where(
        and(
          eq(mindosTeamInvites.id, inviteId),
          eq(mindosTeamInvites.tenantId, tenant.id)
        )
      )
      .for("update");
    if (!invite) missing();
    assertGrant(manager, invite.role);
    if (invite.status !== "PENDING")
      throw new TRPCError({
        code: "CONFLICT",
        message: "Convite já encerrado",
      });
    await tx
      .update(mindosTeamInvites)
      .set({ status: "REVOKED" })
      .where(eq(mindosTeamInvites.id, invite.id));
    await audit(
      tx,
      tenant.id,
      user.id,
      "TEAM_INVITE",
      invite.id,
      "REVOKE_TEAM_INVITE",
      "Convite cancelado pelo administrador"
    );
    return { success: true };
  });
}

export async function updateTeamMember(
  user: User,
  input: AccessInput & { membershipId: number; active: boolean }
) {
  const permissions = validateTeamPermissions(input);
  const { tenant } = await managerContext(user);
  const db = await database();
  return db.transaction(async tx => {
    const manager = await lockManager(tx, tenant.id, user.id);
    const [target] = await tx
      .select()
      .from(mindosMemberships)
      .where(
        and(
          eq(mindosMemberships.id, input.membershipId),
          eq(mindosMemberships.tenantId, tenant.id)
        )
      )
      .for("update");
    if (!target) missing();
    if (target.userId === user.id)
      forbidden("Você não pode alterar seu próprio acesso");
    assertGrant(manager, target.role);
    assertGrant(manager, input.role);
    if (input.active) {
      // O lock da identidade também serializa aceitações em clínicas diferentes.
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, target.userId))
        .for("update");
      const other = await tx
        .select()
        .from(mindosMemberships)
        .where(
          and(
            eq(mindosMemberships.userId, target.userId),
            eq(mindosMemberships.active, true)
          )
        )
        .for("update");
      if (other.some(member => member.tenantId !== tenant.id))
        throw new TRPCError({
          code: "CONFLICT",
          message: "Conta possui outra clínica ativa",
        });
    }
    await setPatientLink(tx, tenant.id, target.userId, input);
    await tx
      .update(mindosMemberships)
      .set({
        role: input.role,
        active: input.active,
        permissionsJson: JSON.stringify(permissions),
      })
      .where(eq(mindosMemberships.id, target.id));
    await audit(
      tx,
      tenant.id,
      user.id,
      "MEMBERSHIP",
      target.id,
      "UPDATE_TEAM_MEMBER",
      `Papel ${target.role} → ${input.role}; acesso ${input.active ? "ativo" : "desativado"}; paciente ${input.patientId ?? "não vinculado"}; permissões ${permissions.join(",") || "portal próprio"}`
    );
    return { success: true };
  });
}
