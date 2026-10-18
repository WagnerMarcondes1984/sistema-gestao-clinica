import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  civilToInstant,
  clinicParts,
  addCivilDays,
  appointmentInput,
  publicBookingInput,
  TRANSITIONS,
} from "../shared/scheduling";
const anon = appRouter.createCaller({
  user: null,
  req: { headers: {} },
  res: {},
} as TrpcContext);
const appointment = appointmentInput.parse({
  patientId: 1,
  professionalId: 1,
  unitId: 1,
  serviceId: 1,
  mode: "ONLINE",
  date: "2027-01-01",
  time: "09:00",
});
describe("agenda e fuso da clínica", () => {
  it.each([
    () => anon.scheduling.context(),
    () => anon.scheduling.list({}),
    () => anon.scheduling.reception(),
    () => anon.scheduling.requests(),
    () => anon.scheduling.create(appointment),
    () =>
      anon.scheduling.saveConfig({
        kind: "unit",
        name: "Unidade",
        active: true,
      }),
    () =>
      anon.scheduling.saveTimezone({
        timezone: "America/Sao_Paulo",
        expected: "UTC",
      }),
    () =>
      anon.scheduling.transition({
        appointmentId: 1,
        revision: 1,
        status: "WAITING",
      }),
    () =>
      anon.scheduling.reschedule({
        appointmentId: 1,
        revision: 1,
        scope: "ONE",
        data: appointment,
      }),
    () =>
      anon.scheduling.processRequest({
        requestId: 1,
        revision: 1,
        status: "CONTACTED",
      }),
  ])("exige sessão na operação %#", async call => {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("converte horários civis e mantém semanas no fuso", () => {
    expect(
      civilToInstant("2027-01-01", "09:00", "America/Sao_Paulo").toISOString()
    ).toBe("2027-01-01T12:00:00.000Z");
    expect(
      clinicParts(new Date("2027-01-01T01:00:00Z"), "America/Sao_Paulo").date
    ).toBe("2026-12-31");
    const first = civilToInstant("2027-03-07", "09:00", "America/New_York"),
      next = civilToInstant(
        addCivilDays("2027-03-07", 7),
        "09:00",
        "America/New_York"
      );
    expect(next.getTime() - first.getTime()).toBe(167 * 3600000);
    expect(clinicParts(next, "America/New_York").time).toBe("09:00");
  });
  it("rejeita horário inexistente e ambíguo no horário de verão", () => {
    expect(() =>
      civilToInstant("2027-03-14", "02:30", "America/New_York")
    ).toThrow();
    expect(() =>
      civilToInstant("2027-11-07", "01:30", "America/New_York")
    ).toThrow();
  });
  it("limita série e rejeita identidades e datas inválidas", () => {
    for (const invalid of [
      { count: 25 },
      { intervalWeeks: 0 },
      { date: "2027-02-30" },
      { time: "25:00" },
      { tenantId: 2 },
      { professionalName: "Outra pessoa" },
    ])
      expect(
        appointmentInput.safeParse({ ...appointment, ...invalid }).success
      ).toBe(false);
    expect(TRANSITIONS.COMPLETED).toEqual([]);
    expect(TRANSITIONS.CANCELLED).toEqual([]);
  });
  it("exige consentimento e valida contato público", () => {
    const data = {
      name: "Pessoa fictícia",
      contactChannel: "EMAIL",
      contactValue: "ficticio@example.com",
      serviceId: 1,
      date: "2027-01-01",
      time: "09:00",
      consent: true,
    };
    expect(publicBookingInput.safeParse(data).success).toBe(true);
    expect(
      publicBookingInput.safeParse({ ...data, consent: false }).success
    ).toBe(false);
    expect(
      publicBookingInput.safeParse({ ...data, contactValue: "inválido" })
        .success
    ).toBe(false);
  });
});
