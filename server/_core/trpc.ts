import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { assertMindosPermission } from "../db";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export function financialProcedure(
  permission: "VIEW_FINANCIAL" | "MANAGE_FINANCIAL"
) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const { tenant } = await assertMindosPermission(
      ctx.user.id,
      ctx.user.role,
      permission
    );
    const result = await next({
      ctx: {
        ...ctx,
        financialActor: {
          tenantId: tenant.id,
          userId: ctx.user.id,
          operatorName: ctx.user.name || `Usuário ${ctx.user.id}`,
        },
      },
    });
    if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR") {
      console.error("[Financeiro] Operação não concluída", {
        tenantId: tenant.id,
        userId: ctx.user.id,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Não foi possível concluir o registro financeiro. Confira os dados e tente novamente com a mesma operação.",
      });
    }
    return result;
  });
}

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);
