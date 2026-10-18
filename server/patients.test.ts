import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { patientInput, normalizePatientName } from "../shared/patients";
import { isDuplicatePatient } from "./patients";

const data = patientInput.parse({
  fullName: "Ana de Souza",
  birthDate: "1990-05-20",
  email: "Ana@example.com",
  phone: "(11) 99999-1234",
});
const anon = appRouter.createCaller({
  user: null,
  req: { headers: {} },
  res: {},
} as TrpcContext);
describe("cadastro de pacientes", () => {
  it.each([
    () => anon.patients.list({}),
    () => anon.patients.get({ patientId: 1 }),
    () => anon.patients.history({ patientId: 1 }),
    () => anon.patients.create(data),
    () => anon.patients.update({ patientId: 1, revision: 1, data }),
  ])("exige sessão na operação %#", async call => {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("normaliza nome e e-mail, mantendo o nome de exibição", () => {
    const result = patientInput.parse({
      ...data,
      fullName: "  Ána   de Souza ",
      email: " ANA@EXAMPLE.COM ",
    });
    expect(result.fullName).toBe("Ána de Souza");
    expect(result.email).toBe("ana@example.com");
    expect(normalizePatientName(result.fullName)).toBe("ana de souza");
  });
  it.each([
    { fullName: " " },
    { email: "inválido" },
    { phone: "abc11999991234" },
    { birthDate: "2024-02-30" },
    { birthDate: "2999-01-01" },
    { birthDate: "1890-01-01" },
    { tenantId: 2 },
    { portalUserId: 5 },
    { administrativeStatus: "DELETED" },
  ])("rejeita campos inválidos ou de identidade: %j", fields => {
    expect(patientInput.safeParse({ ...data, ...fields }).success).toBe(false);
  });
  it("não confunde familiares com contato compartilhado ou homônimos de outra data", () => {
    const row = {
      fullName: "Ána de Souza",
      email: data.email,
      phone: data.phone,
      birthDate: new Date("1990-05-20T12:00:00Z"),
    };
    expect(isDuplicatePatient(row, data)).toBe(true);
    expect(isDuplicatePatient(row, { ...data, fullName: "Outra Pessoa" })).toBe(
      false
    );
    expect(isDuplicatePatient(row, { ...data, birthDate: "1991-05-20" })).toBe(
      false
    );
    expect(isDuplicatePatient({ ...row, birthDate: null }, data)).toBe(true);
  });
});
