import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { FinancialLayout } from "../components/FinancialLayout";
import AppointmentForm from "../components/AppointmentForm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import {
  PatientSelector,
  SessionNotice,
  useSelectedPatient,
  fieldClass,
  buttonClass,
} from "../components/patients/PatientSelector";
import {
  STATUS_LABELS,
  TRANSITIONS,
  clinicParts,
} from "../../../shared/scheduling";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
type Session =
  inferRouterOutputs<AppRouter>["scheduling"]["list"]["items"][number];
export default function Agenda() {
  const { user, loading, isAuthenticated } = useAuth();
  const { patientId, selectPatient } = useSelectedPatient();
  const context = trpc.scheduling.context.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const zone = context.data?.clinic.timezone || "America/Sao_Paulo";
  const [day, setDay] = useState("");
  const [allDates, setAllDates] = useState(false);
  const [professional, setProfessional] = useState(0);
  const selectedDate = allDates
    ? undefined
    : day || clinicParts(new Date(), zone).date;
  const query = trpc.scheduling.list.useQuery(
    { date: selectedDate, patientId: patientId || undefined },
    {
      enabled: isAuthenticated && Boolean(context.data),
      retry: false,
      refetchInterval: 15000,
    }
  );
  const [editor, setEditor] = useState<{ session?: Session } | null>(null);
  const [action, setAction] = useState<{
    session: Session;
    status:
      | "CONFIRMED"
      | "WAITING"
      | "IN_PROGRESS"
      | "COMPLETED"
      | "CANCELLED"
      | "NO_SHOW";
  } | null>(null);
  const utils = trpc.useUtils();
  const refresh = () =>
    Promise.all([utils.scheduling.invalidate(), utils.mindos.invalidate()]);
  const create = trpc.scheduling.create.useMutation({
    onSuccess: async () => {
      setEditor(null);
      toast.success("Agendamento salvo.");
      await refresh();
    },
  });
  const move = trpc.scheduling.reschedule.useMutation({
    onSuccess: async () => {
      setEditor(null);
      toast.success("Reagendamento salvo. Histórico preservado.");
      await refresh();
    },
  });
  const transition = trpc.scheduling.transition.useMutation({
    onSuccess: async () => {
      setAction(null);
      toast.success("Situação da sessão atualizada.");
      await refresh();
    },
    onError: () => query.refetch(),
  });
  const rows = (query.data?.items || []).filter(
    a => !professional || a.professionalId === professional
  );
  const openEditor = (session?: Session) => {
    create.reset();
    move.reset();
    setEditor({ session });
  };
  return (
    <FinancialLayout
      operatorName={user?.name || "Conta autenticada"}
      contextLabel={context.data?.clinic.name || "Agenda"}
      showFiscalBanner={false}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-3 justify-between">
          <div>
            <h1 className="text-2xl font-bold">Agenda</h1>
            <p className="text-sm text-slate-500">
              Horários no fuso da clínica: {zone}.
            </p>
          </div>
          {context.data?.canSchedule && (
            <button className={buttonClass} onClick={() => openEditor()}>
              Novo agendamento
            </button>
          )}
        </div>
        <SessionNotice loading={loading} authenticated={isAuthenticated} />
        {isAuthenticated && (
          <>
            <PatientSelector value={patientId} onChange={selectPatient} />
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-sm">
                Data na clínica
                <input
                  type="date"
                  className={fieldClass}
                  value={selectedDate || ""}
                  onChange={e => {
                    setDay(e.target.value);
                    setAllDates(!e.target.value);
                  }}
                />
              </label>
              <label className="text-sm">
                Profissional
                <select
                  className={fieldClass}
                  value={professional}
                  onChange={e => setProfessional(Number(e.target.value))}
                >
                  <option value={0}>Todos</option>
                  {context.data?.professionals.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={buttonClass}
                onClick={() => {
                  setDay("");
                  setAllDates(true);
                  setProfessional(0);
                  selectPatient(0);
                }}
              >
                Todas as datas
              </button>
              <button
                className="rounded-xl border px-4 py-2.5"
                onClick={() => {
                  setAllDates(false);
                  setDay("");
                }}
              >
                Hoje
              </button>
              <Link
                href="/app/scheduling"
                className="text-indigo-700 underline py-2"
              >
                Configuração da agenda
              </Link>
            </div>
            {(query.isLoading || context.isLoading) && (
              <p role="status">Carregando agenda…</p>
            )}
            {(query.error || context.error) && (
              <p role="alert" className="text-red-700">
                {query.error?.message || context.error?.message}
              </p>
            )}
            {query.data && (
              <section className="rounded-2xl border bg-white p-5">
                <h2 className="font-bold">
                  {rows.length} sessão(ões) encontrada(s)
                </h2>
                {rows.length === 0 && (
                  <p className="mt-3 text-slate-500">
                    Nenhuma sessão cadastrada para os filtros selecionados.
                  </p>
                )}
                <div className="divide-y mt-3">
                  {rows.map(a => (
                    <article
                      key={a.id}
                      className="py-4 space-y-2"
                      data-appointment-id={a.id}
                    >
                      <div className="flex justify-between flex-wrap gap-2">
                        <Link
                          className="font-bold text-indigo-700 underline"
                          href={`/patients/view?patientId=${a.patientId}`}
                        >
                          {a.patient?.preferredName ||
                            a.patient?.fullName ||
                            `Paciente #${a.patientId}`}
                        </Link>
                        <span className="text-sm">
                          {STATUS_LABELS[a.status]} • #{a.id}
                          {a.recurrenceId ? " • Recorrente" : ""}
                        </span>
                      </div>
                      <p className="text-sm">
                        {a.local.date.split("-").reverse().join("/")} às{" "}
                        {a.local.time} •{" "}
                        {Math.round(
                          (new Date(a.endsAt).getTime() -
                            new Date(a.startsAt).getTime()) /
                            60000
                        )}{" "}
                        min
                      </p>
                      <p className="text-sm text-slate-500">
                        {a.professionalName} • {a.serviceType} • {a.unitName} •{" "}
                        {a.mode === "ONLINE" ? "Online" : "Presencial"}
                      </p>
                      {a.replacedByAppointmentId && (
                        <p className="text-xs text-slate-500">
                          Substituída pela sessão #{a.replacedByAppointmentId}.
                        </p>
                      )}
                      {query.data.canSchedule && (
                        <div className="flex flex-wrap gap-2">
                          {(TRANSITIONS[a.status] || [])
                            .filter(
                              status =>
                                status !== "WAITING" ||
                                a.local.date === query.data.today
                            )
                            .filter(
                              status =>
                                status !== "NO_SHOW" ||
                                new Date(a.endsAt) <= new Date()
                            )
                            .filter(
                              status =>
                                !["IN_PROGRESS", "COMPLETED"].includes(
                                  status
                                ) || new Date(a.startsAt) <= new Date()
                            )
                            .map(status => (
                              <button
                                key={status}
                                className="border rounded-lg px-3 py-1.5 text-sm"
                                onClick={() => {
                                  transition.reset();
                                  setAction({
                                    session: a,
                                    status: status as NonNullable<
                                      typeof action
                                    >["status"],
                                  });
                                }}
                              >
                                {status === "WAITING"
                                  ? "Check-in"
                                  : STATUS_LABELS[status]}
                              </button>
                            ))}
                          {["SCHEDULED", "CONFIRMED"].includes(a.status) &&
                            new Date(a.startsAt) > new Date() && (
                              <button
                                className="border rounded-lg px-3 py-1.5 text-sm"
                                onClick={() => openEditor(a)}
                              >
                                Reagendar
                              </button>
                            )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        <Dialog
          open={Boolean(editor && isAuthenticated)}
          onOpenChange={open => {
            if (!open && !create.isPending && !move.isPending) setEditor(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editor?.session ? "Reagendar sessão" : "Novo agendamento"}
              </DialogTitle>
              <DialogDescription>
                Escolha recursos cadastrados e um horário disponível na clínica.
              </DialogDescription>
            </DialogHeader>
            {editor && (
              <AppointmentForm
                key={editor.session?.id || "new"}
                editing={Boolean(editor.session)}
                seriesAvailable={Boolean(editor.session?.recurrenceId)}
                initial={
                  editor.session
                    ? {
                        patientId: editor.session.patientId,
                        professionalId: editor.session.professionalId || 0,
                        unitId: editor.session.unitId || 0,
                        serviceId: editor.session.serviceId || 0,
                        mode: editor.session.mode,
                        date: editor.session.local.date,
                        time: editor.session.local.time,
                      }
                    : { patientId, date: clinicParts(new Date(), zone).date }
                }
                busy={create.isPending || move.isPending}
                error={create.error?.message || move.error?.message}
                onSubmit={(data, scope) => {
                  if (editor.session)
                    move.mutate({
                      appointmentId: editor.session.id,
                      revision: editor.session.revision,
                      scope,
                      data,
                    });
                  else create.mutate(data);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(action && isAuthenticated)}
          onOpenChange={open => {
            if (!open) setAction(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Alterar situação da sessão</DialogTitle>
              <DialogDescription>
                Sessão #{action?.session.id}:{" "}
                {action ? STATUS_LABELS[action.session.status] : ""} →{" "}
                {action ? STATUS_LABELS[action.status] : ""}. Esta ação ficará
                na auditoria.
              </DialogDescription>
            </DialogHeader>
            {transition.error && (
              <p role="alert" className="text-red-700">
                {transition.error.message}
              </p>
            )}
            <button
              className={buttonClass}
              disabled={transition.isPending}
              onClick={() => {
                if (action)
                  transition.mutate({
                    appointmentId: action.session.id,
                    revision: action.session.revision,
                    status: action.status,
                  });
              }}
            >
              Confirmar alteração
            </button>
          </DialogContent>
        </Dialog>
      </div>
    </FinancialLayout>
  );
}
