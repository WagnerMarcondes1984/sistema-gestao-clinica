import { protectedProcedure, router } from "./_core/trpc";
import { operationsStatus } from "./operations";
export const operationsRouter = router({
  status: protectedProcedure.query(({ ctx }) => operationsStatus(ctx.user)),
});
