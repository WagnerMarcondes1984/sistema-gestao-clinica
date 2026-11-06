import { describe, expect, it } from "vitest";
import {
  opportunityInput,
  proposalInput,
  proposalTotal,
  commercialPreference,
  ruleInput,
  monthInput,
  parseCommercialMoney,
  SALES_TRANSITIONS,
} from "../shared/commercial";
const requestKey = "123e4567-e89b-42d3-a456-426614174000";
describe("Contratos do CRM comercial", () => {
  it("trabalha em centavos e recusa valores ambíguos, negativos e fracionários", () => {
    expect(parseCommercialMoney("1500,05")).toBe(150005);
    expect(proposalTotal(3, 10001, 2)).toEqual({
      subtotal: 30003,
      total: 30001,
    });
    for (const s of ["1.500,00", "10.50", "-1,00", "1,001", "NaN", ""])
      expect(() => parseCommercialMoney(s)).toThrow();
    for (const args of [
      [1, 100, 100],
      [1, 100, 101],
      [1, 100, -1],
      [1.1, 100, 0],
      [1000, 1_000_000_000, 0],
    ])
      expect(() =>
        proposalTotal(...(args as [number, number, number]))
      ).toThrow();
  });
  it("valida datas reais sem normalizar datas impossíveis", () => {
    const op = {
      requestKey,
      leadId: 1,
      title: "Oportunidade fictícia",
      amount: 100,
      ownerUserId: 1,
      expectedCloseDate: "2026-02-30",
    };
    expect(opportunityInput.safeParse(op).success).toBe(false);
    expect(
      opportunityInput.safeParse({ ...op, expectedCloseDate: "2026-02-28" })
        .success
    ).toBe(true);
    expect(monthInput.safeParse("2026-13").success).toBe(false);
  });
  it("não aceita clínica, autoria, total de proposta ou pagamento forjados", () => {
    const base = {
      requestKey,
      opportunityId: 1,
      revision: 1,
      title: "Proposta de exemplo",
      quantity: 1,
      unitPrice: 100,
      validUntil: "2026-12-31",
      terms: "Condições fictícias",
    };
    expect(proposalInput.safeParse(base).success).toBe(true);
    for (const extra of [
      { tenantId: 9 },
      { actorUserId: 9 },
      { total: 1 },
      { status: "ACCEPTED" },
      { paid: true },
      { signature: "x" },
    ])
      expect(proposalInput.safeParse({ ...base, ...extra }).success).toBe(
        false
      );
  });
  it("exige fonte de autorização comercial e impede segmentação clínica", () => {
    expect(
      commercialPreference.safeParse({
        leadId: 1,
        revision: 0,
        emailAllowed: true,
        whatsappAllowed: false,
        reason: "",
      }).success
    ).toBe(false);
    expect(
      ruleInput.safeParse({
        revision: 0,
        name: "Retorno",
        stage: "QUALIFICATION",
        channel: "EMAIL",
        delayDays: 1,
        enabled: true,
        diagnosis: "x",
      }).success
    ).toBe(false);
  });
  it("ganho é terminal e perda exige reabertura", () => {
    expect(SALES_TRANSITIONS.WON).toEqual([]);
    expect(SALES_TRANSITIONS.LOST).toEqual(["QUALIFICATION"]);
  });
});
