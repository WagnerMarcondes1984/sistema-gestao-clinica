import { useAuth } from "../_core/hooks/useAuth";
import { startLogin } from "../const";
import { trpc } from "../lib/trpc";
import { FinancialLayout } from "../components/FinancialLayout";
import { CheckCircle2, Clock3, ShieldCheck, RefreshCw } from "lucide-react";

export default function Readiness() {
  const auth = useAuth();
  const query = trpc.operations.status.useQuery(undefined, {
    enabled: auth.isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const date = (value: string) =>
    new Date(value).toLocaleString("pt-BR", {
      timeZone: data?.clinic.timezone || "America/Sao_Paulo",
    });
  const checks = data
    ? [
        {
          name: "Conexão com o banco",
          ok: data.checks.database,
          detail: "Consulta de disponibilidade realizada agora.",
        },
        {
          name: "Migrações do sistema",
          ok: data.checks.migrations,
          detail: "Histórico e hashes comparados aos arquivos desta versão.",
        },
        {
          name: "Armazenamento privado",
          ok: data.checks.privateStorage,
          detail: "Diretório acessível e fora dos arquivos públicos.",
        },
        {
          name: "Restauração local de backup",
          ok: !!data.recovery && !data.recovery.stale,
          detail: data.recovery
            ? `Ensaio local autenticado em ${date(data.recovery.finishedAt)}. O banco isolado foi removido.${data.recovery.stale ? " Evidência com mais de sete dias; repetir ensaio." : ""}`
            : "Nenhum ensaio local autenticado disponível nesta instalação.",
        },
      ]
    : [];
  return (
    <FinancialLayout>
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-indigo-700">
              <ShieldCheck aria-hidden="true" />
              <span className="text-sm font-semibold">Operação do MindOS</span>
            </div>
            <h1 className="text-2xl font-bold mt-2">
              Preparação para produção
            </h1>
            <p className="text-slate-600 mt-2">
              Verificações técnicas e pendências para o lançamento.
            </p>
          </div>
          {auth.isAuthenticated && (
            <button
              type="button"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              className="border rounded-xl px-4 py-2 inline-flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={16} aria-hidden="true" />
              {query.isFetching ? "Verificando…" : "Atualizar verificação"}
            </button>
          )}
        </div>
        {auth.loading ? (
          <p role="status">Conferindo sessão…</p>
        ) : !auth.isAuthenticated ? (
          <div className="rounded-xl border p-5 bg-white">
            <p>Entre com uma conta autorizada para consultar a preparação.</p>
            <button
              type="button"
              className="mt-3 rounded-lg bg-indigo-700 text-white px-4 py-2"
              onClick={() => startLogin()}
            >
              Entrar com Manus
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
              <strong>Etapa 8 em andamento · produção pendente</strong>
              <p className="mt-2 text-sm">
                O ensaio local não aprova a implantação. A liberação depende da
                infraestrutura real, dos responsáveis da clínica e da
                homologação.
              </p>
            </div>
            {query.isPending ? (
              <p role="status">Executando verificações…</p>
            ) : query.isError ? (
              <p
                role="alert"
                className="rounded-xl border border-red-200 p-5 text-red-800"
              >
                {query.error.message}
              </p>
            ) : (
              data && (
                <>
                  <p className="text-sm text-slate-600 break-words">
                    {data.clinic.name} · Ambiente{" "}
                    {data.environment === "local" ? "local" : "de produção"} ·
                    Verificado em {date(data.checkedAt)} ({data.clinic.timezone}
                    )
                  </p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {checks.map(c => (
                      <article
                        key={c.name}
                        className="rounded-xl border bg-white p-5"
                      >
                        <div className="flex gap-3 items-start">
                          {c.ok ? (
                            <CheckCircle2
                              className="text-emerald-700 shrink-0"
                              aria-hidden="true"
                            />
                          ) : (
                            <Clock3
                              className="text-amber-700 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <div>
                            <h2 className="font-semibold">{c.name}</h2>
                            <p className="text-sm font-medium mt-1">
                              {c.ok ? "Verificado" : "Requer atenção"}
                            </p>
                            <p className="text-sm text-slate-600 mt-2">
                              {c.detail}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )
            )}
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold text-lg">
                Pendências de lançamento
              </h2>
              <ul className="mt-3 space-y-3 text-sm text-slate-700 list-disc pl-5">
                <li>
                  Contratar o destino externo dos backups, definir frequência e
                  retenção e testar recuperação a partir dessa cópia.
                </li>
                <li>
                  Preparar o VPS com Docker, domínio, HTTPS, segredos e volumes
                  persistentes; testar o login Manus no endereço real.
                </li>
                <li>
                  Conectar monitoramento externo e alertas ao responsável pela
                  operação.
                </li>
                <li>
                  Definir regras de retenção, exportação e exclusão de dados com
                  os responsáveis.
                </li>
                <li>
                  Homologar com administrador, recepção, profissional,
                  financeiro e paciente; executar o piloto controlado.
                </li>
                <li>
                  Escolher e homologar provedores de pagamento, emissão fiscal,
                  e-mail e WhatsApp antes de habilitar essas integrações.
                </li>
              </ul>
            </section>
          </>
        )}
      </div>
    </FinancialLayout>
  );
}
