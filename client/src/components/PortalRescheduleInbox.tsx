import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import AppointmentForm from "./AppointmentForm";
import { buttonClass } from "./patients/PatientSelector";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
type Request = inferRouterOutputs<AppRouter>["care"]["rescheduleInbox"][number];
const labels = {
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  DECLINED: "Recusada",
  CANCELLED: "Cancelada pelo paciente",
};
export default function PortalRescheduleInbox({
  canSchedule,
}: {
  canSchedule: boolean;
}) {
  const query = trpc.care.rescheduleInbox.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });
  const sessions = trpc.scheduling.list.useQuery(
    {},
    { enabled: canSchedule, retry: false }
  );
  const [selected, setSelected] = useState<{
    request: Request;
    approve: boolean;
  } | null>(null);
  const utils = trpc.useUtils();
  const resolve = trpc.care.resolveReschedule.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.care.invalidate(),
        utils.scheduling.invalidate(),
        utils.mindos.invalidate(),
      ]);
      setSelected(null);
      toast.success("Solicitação de reagendamento resolvida.");
    },
  });
  const original = sessions.data?.items.find(
    s => s.id === selected?.request.appointmentId
  );
  return (
    <section className="rounded-2xl border bg-white p-5 space-y-3">
      <h2 className="font-bold">Reagendamentos solicitados no portal</h2>
      {query.isLoading && <p role="status">Carregando pedidos…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data?.length === 0 && (
        <p className="text-slate-500">Nenhum pedido recebido.</p>
      )}
      {query.data?.map(r => (
        <article
          key={r.id}
          className="border-t pt-3 space-y-2"
          data-reschedule-id={r.id}
        >
          <p className="font-semibold">
            Pedido #{r.id} • sessão #{r.appointmentId} • {labels[r.status]}
          </p>
          <Link
            href={`/patients/view?patientId=${r.patientId}`}
            className="text-indigo-700 underline text-sm"
          >
            Paciente #{r.patientId}
          </Link>
          <p className="text-sm">
            Preferência: {r.date.split("-").reverse().join("/")} às {r.time}{" "}
            (horário da clínica).
          </p>
          {canSchedule && r.status === "PENDING" && (
            <div className="flex gap-2">
              <button
                className={buttonClass}
                onClick={() => {
                  resolve.reset();
                  setSelected({ request: r, approve: true });
                }}
              >
                Aprovar reagendamento
              </button>
              <button
                className="border rounded-xl px-3 py-2"
                onClick={() => {
                  resolve.reset();
                  setSelected({ request: r, approve: false });
                }}
              >
                Recusar pedido
              </button>
            </div>
          )}
          {r.replacementAppointmentId && (
            <p className="text-sm">
              Nova sessão #{r.replacementAppointmentId}.
            </p>
          )}
        </article>
      ))}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={open => {
          if (!open && !resolve.isPending) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selected?.approve
                ? "Aprovar reagendamento do portal"
                : "Recusar pedido de reagendamento"}
            </DialogTitle>
            <DialogDescription>
              {selected?.approve
                ? "Confira a disponibilidade e os recursos. O pedido só será aprovado se a reserva puder ser concluída."
                : "A sessão original será mantida e o paciente verá a recusa no portal."}
            </DialogDescription>
          </DialogHeader>
          {selected?.approve ? (
            <AppointmentForm
              key={selected.request.id}
              editing
              single
              seriesAvailable={false}
              initial={{
                patientId: selected.request.patientId,
                professionalId: original?.professionalId || 0,
                unitId: original?.unitId || 0,
                serviceId: original?.serviceId || 0,
                mode: original?.mode || "IN_PERSON",
                date: selected.request.date,
                time: selected.request.time,
              }}
              busy={resolve.isPending}
              error={resolve.error?.message}
              onSubmit={appointment =>
                resolve.mutate({
                  id: selected.request.id,
                  revision: selected.request.revision,
                  approve: true,
                  appointment,
                })
              }
            />
          ) : (
            <>
              {resolve.error && <p role="alert">{resolve.error.message}</p>}
              <button
                className={buttonClass}
                disabled={resolve.isPending}
                onClick={() => {
                  if (selected)
                    resolve.mutate({
                      id: selected.request.id,
                      revision: selected.request.revision,
                      approve: false,
                    });
                }}
              >
                Confirmar recusa
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
