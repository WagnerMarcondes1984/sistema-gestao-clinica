import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { draftInput, versionAction } from "../shared/public-site";
import {
  siteOverview,
  saveSiteDraft,
  approveSite,
  publishSite,
} from "./public-site";
const procedure = protectedProcedure.use(async ({ ctx, next }) => {
  const r = await next();
  if (!r.ok && r.error.code === "INTERNAL_SERVER_ERROR") {
    console.error("[CMS] Operação não concluída", { userId: ctx.user.id });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Não foi possível concluir a alteração do site. Atualize e tente novamente.",
    });
  }
  return r;
});
export const publicSiteRouter = router({
  versions: procedure.query(({ ctx }) => siteOverview(ctx.user)),
  saveDraft: procedure
    .input(draftInput)
    .mutation(({ ctx, input }) => saveSiteDraft(ctx.user, input)),
  approve: procedure
    .input(versionAction)
    .mutation(({ ctx, input }) => approveSite(ctx.user, input)),
  publish: procedure
    .input(versionAction)
    .mutation(({ ctx, input }) => publishSite(ctx.user, input)),
  rollback: procedure
    .input(versionAction)
    .mutation(({ ctx, input }) => publishSite(ctx.user, input, true)),
});
