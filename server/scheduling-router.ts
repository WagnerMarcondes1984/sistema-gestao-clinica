import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  appointmentInput,
  configInput,
  positiveId,
  civilDate,
  timezoneInput,
} from "../shared/scheduling";
import {
  schedulingContext,
  saveSchedulingConfig,
  saveClinicTimezone,
  createAppointments,
  changeAppointment,
  rescheduleAppointments,
  listSchedule,
  listBookingRequests,
  processBookingRequest,
} from "./scheduling";
export const schedulingRouter = router({
  context: protectedProcedure.query(({ ctx }) => schedulingContext(ctx.user)),
  saveConfig: protectedProcedure
    .input(configInput)
    .mutation(({ ctx, input }) => saveSchedulingConfig(ctx.user, input)),
  saveTimezone: protectedProcedure
    .input(
      z.object({ timezone: timezoneInput, expected: timezoneInput }).strict()
    )
    .mutation(({ ctx, input }) =>
      saveClinicTimezone(ctx.user, input.timezone, input.expected)
    ),
  list: protectedProcedure
    .input(
      z
        .object({
          date: civilDate.optional(),
          patientId: positiveId.optional(),
        })
        .strict()
    )
    .query(({ ctx, input }) =>
      listSchedule(ctx.user, input.date, input.patientId)
    ),
  reception: protectedProcedure.query(({ ctx }) =>
    listSchedule(ctx.user, undefined, undefined, true)
  ),
  create: protectedProcedure
    .input(appointmentInput)
    .mutation(({ ctx, input }) => createAppointments(ctx.user, input)),
  transition: protectedProcedure
    .input(
      z
        .object({
          appointmentId: positiveId,
          revision: positiveId,
          status: z.enum([
            "CONFIRMED",
            "WAITING",
            "IN_PROGRESS",
            "COMPLETED",
            "CANCELLED",
            "NO_SHOW",
          ]),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => changeAppointment(ctx.user, input)),
  reschedule: protectedProcedure
    .input(
      z
        .object({
          appointmentId: positiveId,
          revision: positiveId,
          scope: z.enum(["ONE", "SERIES"]),
          data: appointmentInput,
        })
        .strict()
    )
    .mutation(({ ctx, input }) => rescheduleAppointments(ctx.user, input)),
  requests: protectedProcedure.query(({ ctx }) =>
    listBookingRequests(ctx.user)
  ),
  processRequest: protectedProcedure
    .input(
      z
        .object({
          requestId: positiveId,
          revision: positiveId,
          status: z.enum(["CONTACTED", "DECLINED", "SPAM", "CONFIRMED"]),
          appointment: appointmentInput.optional(),
        })
        .strict()
    )
    .mutation(({ ctx, input }) => processBookingRequest(ctx.user, input)),
});
