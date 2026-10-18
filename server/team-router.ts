import { z } from "zod";
import { PERMISSIONS, TEAM_ROLES } from "../shared/permissions";
import { protectedProcedure, router } from "./_core/trpc";
import {
  teamOverview,
  createClinic,
  createTeamInvite,
  previewTeamInvite,
  acceptTeamInvite,
  revokeTeamInvite,
  updateTeamMember,
} from "./team";
const access = z.object({
  role: z.enum(TEAM_ROLES),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).optional(),
  patientId: z.number().int().positive().optional(),
});
const tokenInput = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Convite inválido"),
});
export const teamRouter = router({
  overview: protectedProcedure.query(({ ctx }) => teamOverview(ctx.user)),
  createClinic: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(160),
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .min(3)
          .max(80)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      })
    )
    .mutation(({ ctx, input }) => createClinic(ctx.user, input)),
  createInvite: protectedProcedure
    .input(
      access.extend({ email: z.string().trim().toLowerCase().email().max(320) })
    )
    .mutation(({ ctx, input }) => createTeamInvite(ctx.user, input)),
  // POST: o segredo do convite não deve aparecer na URL de uma consulta GET.
  previewInvite: protectedProcedure
    .input(tokenInput)
    .mutation(({ ctx, input }) => previewTeamInvite(ctx.user, input.token)),
  acceptInvite: protectedProcedure
    .input(tokenInput)
    .mutation(({ ctx, input }) => acceptTeamInvite(ctx.user, input.token)),
  revokeInvite: protectedProcedure
    .input(z.object({ inviteId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => revokeTeamInvite(ctx.user, input.inviteId)),
  updateMember: protectedProcedure
    .input(
      access.extend({
        membershipId: z.number().int().positive(),
        active: z.boolean(),
      })
    )
    .mutation(({ ctx, input }) => updateTeamMember(ctx.user, input)),
});
