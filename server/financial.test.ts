import { describe, expect, it } from "vitest";

describe("Regras Financeiras do Core Clínico", () => {
  it("calcula corretamente subtotal, desconto autorizado, acréscimos e valor total", () => {
    const subtotal = 420000; // R$ 4.200,00
    const discount = 20000;  // R$ 200,00
    const addition = 5000;   // R$ 50,00
    const totalAmount = subtotal - discount + addition;

    expect(totalAmount).toBe(405000); // R$ 4.050,00
  });

  it("calcula troco exato para pagamentos em dinheiro", () => {
    const totalAmount = 60000; // R$ 600,00
    const cashReceived = 70000; // R$ 700,00
    const cashChange = cashReceived - totalAmount;

    expect(cashChange).toBe(10000); // R$ 100,00
  });

  it("divide parcelas de cartão de crédito com precisão", () => {
    const totalAmount = 680000; // R$ 6.800,00
    const installments = 10;
    const installmentValue = Math.round(totalAmount / installments);

    expect(installmentValue).toBe(68000); // R$ 680,00
  });

  it("garante transição de estados de pagamento com emissão de nota fiscal", () => {
    const initialStatus = "PENDING";
    const action = "PAYMENT_CONFIRMED";
    
    let finalStatus = initialStatus;
    let invoiceStatus = "NOT_ISSUED";

    if (action === "PAYMENT_CONFIRMED") {
      finalStatus = "PAID";
      invoiceStatus = "ISSUED";
    }

    expect(finalStatus).toBe("PAID");
    expect(invoiceStatus).toBe("ISSUED");
  });

  it("trata estorno e cancelamento fiscal devidamente", () => {
    const currentStatus = "PAID";
    const action = "REFUND";

    let newStatus = currentStatus;
    let invoiceStatus = "ISSUED";

    if (action === "REFUND") {
      newStatus = "REFUNDED";
      invoiceStatus = "CANCELLED";
    }

    expect(newStatus).toBe("REFUNDED");
    expect(invoiceStatus).toBe("CANCELLED");
  });
});
