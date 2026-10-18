import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  positiveId,
  civilDate,
  civilTime,
  appointmentInput,
} from "../shared/scheduling";
import {
  listClinical,
  clinicalCapabilities,
  createClinical,
  updateClinical,
  clinicalHistory,
  patientAssignments,
  assignPatient,
} from "./clinical";
import { listPrivateDocuments, setDocumentAccess } from "./private-documents";
import {
  consentTemplates,
  saveConsent,
  publishConsent,
  decideConsent,
  patientConsentHistory,
  portalData,
  setFinancialPortalAccess,
  patientFinancialLinks,
  requestReschedule,
  cancelReschedule,
  rescheduleInbox,
  resolveReschedule,
} from "./portal-care";
const patient = z.object({ patientId: positiveId }).strict();
const content = z.string().trim().min(1).max(30000);
export const careRouter = router({
  recordAccess: protectedProcedure
    .input(patient)
    .query(({ ctx, input }) => clinicalCapabilities(ctx.user, input.patientId)),
  records: protectedProcedure
    .input(patient)
    .query(({ ctx, input }) => listClinical(ctx.user, input.patientId)),
  createRecord: protectedProcedure
    .input(
      z
        .object({
          patientId: positiveId,
          appointmentId: positiveId.optional(),
          parentRecordId: positiveId.optional(),
          recordType: z.enum([
            "ANAMNESIS",
            "EVOLUTION",
            "RESTRICTED_NOTE",
            "GOAL",
            "CARE_PLAN",
          ]),
          content,
        })
        .strict()
    )
    .mutation(({ ctx, input }) => createClinical(ctx.user, input)),
  updateRecord: protectedProcedure
    .input(
      z
        .object({
          recordId: positiveId,
          revision: positiveId,
          content: content.optional(),
          finalize: z.boolean(),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => updateClinical(ctx.user, input)),
  recordHistory: protectedProcedure
    .input(z.object({ recordId: positiveId }).strict())
    .query(({ ctx, input }) => clinicalHistory(ctx.user, input.recordId)),
  assignments: protectedProcedure
    .input(patient)
    .query(({ ctx, input }) => patientAssignments(ctx.user, input.patientId)),
  assign: protectedProcedure
    .input(
      z
        .object({
          patientId: positiveId,
          userId: positiveId,
          active: z.boolean(),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => assignPatient(ctx.user, input)),
  documents: protectedProcedure
    .input(patient)
    .query(({ ctx, input }) => listPrivateDocuments(ctx.user, input.patientId)),
  documentAccess: protectedProcedure
    .input(
      z
        .object({
          documentId: positiveId,
          revision: positiveId,
          action: z.enum(["RELEASE", "HIDE", "REVOKE"]),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => setDocumentAccess(ctx.user, input)),
  consentTemplates: protectedProcedure.query(({ ctx }) =>
    consentTemplates(ctx.user)
  ),
  saveConsent: protectedProcedure
    .input(
      z
        .object({
          id: positiveId.optional(),
          revision: positiveId.optional(),
          code: z
            .string()
            .trim()
            .regex(/^[a-z0-9-]{2,64}$/),
          title: z.string().trim().min(2).max(180),
          body: content,
        })
        .strict()
    )
    .mutation(({ ctx, input }) => saveConsent(ctx.user, input)),
  publishConsent: protectedProcedure
    .input(
      z
        .object({
          id: positiveId,
          revision: positiveId,
          retire: z.boolean().optional(),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => publishConsent(ctx.user, input)),
  consentHistory: protectedProcedure
    .input(patient)
    .query(({ ctx, input }) =>
      patientConsentHistory(ctx.user, input.patientId)
    ),
  financialLinks: protectedProcedure
    .input(patient)
    .query(({ ctx, input }) =>
      patientFinancialLinks(ctx.user, input.patientId)
    ),
  financialAccess: protectedProcedure
    .input(
      z
        .object({
          patientId: positiveId,
          code: z.string().trim().min(1).max(32),
          visible: z.boolean(),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => setFinancialPortalAccess(ctx.user, input)),
  portal: protectedProcedure.query(({ ctx }) => portalData(ctx.user)),
  decideConsent: protectedProcedure
    .input(
      z
        .object({
          templateId: positiveId,
          bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
          decision: z.enum(["ACCEPTED", "DECLINED", "WITHDRAWN"]),
          acknowledged: z.boolean(),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => decideConsent(ctx.user, input)),
  requestReschedule: protectedProcedure
    .input(
      z
        .object({ appointmentId: positiveId, date: civilDate, time: civilTime })
        .strict()
    )
    .mutation(({ ctx, input }) => requestReschedule(ctx.user, input)),
  cancelReschedule: protectedProcedure
    .input(z.object({ id: positiveId }).strict())
    .mutation(({ ctx, input }) => cancelReschedule(ctx.user, input.id)),
  rescheduleInbox: protectedProcedure.query(({ ctx }) =>
    rescheduleInbox(ctx.user)
  ),
  resolveReschedule: protectedProcedure
    .input(
      z
        .object({
          id: positiveId,
          revision: positiveId,
          approve: z.boolean(),
          appointment: appointmentInput.optional(),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => resolveReschedule(ctx.user, input)),
});
