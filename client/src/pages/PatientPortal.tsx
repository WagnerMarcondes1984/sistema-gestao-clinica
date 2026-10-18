import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "../_core/hooks/useAuth";
import { startLogin } from "../const";
import { trpc } from "../lib/trpc";
import {
  CalendarDays,
  FileCheck2,
  FileText,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

const tabs = [
  { id: "schedule", label: "Agenda", Icon: CalendarDays },
  { id: "documents", label: "Documentos", Icon: FileText },
  { id: "consents", label: "Consentimentos", Icon: FileCheck2 },
  { id: "financial", label: "Financeiro", Icon: ShieldCheck },
] as const;
type Tab = (typeof tabs)[number]["id"];

export default function PatientPortal() {
  const { isAuthenticated, loading, logout } = useAuth();
  const portalQuery = trpc.mindos.portalData.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const [tab, setTab] = useState<Tab>("schedule");
  const data = portalQuery.data;
  const appointment = data?.appointments
    .filter(
      item =>
        new Date(item.startsAt).getTime() >= Date.now() &&
        ["SCHEDULED", "CONFIRMED"].includes(item.status)
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="px-5 sm:px-8 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-indigo-600" aria-hidden="true" />
          <span className="font-extrabold text-slate-900">
            MindOS · Portal do paciente
          </span>
        </Link>
        {isAuthenticated && (
          <button
            onClick={() => void logout()}
            className="text-sm font-semibold text-indigo-700"
          >
            Sair
          </button>
        )}
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <h1 className="text-2xl font-extrabold text-slate-900">
          {data
            ? `Olá, ${data.patient.preferredName || data.patient.fullName}`
            : "Portal do paciente"}
        </h1>
        <p className="text-sm text-slate-500">
          Acompanhe as informações liberadas pela clínica para o seu cadastro.
        </p>
        {loading ? (
          <p role="status">Verificando acesso…</p>
        ) : !isAuthenticated ? (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <p className="text-sm text-slate-600">
              Entre com sua conta para consultar seus dados.
            </p>
            <button
              onClick={startLogin}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold"
            >
              Entrar
            </button>
          </section>
        ) : portalQuery.isLoading ? (
          <p role="status">Carregando informações liberadas…</p>
        ) : portalQuery.isError ? (
          <section
            role="alert"
            className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
          >
            <p className="text-sm text-slate-700">
              Não foi possível abrir o portal. Confirme com a clínica se sua
              conta está vinculada ao cadastro de paciente.
            </p>
            <button
              onClick={() => void portalQuery.refetch()}
              className="text-sm font-semibold text-indigo-700"
            >
              Tentar novamente
            </button>
          </section>
        ) : data ? (
          <>
            <nav
              aria-label="Seções do portal"
              className="bg-white rounded-2xl border border-slate-200 p-2 flex gap-1 overflow-x-auto"
            >
              {tabs.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap ${tab === id ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </nav>
            <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              {tab === "schedule" && (
                <>
                  <h2 className="font-bold text-slate-900">Próxima sessão</h2>
                  {appointment ? (
                    <div className="rounded-xl bg-indigo-50 p-4 space-y-2">
                      <p className="font-semibold">
                        {new Date(appointment.startsAt).toLocaleString(
                          "pt-BR",
                          { dateStyle: "medium", timeStyle: "short" }
                        )}
                      </p>
                      <p className="text-sm text-slate-600">
                        {appointment.mode === "ONLINE"
                          ? "Online"
                          : "Presencial"}{" "}
                        ·{" "}
                        {appointment.status === "CONFIRMED"
                          ? "Confirmada"
                          : "Agendada"}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Nenhuma sessão futura confirmada ou agendada.
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    Para reagendamento e acesso ao teleatendimento, entre em
                    contato com a clínica.
                  </p>
                </>
              )}
              {tab === "documents" && (
                <>
                  <h2 className="font-bold text-slate-900">
                    Documentos liberados
                  </h2>
                  {data.documents.length ? (
                    <ul className="space-y-2">
                      {data.documents.map(document => (
                        <li
                          key={document.id}
                          className="rounded-xl bg-slate-50 p-4 text-sm"
                        >
                          <span className="font-semibold">
                            {document.title}
                          </span>
                          <span className="text-slate-500">
                            {" "}
                            · versão {document.version}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Nenhum documento liberado pela clínica.
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    O download de arquivos ainda está em implementação.
                  </p>
                </>
              )}
              {tab === "consents" && (
                <>
                  <h2 className="font-bold text-slate-900">Consentimentos</h2>
                  <p className="text-sm text-slate-500">
                    A consulta e assinatura de consentimentos pelo portal ainda
                    estão em implementação.
                  </p>
                </>
              )}
              {tab === "financial" && (
                <>
                  <h2 className="font-bold text-slate-900">Financeiro</h2>
                  <p className="text-sm text-slate-500">
                    A consulta de cobranças e comprovantes pelo portal ainda
                    está em implementação.
                  </p>
                </>
              )}
            </section>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <LockKeyhole className="w-4 h-4" aria-hidden="true" /> Acesso
              restrito ao paciente vinculado à conta.
            </p>
          </>
        ) : (
          <p role="status">Nenhuma informação disponível.</p>
        )}
      </main>
    </div>
  );
}
