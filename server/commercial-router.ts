import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import * as commercial from "./commercial";
import { crmId } from "../shared/crm";
import {
  opportunityInput,
  opportunityEdit,
  moveInput,
  proposalInput,
  proposalDecision,
  goalInput,
  commercialPreference,
  ruleInput,
  commercialFilter,
  reportInput,
} from "../shared/commercial";
const procedure = protectedProcedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR")
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Não foi possível concluir a operação comercial. Atualize e tente novamente.",
    });
  return result;
});
export const commercialRouter = router({
  overview: procedure
    .input(commercialFilter)
    .query(({ ctx, input }) => commercial.overview(ctx.user, input)),
  detail: procedure
    .input(z.object({ opportunityId: crmId }).strict())
    .query(({ ctx, input }) =>
      commercial.detail(ctx.user, input.opportunityId)
    ),
  create: procedure
    .input(opportunityInput)
    .mutation(({ ctx, input }) =>
      commercial.createOpportunity(ctx.user, input)
    ),
  edit: procedure
    .input(opportunityEdit)
    .mutation(({ ctx, input }) => commercial.editOpportunity(ctx.user, input)),
  move: procedure
    .input(moveInput)
    .mutation(({ ctx, input }) => commercial.moveOpportunity(ctx.user, input)),
  createProposal: procedure
    .input(proposalInput)
    .mutation(({ ctx, input }) => commercial.createProposal(ctx.user, input)),
  decideProposal: procedure
    .input(proposalDecision)
    .mutation(({ ctx, input }) => commercial.decideProposal(ctx.user, input)),
  savePreference: procedure
    .input(commercialPreference)
    .mutation(({ ctx, input }) => commercial.savePreference(ctx.user, input)),
  saveGoal: procedure
    .input(goalInput)
    .mutation(({ ctx, input }) => commercial.saveGoal(ctx.user, input)),
  settings: procedure.query(({ ctx }) => commercial.settings(ctx.user)),
  saveRule: procedure
    .input(ruleInput)
    .mutation(({ ctx, input }) => commercial.saveRule(ctx.user, input)),
  applyRules: procedure.mutation(({ ctx }) => commercial.applyRules(ctx.user)),
  report: procedure
    .input(reportInput)
    .query(({ ctx, input }) => commercial.report(ctx.user, input)),
});
