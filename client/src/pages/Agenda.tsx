import { useState } from "react";
import { Link } from "wouter";
import { FinancialLayout } from "../components/FinancialLayout";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import {
  PatientSelector,
  SessionNotice,
  useSelectedPatient,
  fieldClass,
  buttonClass,
} from "../components/patients/PatientSelector";

const statusLabels: Record<string, string> = {
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  ARRIVED: "Chegou",
  WAITING: "Aguardando",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Concluída",
  NO_SHOW: "Falta",
  CANCELLED: "Cancelada",
  RESCHEDULED: "Reagendada",
};
export default function Agenda() {
  const { user, loading, isAuthenticated } = useAuth();
  const { patientId, selectPatient } = useSelectedPatient();
  const [day, setDay] = useState("");
  const appointments = trpc.mindos.appointments.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const rows = (appointments.data || []).filter(
    a =>
      (!patientId || a.patientId === patientId) &&
      (!day || new Date(a.startsAt).toLocaleDateString("en-CA") === day)
  );
  return (
    <FinancialLayout
      operatorName={user?.name || "Conta autenticada"}
      contextLabel="Agenda"
      showFiscalBanner={false}
    >
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-slate-500">
            Sessões cadastradas, com filtro pelo paciente selecionado.
          </p>
        </div>
        <SessionNotice loading={loading} authenticated={isAuthenticated} />
        {isAuthenticated && (
          <>
            <PatientSelector value={patientId} onChange={selectPatient} />
            <div className="flex gap-3 items-end">
              <label className="text-sm">
                Data (horário deste navegador)
                <input
                  type="date"
                  className={fieldClass}
                  value={day}
                  onChange={e => setDay(e.target.value)}
                />
              </label>
              <button
                className={buttonClass}
                onClick={() => {
                  setDay("");
                  selectPatient(0);
                }}
              >
                Limpar filtros
              </button>
            </div>
            {appointments.isLoading && <p role="status">Carregando agenda…</p>}
            {appointments.error && (
              <p role="alert" className="text-red-700">
                {appointments.error.message}
              </p>
            )}
            {appointments.data && (
              <section className="rounded-2xl border bg-white p-5">
                <h2 className="font-bold">
                  {rows.length} sessão(ões) encontrada(s)
                </h2>
                {rows.length === 0 && (
                  <p className="mt-3 text-sm text-slate-500">
                    Nenhuma sessão cadastrada para os filtros selecionados.
                  </p>
                )}
                <div className="divide-y mt-3">
                  {rows.map(a => (
                    <article key={a.id} className="py-4 space-y-1">
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
                          {statusLabels[a.status]}
                        </span>
                      </div>
                      <p className="text-sm">
                        {new Date(a.startsAt).toLocaleString("pt-BR")} —{" "}
                        {new Date(a.endsAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-sm text-slate-500">
                        {a.professionalName} • {a.serviceType} • {a.unitName} •{" "}
                        {a.mode === "ONLINE" ? "Online" : "Presencial"}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <p className="text-sm text-slate-500">
              Criação e alteração visual de sessões, recorrências e fuso da
              clínica são os próximos itens da etapa 3.
            </p>
          </>
        )}
      </div>
    </FinancialLayout>
  );
}
