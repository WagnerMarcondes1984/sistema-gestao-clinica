import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { FinancialLayout } from "../components/FinancialLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import PortalRescheduleInbox from "../components/PortalRescheduleInbox";
import AppointmentForm from "../components/AppointmentForm";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import {
  SessionNotice,
  buttonClass,
} from "../components/patients/PatientSelector";
import { STATUS_LABELS } from "../../../shared/scheduling";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
type Request = inferRouterOutputs<AppRouter>["scheduling"]["requests"][number];
const requestLabels: Record<string, string> = {
  NEW: "Nova",
  CONTACTED: "Contato registrado",
  CONFIRMED: "Confirmada",
  DECLINED: "Recusada",
  SPAM: "Spam",
};
export default function Reception() {
  const { user, loading, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const queue = trpc.scheduling.reception.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    refetchInterval: 15000,
  });
  const requests = trpc.scheduling.requests.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const [selected, setSelected] = useState<Request | null>(null);
  const [pending, setPending] = useState<{
    request: Request;
    status: "CONTACTED" | "DECLINED" | "SPAM";
  } | null>(null);
  const refresh = () =>
    Promise.all([utils.scheduling.invalidate(), utils.mindos.invalidate()]);
  const checkin = trpc.scheduling.transition.useMutation({
    onSuccess: async () => {
      toast.success("Check-in registrado na sessão selecionada.");
      await refresh();
    },
    onError: e => toast.error(e.message),
  });
  const event = trpc.mindos.receptionEvent.useMutation({
    onSuccess: () =>
      toast.success(
        "Ligação realizada registrada. Nenhuma mensagem foi enviada."
      ),
    onError: e => toast.error(e.message),
  });
  const process = trpc.scheduling.processRequest.useMutation({
    onSuccess: async () => {
      await refresh();
      setSelected(null);
      setPending(null);
      toast.success("Triagem salva.");
    },
  });
  const data = queue.data;
  return (
    <FinancialLayout
      operatorName={user?.name || "Conta autenticada"}
      contextLabel={data?.clinicName || "Recepção"}
      showFiscalBanner={false}
    >
      <div className="space-y-5">
        <div className="flex justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Recepção</h1>
            <p className="text-sm text-slate-500">
              Fila de {data?.today.split("-").reverse().join("/") || "hoje"} •{" "}
              {data?.timezone || "fuso da clínica"}
            </p>
          </div>
          <Link href="/patients" className={buttonClass}>
            Buscar ou cadastrar paciente
          </Link>
        </div>
        <SessionNotice loading={loading} authenticated={isAuthenticated} />
        {isAuthenticated && (
          <>
            {queue.error && (
              <p role="alert" className="text-red-700">
                {queue.error.message}
              </p>
            )}
            {queue.isLoading && <p role="status">Carregando fila…</p>}
            {data && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ["Chegadas", data.metrics.arrivals],
                    ["Aguardando", data.metrics.waiting],
                    ["Confirmadas", data.metrics.confirmed],
                    ["Concluídas", data.metrics.completed],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="border rounded-2xl bg-white p-4"
                    >
                      <p className="text-sm text-slate-500">{label}</p>
                      <p className="text-2xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>
                <section className="rounded-2xl border bg-white p-5">
                  <h2 className="font-bold">Fila real do dia</h2>
                  <p className="text-xs text-slate-500 mt-2">
                    Sem conteúdo de prontuário. Check-in e contatos identificam
                    a sessão, não apenas o paciente.
                  </p>
                  {data.items
                    .filter(
                      a =>
                        ![
                          "CANCELLED",
                          "RESCHEDULED",
                          "NO_SHOW",
                          "COMPLETED",
                        ].includes(a.status)
                    )
                    .map(a => (
                      <article
                        key={a.id}
                        className="border-t py-4 mt-3 space-y-2"
                        data-appointment-id={a.id}
                      >
                        <div className="flex justify-between gap-2 flex-wrap">
                          <Link
                            href={`/patients/view?patientId=${a.patientId}`}
                            className="text-indigo-700 underline font-semibold"
                          >
                            {a.patient?.preferredName ||
                              a.patient?.fullName ||
                              `Paciente #${a.patientId}`}
                          </Link>
                          <span>
                            {a.local.time} • {STATUS_LABELS[a.status]} • #{a.id}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500">
                          {a.professionalName} • {a.unitName}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {data.canSchedule &&
                            ["SCHEDULED", "CONFIRMED", "ARRIVED"].includes(
                              a.status
                            ) && (
                              <button
                                className={buttonClass}
                                disabled={checkin.isPending}
                                onClick={() =>
                                  checkin.mutate({
                                    appointmentId: a.id,
                                    revision: a.revision,
                                    status: "WAITING",
                                  })
                                }
                              >
                                Check-in
                              </button>
                            )}
                          <Link
                            href={`/agenda?patientId=${a.patientId}`}
                            className="border rounded-xl px-3 py-2"
                          >
                            Abrir agenda
                          </Link>
                          <button
                            className="border rounded-xl px-3 py-2"
                            disabled={event.isPending}
                            onClick={() =>
                              event.mutate({
                                patientId: a.patientId,
                                appointmentId: a.id,
                                eventType: "CALL_LOGGED",
                              })
                            }
                          >
                            Registrar ligação realizada
                          </button>
                        </div>
                      </article>
                    ))}
                  {!data.items.some(
                    a =>
                      ![
                        "CANCELLED",
                        "RESCHEDULED",
                        "NO_SHOW",
                        "COMPLETED",
                      ].includes(a.status)
                  ) && (
                    <p className="mt-4 text-slate-500">
                      Nenhuma sessão aguardando atendimento hoje.
                    </p>
                  )}
                </section>
              </>
            )}
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="font-bold">Solicitações públicas — triagem</h2>
              <p className="text-sm text-slate-500 mt-2">
                Registre o contato feito pela equipe. Para confirmar, selecione
                um paciente existente ou cadastre-o antes. A confirmação reserva
                a sessão em transação. Não há envio automático de mensagens.
              </p>
              {requests.isLoading && (
                <p role="status">Carregando solicitações…</p>
              )}
              {requests.error && (
                <p role="alert" className="text-red-700">
                  {requests.error.message}
                </p>
              )}
              {requests.data?.length === 0 && (
                <p className="mt-4 text-slate-500">
                  Nenhuma solicitação recebida.
                </p>
              )}
              {requests.data?.map(r => (
                <article
                  key={r.id}
                  className="border-t py-4 mt-3 space-y-2"
                  data-request-id={r.id}
                >
                  <p className="font-semibold">
                    {r.name} • {requestLabels[r.status]} • #{r.id}
                  </p>
                  <p className="text-sm">
                    {r.contactChannel === "EMAIL" ? "E-mail" : "Telefone"}:{" "}
                    {r.contactValue}
                  </p>
                  <p className="text-sm text-slate-500">
                    {r.serviceType} • preferência:{" "}
                    {new Date(r.preferredDate)
                      .toISOString()
                      .slice(0, 10)
                      .split("-")
                      .reverse()
                      .join("/")}{" "}
                    às {r.preferredTime}
                  </p>
                  {data?.canSchedule && (
                    <div className="flex flex-wrap gap-2">
                      {r.status === "NEW" && (
                        <button
                          className="border rounded-xl px-3 py-2"
                          onClick={() => {
                            process.reset();
                            setPending({ request: r, status: "CONTACTED" });
                          }}
                        >
                          Registrar contato realizado
                        </button>
                      )}
                      {r.status === "CONTACTED" && (
                        <button
                          className={buttonClass}
                          onClick={() => {
                            process.reset();
                            setSelected(r);
                          }}
                        >
                          Confirmar e agendar
                        </button>
                      )}
                      {["NEW", "CONTACTED"].includes(r.status) && (
                        <>
                          <button
                            className="border rounded-xl px-3 py-2"
                            onClick={() => {
                              process.reset();
                              setPending({ request: r, status: "DECLINED" });
                            }}
                          >
                            Recusar
                          </button>
                          <button
                            className="border rounded-xl px-3 py-2"
                            onClick={() => {
                              process.reset();
                              setPending({ request: r, status: "SPAM" });
                            }}
                          >
                            Marcar spam
                          </button>
                        </>
                      )}
                      {r.appointmentId && (
                        <Link
                          href={`/agenda?patientId=${r.patientId}`}
                          className="text-indigo-700 underline"
                        >
                          Sessão #{r.appointmentId}
                        </Link>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </section>
            <PortalRescheduleInbox canSchedule={Boolean(data?.canSchedule)} />
          </>
        )}
        <Dialog
          open={Boolean(selected && isAuthenticated)}
          onOpenChange={open => {
            if (!open && !process.isPending) setSelected(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Confirmar solicitação e reservar sessão</DialogTitle>
              <DialogDescription>
                Confira os dados com o destinatário e selecione o cadastro
                correto. Não serão criados pacientes automaticamente.
              </DialogDescription>
            </DialogHeader>
            {selected && (
              <AppointmentForm
                initial={{
                  serviceId: selected.serviceId || 0,
                  date: new Date(selected.preferredDate)
                    .toISOString()
                    .slice(0, 10),
                  time: selected.preferredTime,
                }}
                busy={process.isPending}
                single
                error={process.error?.message}
                onSubmit={appointment =>
                  process.mutate({
                    requestId: selected.id,
                    revision: selected.revision,
                    status: "CONFIRMED",
                    appointment,
                  })
                }
              />
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(pending && isAuthenticated)}
          onOpenChange={open => {
            if (!open) setPending(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atualizar triagem</DialogTitle>
              <DialogDescription>
                Solicitação #{pending?.request.id}:{" "}
                {pending ? requestLabels[pending.status] : ""}. Registrar
                contato significa que a equipe já fez o contato por outro meio;
                não dispara uma mensagem.
              </DialogDescription>
            </DialogHeader>
            {process.error && (
              <p role="alert" className="text-red-700">
                {process.error.message}
              </p>
            )}
            <button
              className={buttonClass}
              disabled={process.isPending}
              onClick={() => {
                if (pending)
                  process.mutate({
                    requestId: pending.request.id,
                    revision: pending.request.revision,
                    status: pending.status,
                  });
              }}
            >
              Confirmar triagem
            </button>
          </DialogContent>
        </Dialog>
      </div>
    </FinancialLayout>
  );
}
