import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { seal, sameHash } from "./care-access";
const caller = appRouter.createCaller({
  user: null,
  req: { headers: {} },
  res: {},
} as TrpcContext);
describe("prontuário e portal exigem sessão", () => {
  it.each([
    () => caller.care.records({ patientId: 1 }),
    () => caller.care.recordAccess({ patientId: 1 }),
    () =>
      caller.care.createRecord({
        patientId: 1,
        recordType: "EVOLUTION",
        content: "Fictício",
      }),
    () =>
      caller.care.updateRecord({ recordId: 1, revision: 1, finalize: true }),
    () => caller.care.recordHistory({ recordId: 1 }),
    () => caller.care.assignments({ patientId: 1 }),
    () => caller.care.assign({ patientId: 1, userId: 2, active: true }),
    () => caller.care.documents({ patientId: 1 }),
    () =>
      caller.care.documentAccess({
        documentId: 1,
        revision: 1,
        action: "REVOKE",
      }),
    () => caller.care.consentTemplates(),
    () =>
      caller.care.saveConsent({
        code: "termo",
        title: "Termo",
        body: "Fictício",
      }),
    () => caller.care.publishConsent({ id: 1, revision: 1 }),
    () => caller.care.consentHistory({ patientId: 1 }),
    () => caller.care.financialLinks({ patientId: 1 }),
    () =>
      caller.care.financialAccess({
        patientId: 1,
        code: "COB-TEST",
        visible: true,
      }),
    () => caller.care.portal(),
    () =>
      caller.care.decideConsent({
        templateId: 1,
        bodyHash: "a".repeat(64),
        decision: "ACCEPTED",
        acknowledged: true,
      }),
    () =>
      caller.care.requestReschedule({
        appointmentId: 1,
        date: "2027-01-01",
        time: "09:00",
      }),
    () => caller.care.cancelReschedule({ id: 1 }),
    () => caller.care.rescheduleInbox(),
    () => caller.care.resolveReschedule({ id: 1, revision: 1, approve: false }),
  ])("recusa operação anônima %#", async call => {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
describe("integridade autenticada", () => {
  const previous = process.env.CLINICAL_INTEGRITY_SECRET;
  beforeAll(() => {
    process.env.CLINICAL_INTEGRITY_SECRET =
      "segredo-ficticio-exclusivo-para-testes-123456";
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.CLINICAL_INTEGRITY_SECRET;
    else process.env.CLINICAL_INTEGRITY_SECRET = previous;
  });
  it("vincula conteúdo, identidade e contexto ao hash", () => {
    const hash = seal("clinical", [1, "conteúdo fictício", 2]);
    expect(sameHash(hash, seal("clinical", [1, "conteúdo fictício", 2]))).toBe(
      true
    );
    expect(sameHash(hash, seal("clinical", [2, "conteúdo fictício", 2]))).toBe(
      false
    );
    expect(sameHash(hash, seal("consent", [1, "conteúdo fictício", 2]))).toBe(
      false
    );
    expect(sameHash(hash, "inválido")).toBe(false);
  });
  it("recusa segredo ausente", () => {
    const key = process.env.CLINICAL_INTEGRITY_SECRET;
    delete process.env.CLINICAL_INTEGRITY_SECRET;
    try {
      expect(() => seal("test", {})).toThrow();
    } finally {
      process.env.CLINICAL_INTEGRITY_SECRET = key;
    }
  });
});
