import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  publicProcedure,
  protectedProcedure,
  financialProcedure,
  router,
} from "./_core/trpc";
import { z } from "zod";
import * as finance from "./finance";
import {
  chargeInput,
  receiptInput,
  reversalInput,
  payableInput,
  openCashInput,
  closeCashInput,
  cashMoveInput,
} from "../shared/finance";
import { teamRouter } from "./team-router";
import { careRouter } from "./care-router";
import { patientsRouter } from "./patients-router";
import { schedulingRouter } from "./scheduling-router";
import {
  publicSchedule,
  requestPublicBooking,
  listSchedule,
} from "./scheduling";
import { publicBookingInput } from "../shared/scheduling";
import {
  listClinicalVerticals,
  getClinicalVerticalByCode,
  listTransactions,
  getTransactionByCode,
  createTransactionWithItems,
  confirmTransactionPayment,
  refundTransactionPayment,
  getDashboardMetrics,
  listAccountsPayable,
  payAccountPayable,
  getCurrentCashSession,
  listCashSessions,
  closeCashSession,
  listAuditLogs,
  getMindosDashboardData,
  listMindosAppointments,
  createMindosAppointment,
  createMindosRecurringAppointments,
  getMindosPatient360,
  listMindosCmsVersions,
  saveMindosCmsDraft,
  publishMindosCmsVersion,
  approveMindosCmsVersion,
  rollbackMindosCmsVersion,
  listMindosFinancialRules,
  listMindosClinicalRecords,
  createMindosClinicalRecord,
  finalizeMindosClinicalRecord,
  listMindosBookingRequests,
  listMindosPortalData,
  createMindosReceptionEvent,
  getMindosInstitutionalProfile,
  saveMindosInstitutionalProfile,
  listMindosServiceAreas,
  listMindosReceptionQueue,
} from "./db";

export const appRouter = router({
  team: teamRouter,
  patients: patientsRouter,
  care: careRouter,
  scheduling: schedulingRouter,
  system: systemRouter,
  publicMindos: router({
    serviceAreas: publicProcedure.query(async () => listMindosServiceAreas()),
    scheduling: publicProcedure.query(() => publicSchedule()),
    requestBooking: publicProcedure
      .input(publicBookingInput)
      .mutation(({ ctx, input }) =>
        requestPublicBooking(input, ctx.req.socket?.remoteAddress || "unknown")
      ),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  verticals: router({
    list: publicProcedure.query(async () => {
      return await listClinicalVerticals();
    }),
    getByCode: publicProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        return await getClinicalVerticalByCode(input.code);
      }),
  }),

  dashboard: router({
    metrics: financialProcedure("VIEW_FINANCIAL")
      .input(z.object({ verticalCode: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        return await getDashboardMetrics(
          ctx.financialActor,
          input.verticalCode
        );
      }),
  }),

  transactions: router({
    list: financialProcedure("VIEW_FINANCIAL")
      .input(
        z.object({
          verticalCode: z.string().optional(),
          status: z
            .enum([
              "ALL",
              "PENDING",
              "PAID",
              "OVERDUE",
              "FAILED",
              "REFUNDED",
              "PARTIALLY_REFUNDED",
            ])
            .optional(),
          openOnly: z.boolean().optional(),
          paymentMethod: z
            .enum([
              "ALL",
              "PIX",
              "CREDIT_CARD",
              "DEBIT_CARD",
              "BOLETO",
              "CASH",
              "TRANSFER",
            ])
            .optional(),
          search: z.string().max(128).optional(),
          limit: z.number().int().min(1).max(500).optional(),
          offset: z.number().int().min(0).max(100000).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return await listTransactions(ctx.financialActor, input);
      }),
    getByCode: financialProcedure("VIEW_FINANCIAL")
      .input(z.object({ code: z.string() }))
      .query(async ({ ctx, input }) => {
        return await getTransactionByCode(ctx.financialActor, input.code);
      }),
    create: financialProcedure("MANAGE_FINANCIAL")
      .input(chargeInput)
      .mutation(({ ctx, input }) =>
        finance.createCharge(ctx.financialActor, input)
      ),
    confirm: financialProcedure("MANAGE_FINANCIAL")
      .input(receiptInput)
      .mutation(({ ctx, input }) =>
        finance.recordReceipt(ctx.financialActor, input)
      ),
    refund: financialProcedure("MANAGE_FINANCIAL")
      .input(reversalInput)
      .mutation(({ ctx, input }) =>
        finance.reverseReceipt(ctx.financialActor, input)
      ),
    simulateWebhook: financialProcedure("MANAGE_FINANCIAL")
      .input(z.object({ code: z.string(), event: z.string().optional() }))
      .mutation(() => {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Simulação financeira desativada. Provedor bancário ainda não configurado.",
        });
      }),
    context: financialProcedure("VIEW_FINANCIAL").query(({ ctx }) =>
      finance.financialContext(ctx.financialActor)
    ),
    movements: financialProcedure("VIEW_FINANCIAL").query(({ ctx }) =>
      finance.movements(ctx.financialActor)
    ),
  }),
  accountsPayable: router({
    list: financialProcedure("VIEW_FINANCIAL")
      .input(
        z.object({
          verticalCode: z.string().max(32).optional(),
          status: z
            .enum(["ALL", "PENDING", "OVERDUE", "PAID", "CANCELLED"])
            .optional(),
        })
      )
      .query(({ ctx, input }) =>
        finance.listPayables(
          ctx.financialActor,
          input.verticalCode,
          input.status
        )
      ),
    create: financialProcedure("MANAGE_FINANCIAL")
      .input(payableInput)
      .mutation(({ ctx, input }) =>
        finance.createPayable(ctx.financialActor, input)
      ),
    pay: financialProcedure("MANAGE_FINANCIAL")
      .input(receiptInput)
      .mutation(({ ctx, input }) =>
        finance.settlePayable(ctx.financialActor, input)
      ),
  }),
  cash: router({
    current: financialProcedure("VIEW_FINANCIAL")
      .input(z.object({ verticalCode: z.string().max(32) }))
      .query(({ ctx, input }) =>
        getCurrentCashSession(ctx.financialActor, input.verticalCode)
      ),
    list: financialProcedure("VIEW_FINANCIAL")
      .input(z.object({ verticalCode: z.string().max(32).optional() }))
      .query(({ ctx, input }) =>
        listCashSessions(ctx.financialActor, input.verticalCode)
      ),
    open: financialProcedure("MANAGE_FINANCIAL")
      .input(openCashInput)
      .mutation(({ ctx, input }) =>
        finance.openCash(ctx.financialActor, input)
      ),
    move: financialProcedure("MANAGE_FINANCIAL")
      .input(cashMoveInput)
      .mutation(({ ctx, input }) =>
        finance.moveCash(ctx.financialActor, input)
      ),
    close: financialProcedure("MANAGE_FINANCIAL")
      .input(closeCashInput)
      .mutation(({ ctx, input }) =>
        finance.closeCash(ctx.financialActor, input)
      ),
  }),

  mindos: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      return await getMindosDashboardData(ctx.user.id, ctx.user.role);
    }),
    appointments: protectedProcedure.query(async ({ ctx }) => {
      return await listMindosAppointments(ctx.user.id, ctx.user.role);
    }),
    createAppointment: protectedProcedure
      .input(
        z.object({
          patientId: z.number().int().positive(),
          professionalName: z.string().min(2),
          unitName: z.string().min(2),
          serviceType: z.string().min(2),
          mode: z.enum(["IN_PERSON", "ONLINE"]),
          status: z.enum(["SCHEDULED", "CONFIRMED"]).optional(),
          startsAt: z.coerce.date(),
          endsAt: z.coerce.date(),
          recurrenceId: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await createMindosAppointment(ctx.user.id, ctx.user.role, input);
      }),
    createRecurring: protectedProcedure
      .input(
        z.object({
          patientId: z.number().int().positive(),
          professionalName: z.string().min(2),
          unitName: z.string().min(2),
          serviceType: z.string().min(2),
          mode: z.enum(["IN_PERSON", "ONLINE"]),
          startsAt: z.coerce.date(),
          endsAt: z.coerce.date(),
          count: z.number().int().min(1).max(24),
          intervalWeeks: z.number().int().min(1).max(8),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await createMindosRecurringAppointments(
          ctx.user.id,
          ctx.user.role,
          input
        );
      }),
    patient360: protectedProcedure
      .input(z.object({ patientId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        return await getMindosPatient360(
          ctx.user.id,
          ctx.user.role,
          input.patientId
        );
      }),
    cms: router({
      versions: protectedProcedure.query(async ({ ctx }) => {
        return await listMindosCmsVersions(ctx.user.id, ctx.user.role);
      }),
      saveDraft: protectedProcedure
        .input(
          z.object({
            contentJson: z.string(),
            changeSummary: z.string().optional(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          return await saveMindosCmsDraft(
            ctx.user.id,
            ctx.user.role,
            input.contentJson,
            input.changeSummary
          );
        }),
      publish: protectedProcedure
        .input(z.object({ versionId: z.number() }))
        .mutation(async ({ ctx, input }) => {
          return await publishMindosCmsVersion(
            ctx.user.id,
            ctx.user.role,
            input.versionId
          );
        }),
      approve: protectedProcedure
        .input(z.object({ versionId: z.number() }))
        .mutation(async ({ ctx, input }) => {
          return await approveMindosCmsVersion(
            ctx.user.id,
            ctx.user.role,
            input.versionId
          );
        }),
      rollback: protectedProcedure
        .input(z.object({ versionId: z.number() }))
        .mutation(async ({ ctx, input }) => {
          return await rollbackMindosCmsVersion(
            ctx.user.id,
            ctx.user.role,
            input.versionId
          );
        }),
    }),
    financialRules: protectedProcedure.query(async ({ ctx }) => {
      return await listMindosFinancialRules(ctx.user.id, ctx.user.role);
    }),
    clinicalRecords: protectedProcedure
      .input(z.object({ patientId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        return await listMindosClinicalRecords(
          ctx.user.id,
          ctx.user.role,
          input.patientId
        );
      }),
    createClinicalRecord: protectedProcedure
      .input(
        z.object({
          patientId: z.number().int().positive(),
          appointmentId: z.number().optional(),
          recordType: z.enum([
            "ANAMNESIS",
            "EVOLUTION",
            "RESTRICTED_NOTE",
            "GOAL",
            "CARE_PLAN",
          ]),
          content: z.string().trim().min(1).max(30000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await createMindosClinicalRecord(
          ctx.user.id,
          ctx.user.role,
          input
        );
      }),
    finalizeClinicalRecord: protectedProcedure
      .input(
        z.object({
          recordId: z.number().int().positive(),
          revision: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await finalizeMindosClinicalRecord(
          ctx.user.id,
          ctx.user.role,
          input.recordId,
          input.revision
        );
      }),
    bookingRequests: protectedProcedure.query(async ({ ctx }) =>
      listMindosBookingRequests(ctx.user.id, ctx.user.role)
    ),
    receptionQueue: protectedProcedure.query(async ({ ctx }) =>
      listSchedule(ctx.user, undefined, undefined, true)
    ),
    portalData: protectedProcedure.query(async ({ ctx }) =>
      listMindosPortalData(ctx.user.id, ctx.user.role)
    ),
    receptionEvent: protectedProcedure
      .input(
        z.object({
          patientId: z.number().int().positive(),
          eventType: z.enum([
            "CHECK_IN",
            "MESSAGE_SENT",
            "CALL_LOGGED",
            "PROFILE_REVIEWED",
          ]),
          appointmentId: z.number().int().positive().optional(),
          messageTemplate: z.string().max(160).optional(),
        })
      )
      .mutation(async ({ ctx, input }) =>
        createMindosReceptionEvent(ctx.user.id, ctx.user.role, input)
      ),
    institutionalProfile: protectedProcedure.query(async ({ ctx }) =>
      getMindosInstitutionalProfile(ctx.user.id, ctx.user.role)
    ),
    saveInstitutionalProfile: protectedProcedure
      .input(
        z.object({
          title: z.string().min(2),
          metaDescription: z.string().min(2),
          city: z.string().optional(),
          faqJson: z.string(),
          llmsTxt: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) =>
        saveMindosInstitutionalProfile(ctx.user.id, ctx.user.role, input)
      ),
  }),

  audit: router({
    list: financialProcedure("VIEW_FINANCIAL")
      .input(
        z.object({
          verticalCode: z.string().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return await listAuditLogs(
          ctx.financialActor,
          input.verticalCode,
          input.limit
        );
      }),
  }),
});

export type AppRouter = typeof appRouter;
