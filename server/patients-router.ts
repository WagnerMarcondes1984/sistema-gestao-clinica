import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { patientInput, patientListInput } from "../shared/patients";
import {
  getPatient,
  listPatients,
  patientHistory,
  savePatient,
} from "./patients";

const id = z.number().int().positive();
export const patientsRouter = router({
  list: protectedProcedure
    .input(patientListInput)
    .query(({ ctx, input }) => listPatients(ctx.user, input)),
  get: protectedProcedure
    .input(z.object({ patientId: id }).strict())
    .query(({ ctx, input }) => getPatient(ctx.user, input.patientId)),
  history: protectedProcedure
    .input(z.object({ patientId: id }).strict())
    .query(({ ctx, input }) => patientHistory(ctx.user, input.patientId)),
  create: protectedProcedure
    .input(patientInput)
    .mutation(({ ctx, input }) => savePatient(ctx.user, input)),
  update: protectedProcedure
    .input(
      z.object({ patientId: id, revision: id, data: patientInput }).strict()
    )
    .mutation(({ ctx, input }) =>
      savePatient(ctx.user, input.data, {
        id: input.patientId,
        revision: input.revision,
      })
    ),
});
