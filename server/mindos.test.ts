import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { hasMindosPermission } from "./db";
import type { TrpcContext } from "./_core/context";

function authenticatedContext(role: 'admin' | 'user'): TrpcContext {
  return {
    user: { id: 1, openId: 'mindos-test-owner', name: 'MindOS Test', email: 'test@mindos.local', loginMethod: 'test', role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  };
}

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("MindOS protected procedures", () => {
  it("enforces elevated and granular roles without accepting unrelated permissions", () => {
    expect(hasMindosPermission({ role: "OWNER", permissionsJson: "[]" }, "EDIT_RESTRICTED_NOTE")).toBe(true);
    expect(hasMindosPermission({ role: "RECEPTIONIST", permissionsJson: JSON.stringify(["VIEW_ADMINISTRATIVE"]) }, "VIEW_ADMINISTRATIVE")).toBe(true);
    expect(hasMindosPermission({ role: "RECEPTIONIST", permissionsJson: JSON.stringify(["VIEW_ADMINISTRATIVE"]) }, "VIEW_CLINICAL_RECORD")).toBe(false);
    expect(hasMindosPermission({ role: "VIEWER", permissionsJson: "invalid-json" }, "VIEW_ADMINISTRATIVE")).toBe(false);
  });
  it("keeps authenticated dashboard reads inside the resolved tenant", async () => {
    if (!process.env.DATABASE_URL) return;
    const caller = appRouter.createCaller(authenticatedContext('admin'));
    const dashboard = await caller.mindos.dashboard();
    expect(dashboard.tenant.businessType).toBe('PSYCHOLOGY_CLINIC');
    expect(dashboard.patients.every((patient) => patient.tenantId === dashboard.tenant.id)).toBe(true);
    expect(dashboard.appointments.every((appointment) => appointment.tenantId === dashboard.tenant.id)).toBe(true);
  });

  it("blocks dashboard access without a session", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.mindos.dashboard()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks appointment listing without a session", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.mindos.appointments()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks CMS publication without a session", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.mindos.cms.publish({ versionId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects malformed public booking times", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.publicMindos.requestBooking({ name: "Marina", contactChannel: "EMAIL", contactValue: "marina@example.com", serviceType: "Psicoterapia individual", preferredDate: new Date("2027-01-01T00:00:00Z"), preferredTime: "25:99" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("blocks portal and reception mutations without a session", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.mindos.portalData({ patientId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.mindos.receptionEvent({ patientId: 1, eventType: "CHECK_IN" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks CMS approval and recurring schedules without a session", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.mindos.cms.approve({ versionId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.mindos.createRecurring({
      patientId: 1,
      professionalName: "Dra. Clarice Vianna",
      unitName: "Unidade Pinheiros",
      serviceType: "Psicoterapia individual",
      mode: "IN_PERSON",
      startsAt: new Date("2026-09-13T14:00:00Z"),
      endsAt: new Date("2026-09-13T14:50:00Z"),
      count: 4,
      intervalWeeks: 1,
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
