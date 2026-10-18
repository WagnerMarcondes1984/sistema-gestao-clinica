import { Link } from "wouter";
import { FinancialLayout } from "../components/FinancialLayout";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import {
  SessionNotice,
  buttonClass,
} from "../components/patients/PatientSelector";
export default function MindOSDashboard() {
  const { user, loading, isAuthenticated } = useAuth();
  const context = trpc.scheduling.context.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const reception = trpc.scheduling.reception.useQuery(undefined, {
    enabled: isAuthenticated && Boolean(context.data?.canReceive),
    retry: false,
  });
  const patients = trpc.patients.list.useQuery(
    { pageSize: 1, status: "ACTIVE" },
    { enabled: isAuthenticated, retry: false }
  );
  return (
    <FinancialLayout
      operatorName={user?.name || "Visitante"}
      contextLabel={context.data?.clinic.name || "MindOS"}
      showFiscalBanner={false}
    >
      <div className="space-y-5">
        <h1 className="text-3xl font-bold">MindOS — rotina da clínica</h1>
        <p className="text-slate-500">
          Agenda, pacientes e recepção com dados registrados no sistema.
        </p>
        <SessionNotice loading={loading} authenticated={isAuthenticated} />
        {(context.error || patients.error || reception.error) && (
          <p role="alert" className="text-red-700">
            {context.error?.message ||
              patients.error?.message ||
              reception.error?.message}
          </p>
        )}
        {isAuthenticated && context.data && (
          <>
            <p className="text-sm text-slate-500">
              Fuso: {context.data.clinic.timezone}.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["Pacientes ativos", patients.data?.total],
                ["Sessões hoje", reception.data?.metrics.total],
                ["Aguardando", reception.data?.metrics.waiting],
                ["Concluídas hoje", reception.data?.metrics.completed],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border bg-white p-5">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="text-2xl font-bold mt-2">{value ?? "—"}</p>
                </div>
              ))}
            </div>
            <nav className="flex flex-wrap gap-3">
              <Link href="/patients" className={buttonClass}>
                Pacientes
              </Link>
              {context.data.canSchedule && (
                <Link href="/agenda" className={buttonClass}>
                  Abrir agenda
                </Link>
              )}
              {context.data.canReceive && (
                <Link href="/reception" className={buttonClass}>
                  Abrir recepção e triagem
                </Link>
              )}
              {context.data.canConfigure && (
                <Link href="/app/scheduling" className={buttonClass}>
                  Configurar agenda
                </Link>
              )}
            </nav>
          </>
        )}
      </div>
    </FinancialLayout>
  );
}
