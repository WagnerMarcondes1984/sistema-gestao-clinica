import { describe, it, expect } from "vitest";
import {
  sameLead,
  leadInput,
  taskInput,
  interactionInput,
  CRM_TRANSITIONS,
} from "../shared/crm";
const requestKey = "123e4567-e89b-42d3-a456-426614174000";
describe("contratos e identidade administrativa CRM", () => {
  it("normaliza nome acentuado, caixa e telefone sem unir familiares", () => {
    expect(
      sameLead(
        { fullName: "  João TESTE ", email: null, phone: "(11) 99999-8888" },
        { fullName: "Joao teste", email: null, phone: "11999998888" }
      )
    ).toBe(true);
    expect(
      sameLead(
        { fullName: "Pessoa A", email: "familia@example.com", phone: null },
        { fullName: "Pessoa B", email: "familia@example.com", phone: null }
      )
    ).toBe(false);
  });
  it("não deduplica somente por nome nem somente por contato", () => {
    expect(
      sameLead(
        { fullName: "Teste pessoa", email: null, phone: null },
        { fullName: "Teste pessoa", email: null, phone: null }
      )
    ).toBe(false);
  });
  it("recusa lead sem contato, clínica forjada ou origem pública forjada", () => {
    const base = {
      requestKey,
      fullName: "Pessoa fictícia",
      email: "ficticio@example.com",
    };
    expect(leadInput.safeParse(base).success).toBe(true);
    expect(leadInput.safeParse({ ...base, email: "" }).success).toBe(false);
    expect(leadInput.safeParse({ ...base, tenantId: 99 }).success).toBe(false);
    expect(
      leadInput.safeParse({ ...base, source: "PUBLIC_BOOKING" }).success
    ).toBe(false);
  });
  it("tarefas exigem um único sujeito e responsável válido", () => {
    const base = {
      requestKey,
      title: "Retornar contato",
      ownerUserId: 1,
      dueAt: new Date(),
    };
    expect(taskInput.safeParse({ ...base, leadId: 1 }).success).toBe(true);
    expect(
      taskInput.safeParse({ ...base, patientId: 1, leadId: 1 }).success
    ).toBe(false);
    expect(taskInput.safeParse(base).success).toBe(false);
  });
  it("interação manual não aceita prova de envio/entrega nem autor escolhido", () => {
    const base = {
      requestKey,
      leadId: 1,
      channel: "EMAIL",
      summary: "Tentativa registrada",
      outcome: "ATTEMPTED",
    };
    expect(interactionInput.safeParse(base).success).toBe(true);
    expect(
      interactionInput.safeParse({ ...base, outcome: "DELIVERED" }).success
    ).toBe(false);
    expect(
      interactionInput.safeParse({ ...base, actorUserId: 9 }).success
    ).toBe(false);
  });
  it("conversão não é etapa editável e perda exige reabertura explícita", () => {
    expect(CRM_TRANSITIONS.CONVERTED).toBeUndefined();
    expect(CRM_TRANSITIONS.LOST).toEqual(["NEW"]);
  });
});
