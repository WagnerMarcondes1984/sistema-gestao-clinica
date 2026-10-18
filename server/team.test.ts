import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { validateTeamPermissions } from "./team";
import type { TrpcContext } from "./_core/context";

const caller = appRouter.createCaller({
  user: null,
  req: { headers: {} },
  res: {},
} as TrpcContext);
describe("equipe e convites exigem sessão", () => {
  it.each([
    () => caller.team.overview(),
    () => caller.team.createClinic({ name: "Teste", slug: "teste" }),
    () =>
      caller.team.createInvite({
        email: "demo@example.com",
        role: "RECEPTIONIST",
      }),
    () => caller.team.previewInvite({ token: "x".repeat(43) }),
    () => caller.team.acceptInvite({ token: "x".repeat(43) }),
    () => caller.team.revokeInvite({ inviteId: 1 }),
    () =>
      caller.team.updateMember({
        membershipId: 1,
        role: "VIEWER",
        active: false,
      }),
  ])("recusa operação anônima %#", async call => {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
describe("limites de concessão por papel", () => {
  it("recusa acesso clínico da recepção e acesso total de papéis comuns", () => {
    expect(() =>
      validateTeamPermissions({
        role: "RECEPTIONIST",
        permissions: ["VIEW_CLINICAL_RECORD"],
      })
    ).toThrow();
    expect(() =>
      validateTeamPermissions({ role: "FINANCIAL", permissions: ["ALL"] })
    ).toThrow();
    expect(() =>
      validateTeamPermissions({ role: "CLINIC_ADMIN", permissions: [] })
    ).toThrow();
  });
  it("permite financeiro somente leitura e notas restritas por concessão explícita", () => {
    expect(
      validateTeamPermissions({
        role: "FINANCIAL",
        permissions: ["VIEW_FINANCIAL"],
      })
    ).toEqual(["VIEW_FINANCIAL"]);
    expect(
      validateTeamPermissions({
        role: "PSYCHOLOGIST",
        permissions: ["VIEW_RESTRICTED_NOTE"],
      })
    ).toEqual(["VIEW_RESTRICTED_NOTE"]);
    expect(validateTeamPermissions({ role: "PSYCHOLOGIST" })).not.toContain(
      "VIEW_RESTRICTED_NOTE"
    );
  });
  it("exige paciente em convite de portal e recusa vínculo em papel de funcionário", () => {
    expect(() => validateTeamPermissions({ role: "PATIENT" })).toThrow();
    expect(() =>
      validateTeamPermissions({ role: "RECEPTIONIST", patientId: 1 })
    ).toThrow();
    expect(validateTeamPermissions({ role: "PATIENT", patientId: 1 })).toEqual(
      []
    );
  });
});
