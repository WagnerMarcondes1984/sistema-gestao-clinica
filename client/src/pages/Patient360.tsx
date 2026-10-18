import { Link } from "wouter";
import { FinancialLayout } from "../components/FinancialLayout";
import {
  PatientSelector,
  SessionNotice,
  useSelectedPatient,
} from "../components/patients/PatientSelector";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import {
  CONTACT_CHANNEL_LABELS,
  PATIENT_STATUS_LABELS,
} from "../../../shared/patients";

const actions: Record<string, string> = {
  CREATE_PATIENT: "Cadastro criado",
  UPDATE_PATIENT: "Cadastro atualizado",
  CHANGE_PATIENT_STATUS: "Situação alterada",
  VIEW_PATIENT_360: "Consulta ao Paciente 360°",
  CHECK_IN: "Check-in registrado",
  CALL_LOGGED: "Ligação registrada",
  PROFILE_REVIEWED: "Cadastro revisado",
};
export default function Patient360() {
  const { user, loading, isAuthenticated } = useAuth();
  const { patientId, selectPatient } = useSelectedPatient();
  const enabled = isAuthenticated && patientId > 0;
  const profile = trpc.patients.get.useQuery(
    { patientId },
    { enabled, retry: false }
  );
  const overview = trpc.mindos.patient360.useQuery(
    { patientId },
    { enabled, retry: false }
  );
  const history = trpc.patients.history.useQuery(
    { patientId },
    { enabled, retry: false }
  );
  const access = trpc.patients.list.useQuery(
    { pageSize: 1 },
    { enabled: isAuthenticated, retry: false }
  );
  const patient = profile.data;
  const appointments = overview.data?.appointments || [];
  const next = appointments
    .filter(
      a =>
        !["CANCELLED", "RESCHEDULED", "NO_SHOW", "COMPLETED"].includes(
          a.status
        ) && new Date(a.startsAt).getTime() >= Date.now()
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )[0];
  return (
    <FinancialLayout
      operatorName={user?.name || "Conta autenticada"}
      contextLabel={access.data?.tenantName || "Paciente 360°"}
      showFiscalBanner={false}
    >
      <div className="space-y-5">
        <div>
          <Link className="text-indigo-700 underline text-sm" href="/patients">
            Voltar para pacientes
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Paciente 360°</h1>
          <p className="text-sm text-slate-500">
            Dados administrativos do paciente selecionado.
          </p>
        </div>
        <SessionNotice loading={loading} authenticated={isAuthenticated} />
        {isAuthenticated && (
          <PatientSelector value={patientId} onChange={selectPatient} />
        )}
        {enabled && profile.isLoading && (
          <p role="status">Carregando cadastro…</p>
        )}
        {enabled && (profile.error || overview.error) && (
          <p role="alert" className="text-red-700">
            {profile.error?.message || overview.error?.message}
          </p>
        )}
        {isAuthenticated && patient && !profile.error && (
          <>
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="text-xl font-bold">
                {patient.preferredName || patient.fullName}
              </h2>
              <p className="text-sm text-slate-500">
                {patient.fullName} • Cadastro #{patient.id} •{" "}
                {PATIENT_STATUS_LABELS[patient.administrativeStatus]}
              </p>
              <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {[
                  ["E-mail", patient.email || "Não informado"],
                  ["Telefone", patient.phone || "Não informado"],
                  [
                    "Nascimento",
                    patient.birthDate
                      ? patient.birthDate.split("-").reverse().join("/")
                      : "Não informado",
                  ],
                  [
                    "Canal preferido",
                    CONTACT_CHANNEL_LABELS[patient.preferredChannel],
                  ],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-slate-500">{key}</dt>
                    <dd className="mt-1 font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 flex flex-wrap gap-4">
                {access.data?.canSchedule && (
                  <Link
                    className="text-indigo-700 underline"
                    href={`/agenda?patientId=${patientId}`}
                  >
                    Abrir agenda deste paciente
                  </Link>
                )}
                {access.data?.canViewClinical && (
                  <Link
                    className="text-indigo-700 underline"
                    href={`/clinical-records?patientId=${patientId}`}
                  >
                    Abrir prontuário
                  </Link>
                )}
              </div>
            </section>
            {access.data?.canSchedule && (
              <section className="rounded-2xl border bg-white p-5">
                <h2 className="font-bold">Agenda do paciente</h2>
                <p className="text-sm text-slate-500 mt-2">
                  {appointments.filter(a => a.status === "COMPLETED").length}{" "}
                  sessão(ões) concluída(s). Próxima sessão:{" "}
                  {next
                    ? new Date(next.startsAt).toLocaleString("pt-BR", {
                        timeZone: access.data?.timezone || "America/Sao_Paulo",
                      })
                    : "nenhuma sessão futura"}
                  .
                </p>
                <div className="mt-3 space-y-2">
                  {appointments.map(a => (
                    <div key={a.id} className="border-t pt-2 text-sm">
                      {new Date(a.startsAt).toLocaleString("pt-BR", {
                        timeZone: access.data?.timezone || "America/Sao_Paulo",
                      })}{" "}
                      • {a.professionalName} • {a.serviceType} • {a.status}
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="font-bold">Atividade administrativa recente</h2>
              {history.isLoading && <p role="status">Carregando atividade…</p>}
              {history.error && (
                <p role="alert" className="text-red-700">
                  {history.error.message}
                </p>
              )}
              <ul className="mt-3 space-y-2 text-sm">
                {history.data?.map(e => (
                  <li key={e.id}>
                    {actions[e.action] || "Ação administrativa registrada"} •{" "}
                    {new Date(e.createdAt).toLocaleString("pt-BR", {
                      timeZone: access.data?.timezone || "America/Sao_Paulo",
                    })}
                  </li>
                ))}
              </ul>
              {history.data?.length === 0 && (
                <p className="mt-3 text-sm text-slate-500">
                  Nenhuma atividade registrada.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </FinancialLayout>
  );
}
