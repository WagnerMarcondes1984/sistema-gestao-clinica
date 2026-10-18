import { describe, it, expect } from "vitest";
import {
  chargeInput,
  calculateCharge,
  installmentDate,
  reaisToCents,
  MAX_MONEY,
} from "../shared/finance";
const base = () =>
  chargeInput.parse({
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    patientId: 1,
    verticalCode: "PSYCHOLOGY_CLINIC",
    title: "Sessão fictícia",
    category: "Teste",
    paymentMethod: "PIX",
    dueDate: new Date("2026-01-31T12:00:00Z"),
    installments: 3,
    items: [{ name: "Sessão", quantity: 1, unitPrice: 10000 }],
  });
describe("aritmética financeira executada pelo servidor", () => {
  it("distribui o resto sem perder centavos", () => {
    const r = calculateCharge(base());
    expect(r.amounts).toEqual([3334, 3333, 3333]);
    expect(r.amounts.reduce((a, b) => a + b, 0)).toBe(r.total);
  });
  it("calcula itens, desconto e acréscimo", () => {
    const b = base();
    b.items = [
      { name: "Sessão", quantity: 3, unitPrice: 10000 },
      { name: "Outro", quantity: 2, unitPrice: 1234 },
    ];
    b.discount = 1000;
    b.addition = 100;
    expect(calculateCharge(b).total).toBe(31568);
  });
  it.each([
    { subtotal: 999 },
    { totalAmount: 1 },
    { discount: 10001 },
    { cashChange: 10 },
    { cashReceived: 10000 },
    { installmentValue: 3333 },
    { addition: MAX_MONEY },
  ])("recusa cálculo adulterado %j", change =>
    expect(() => calculateCharge({ ...base(), ...change })).toThrow()
  );
  it.each([-1, 0.5, Infinity, NaN, MAX_MONEY + 1])(
    "recusa valor inválido %s",
    unitPrice =>
      expect(() =>
        chargeInput.parse({
          ...base(),
          items: [{ name: "Teste", quantity: 1, unitPrice }],
        })
      ).toThrow()
  );
  it("recusa quantidades fracionárias e overflow na multiplicação", () => {
    expect(() =>
      chargeInput.parse({
        ...base(),
        items: [{ name: "Teste", quantity: 1.5, unitPrice: 1 }],
      })
    ).toThrow();
    expect(() =>
      calculateCharge({
        ...base(),
        items: [{ name: "Teste", quantity: 10000, unitPrice: MAX_MONEY }],
      })
    ).toThrow();
  });
  it("não aceita status pago nem identidade arbitrária da clínica", () => {
    expect(() => chargeInput.parse({ ...base(), status: "PAID" })).toThrow();
    expect(() => chargeInput.parse({ ...base(), tenantId: 2 })).toThrow();
  });
  it("não cria parcelas zeradas", () =>
    expect(() =>
      calculateCharge({
        ...base(),
        items: [{ name: "Teste", quantity: 1, unitPrice: 1 }],
      })
    ).toThrow());
  it("preserva o dia original depois de fevereiro", () => {
    expect(
      [0, 1, 2].map(i =>
        installmentDate(base().dueDate, i).toISOString().slice(0, 10)
      )
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("suporta ano bissexto", () =>
    expect(
      installmentDate(new Date("2028-01-31T12:00:00Z"), 1)
        .toISOString()
        .slice(0, 10)
    ).toBe("2028-02-29"));
  it.each([
    ["0,01", 1],
    ["1234.56", 123456],
    ["001", 100],
    ["0", 0],
  ])("converte texto decimal sem erro de ponto flutuante", (raw, n) =>
    expect(reaisToCents(raw)).toBe(n)
  );
  it.each(["-1", "1.234", "1e3", "", "1,2,3", "NaN", "100000000000"])(
    "recusa entrada ambígua %s",
    v => expect(() => reaisToCents(v)).toThrow()
  );
  it("recusa parcelas que ultrapassam o limite de datas do banco", () =>
    expect(() =>
      calculateCharge({
        ...base(),
        dueDate: new Date("2036-12-31T12:00:00Z"),
        installments: 24,
      })
    ).toThrow("Último vencimento"));
});
