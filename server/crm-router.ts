import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as crm from "./crm";
import {
  crmId,
  leadInput,
  leadUpdate,
  taskInput,
  interactionInput,
  preferenceInput,
} from "../shared/crm";
const crmProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR") {
    console.error("[CRM] Operação administrativa não concluída", {
      userId: ctx.user.id,
    });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Não foi possível concluir a operação administrativa. Atualize e tente novamente.",
    });
  }
  return result;
});
const subject = z
  .object({ leadId: crmId.optional(), patientId: crmId.optional() })
  .strict()
  .refine(
    i => Boolean(i.leadId) !== Boolean(i.patientId),
    "Escolha lead ou paciente"
  );
export const crmRouter = router({
  overview: crmProcedure.query(({ ctx }) => crm.overview(ctx.user)),
  create: crmProcedure
    .input(leadInput)
    .mutation(({ ctx, input }) => crm.createLead(ctx.user, input)),
  update: crmProcedure
    .input(leadUpdate)
    .mutation(({ ctx, input }) => crm.updateLead(ctx.user, input)),
  importRequest: crmProcedure
    .input(
      z
        .object({
          requestId: crmId,
          ownerUserId: crmId.nullable(),
          targetLeadId: crmId.optional(),
          identityConfirmed: z.literal(true),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => crm.importRequest(ctx.user, input)),
  convert: crmProcedure
    .input(
      z
        .object({
          leadId: crmId,
          revision: crmId,
          patientId: crmId.optional(),
          identityConfirmed: z.literal(true),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => crm.convertLead(ctx.user, input)),
  addTask: crmProcedure
    .input(taskInput)
    .mutation(({ ctx, input }) => crm.addTask(ctx.user, input)),
  updateTask: crmProcedure
    .input(
      z
        .object({
          taskId: crmId,
          revision: crmId,
          title: z.string().trim().min(3).max(180),
          ownerUserId: crmId,
          dueAt: taskInput.shape.dueAt,
        })
        .strict()
    )
    .mutation(({ ctx, input }) => crm.updateTask(ctx.user, input)),
  resolveTask: crmProcedure
    .input(
      z
        .object({
          taskId: crmId,
          revision: crmId,
          status: z.enum(["DONE", "CANCELLED"]),
          resolution: z.string().trim().min(3).max(500),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => crm.resolveTask(ctx.user, input)),
  addInteraction: crmProcedure
    .input(interactionInput)
    .mutation(({ ctx, input }) => crm.addInteraction(ctx.user, input)),
  history: crmProcedure
    .input(subject)
    .query(({ ctx, input }) => crm.history(ctx.user, input)),
  preferences: crmProcedure
    .input(z.object({ patientId: crmId }).strict())
    .query(({ ctx, input }) => crm.preferences(ctx.user, input.patientId)),
  savePreferences: crmProcedure
    .input(
      preferenceInput
        .extend({ patientId: crmId, reason: z.string().trim().min(8).max(500) })
        .strict()
    )
    .mutation(({ ctx, input }) => crm.savePreferences(ctx.user, input)),
  myPreferences: crmProcedure.query(({ ctx }) => crm.myPreferences(ctx.user)),
  saveMyPreferences: crmProcedure
    .input(preferenceInput)
    .mutation(({ ctx, input }) => crm.saveMyPreferences(ctx.user, input)),
  reminders: crmProcedure.query(({ ctx }) => crm.reminders(ctx.user)),
  prepareReminders: crmProcedure.mutation(({ ctx }) =>
    crm.prepareReminders(ctx.user)
  ),
  metrics: crmProcedure.query(({ ctx }) => crm.metrics(ctx.user)),
});
