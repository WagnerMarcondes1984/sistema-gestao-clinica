import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, financialProcedure, router } from "./_core/trpc";
import { z } from "zod";
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
  createMindosPublicBooking,
  listMindosBookingRequests,
  listMindosPortalData,
  createMindosReceptionEvent,
  getMindosInstitutionalProfile,
  saveMindosInstitutionalProfile,
  listMindosServiceAreas,
  listMindosReceptionQueue,
} from "./db";

export const appRouter = router({
  system: systemRouter,
  publicMindos: router({
    serviceAreas: publicProcedure.query(async () => listMindosServiceAreas()),
    requestBooking: publicProcedure
      .input(z.object({
        name: z.string().min(2).max(160),
        contactChannel: z.enum(["WHATSAPP_DISCREET", "EMAIL", "PHONE"]),
        contactValue: z.string().min(5).max(200),
        serviceType: z.string().min(2).max(160),
        preferredDate: z.coerce.date(),
        preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }))
      .mutation(async ({ input }) => createMindosPublicBooking(input)),
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
        return await getDashboardMetrics(ctx.financialActor, input.verticalCode);
      }),
  }),

  transactions: router({
    list: financialProcedure("VIEW_FINANCIAL")
      .input(
        z.object({
          verticalCode: z.string().optional(),
          status: z.string().optional(),
          paymentMethod: z.string().optional(),
          search: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
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
      .input(
        z.object({
          verticalCode: z.string(),
          patientName: z.string(),
          patientDocument: z.string(),
          patientEmail: z.string().optional(),
          patientPhone: z.string().optional(),
          professionalName: z.string(),
          unitName: z.string().optional(),
          title: z.string(),
          category: z.string(),
          paymentMethod: z.enum([
            "PIX",
            "CREDIT_CARD",
            "DEBIT_CARD",
            "BOLETO",
            "CASH",
            "TRANSFER",
          ]),
          status: z
            .enum([
              "PENDING",
              "PAID",
              "OVERDUE",
              "FAILED",
              "REFUNDED",
              "PARTIALLY_REFUNDED",
            ])
            .optional(),
          subtotal: z.number(),
          discount: z.number().default(0),
          addition: z.number().default(0),
          totalAmount: z.number(),
          installments: z.number().default(1),
          installmentValue: z.number().optional(),
          dueDate: z.coerce.date(),
          cardBrand: z.string().optional(),
          cardLast4: z.string().optional(),
          cashReceived: z.number().optional(),
          cashChange: z.number().optional(),
          operatorName: z.string().optional(),
          notes: z.string().optional(),
          items: z.array(
            z.object({
              name: z.string(),
              type: z.string().optional(),
              quantity: z.number().default(1),
              unitPrice: z.number(),
              subtotal: z.number(),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await createTransactionWithItems(ctx.financialActor, input);
      }),
    confirm: financialProcedure("MANAGE_FINANCIAL")
      .input(
        z.object({
          code: z.string(),
          operatorName: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await confirmTransactionPayment(ctx.financialActor, input.code);
      }),
    refund: financialProcedure("MANAGE_FINANCIAL")
      .input(
        z.object({
          code: z.string(),
          reason: z.string(),
          operatorName: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await refundTransactionPayment(ctx.financialActor, 
          input.code,
          input.reason
        );
      }),
    simulateWebhook: financialProcedure("MANAGE_FINANCIAL")
      .input(
        z.object({
          code: z.string(),
          event: z.string().default("PIX_RECEIVED"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (process.env.NODE_ENV === "production") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Simulação indisponível em produção" });
        }
        const updated = await confirmTransactionPayment(ctx.financialActor, 
          input.code
        );
        return {
          event: input.event,
          processedAt: new Date(),
          success: true,
          transaction: updated,
        };
      }),
  }),

  accountsPayable: router({
    list: financialProcedure("VIEW_FINANCIAL")
      .input(
        z.object({
          verticalCode: z.string().optional(),
          status: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return await listAccountsPayable(ctx.financialActor, input.verticalCode, input.status);
      }),
    pay: financialProcedure("MANAGE_FINANCIAL")
      .input(z.object({ code: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return await payAccountPayable(ctx.financialActor, input.code);
      }),
  }),

  cash: router({
    current: financialProcedure("VIEW_FINANCIAL")
      .input(z.object({ verticalCode: z.string() }))
      .query(async ({ ctx, input }) => {
        return await getCurrentCashSession(ctx.financialActor, input.verticalCode);
      }),
    list: financialProcedure("VIEW_FINANCIAL")
      .input(z.object({ verticalCode: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        return await listCashSessions(ctx.financialActor, input.verticalCode);
      }),
    close: financialProcedure("MANAGE_FINANCIAL")
      .input(
        z.object({
          sessionId: z.number(),
          closingBalance: z.number(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await closeCashSession(ctx.financialActor, 
          input.sessionId,
          input.closingBalance,
          input.notes
        );
      }),
  }),

  mindos: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      return await getMindosDashboardData(ctx.user.id, ctx.user.role);
    }),
    appointments: protectedProcedure.query(async ({ ctx }) => {
      return await listMindosAppointments(ctx.user.id, ctx.user.role);
    }),
    createAppointment: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        professionalName: z.string().min(2),
        unitName: z.string().min(2),
        serviceType: z.string().min(2),
        mode: z.enum(["IN_PERSON", "ONLINE"]),
        status: z.enum(["SCHEDULED", "CONFIRMED"]).optional(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        recurrenceId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createMindosAppointment(ctx.user.id, ctx.user.role, input);
      }),
    createRecurring: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        professionalName: z.string().min(2),
        unitName: z.string().min(2),
        serviceType: z.string().min(2),
        mode: z.enum(["IN_PERSON", "ONLINE"]),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        count: z.number().int().min(1).max(24),
        intervalWeeks: z.number().int().min(1).max(8),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createMindosRecurringAppointments(ctx.user.id, ctx.user.role, input);
      }),
    patient360: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await getMindosPatient360(ctx.user.id, ctx.user.role, input.patientId);
      }),
    cms: router({
      versions: protectedProcedure.query(async ({ ctx }) => {
        return await listMindosCmsVersions(ctx.user.id, ctx.user.role);
      }),
      saveDraft: protectedProcedure
        .input(z.object({ contentJson: z.string(), changeSummary: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
          return await saveMindosCmsDraft(ctx.user.id, ctx.user.role, input.contentJson, input.changeSummary);
        }),
      publish: protectedProcedure
        .input(z.object({ versionId: z.number() }))
        .mutation(async ({ ctx, input }) => {
          return await publishMindosCmsVersion(ctx.user.id, ctx.user.role, input.versionId);
        }),
      approve: protectedProcedure
        .input(z.object({ versionId: z.number() }))
        .mutation(async ({ ctx, input }) => {
          return await approveMindosCmsVersion(ctx.user.id, ctx.user.role, input.versionId);
        }),
      rollback: protectedProcedure
        .input(z.object({ versionId: z.number() }))
        .mutation(async ({ ctx, input }) => {
          return await rollbackMindosCmsVersion(ctx.user.id, ctx.user.role, input.versionId);
        }),
    }),
    financialRules: protectedProcedure.query(async ({ ctx }) => {
      return await listMindosFinancialRules(ctx.user.id, ctx.user.role);
    }),
    clinicalRecords: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await listMindosClinicalRecords(ctx.user.id, ctx.user.role, input.patientId);
      }),
    createClinicalRecord: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        appointmentId: z.number().optional(),
        recordType: z.enum(["ANAMNESIS", "EVOLUTION", "RESTRICTED_NOTE", "GOAL", "CARE_PLAN"]),
        content: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        return await createMindosClinicalRecord(ctx.user.id, ctx.user.role, input);
      }),
    finalizeClinicalRecord: protectedProcedure
      .input(z.object({ recordId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return await finalizeMindosClinicalRecord(ctx.user.id, ctx.user.role, input.recordId);
      }),
    bookingRequests: protectedProcedure.query(async ({ ctx }) => listMindosBookingRequests(ctx.user.id, ctx.user.role)),
    receptionQueue: protectedProcedure.query(async ({ ctx }) => listMindosReceptionQueue(ctx.user.id, ctx.user.role)),
    portalData: protectedProcedure.query(async ({ ctx }) => listMindosPortalData(ctx.user.id, ctx.user.role)),
    receptionEvent: protectedProcedure.input(z.object({ patientId: z.number(), eventType: z.enum(["CHECK_IN", "MESSAGE_SENT", "CALL_LOGGED", "PROFILE_REVIEWED"]), messageTemplate: z.string().max(160).optional() })).mutation(async ({ ctx, input }) => createMindosReceptionEvent(ctx.user.id, ctx.user.role, input)),
    institutionalProfile: protectedProcedure.query(async ({ ctx }) => getMindosInstitutionalProfile(ctx.user.id, ctx.user.role)),
    saveInstitutionalProfile: protectedProcedure.input(z.object({ title: z.string().min(2), metaDescription: z.string().min(2), city: z.string().optional(), faqJson: z.string(), llmsTxt: z.string() })).mutation(async ({ ctx, input }) => saveMindosInstitutionalProfile(ctx.user.id, ctx.user.role, input)),
  }),

  audit: router({
    list: financialProcedure("VIEW_FINANCIAL")
      .input(
        z.object({
          verticalCode: z.string().optional(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return await listAuditLogs(ctx.financialActor, input.verticalCode, input.limit);
      }),
  }),
});

export type AppRouter = typeof appRouter;
