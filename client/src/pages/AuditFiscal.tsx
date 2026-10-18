import { trpc } from "../lib/trpc";
import { FinancialLayout } from "../components/FinancialLayout";
import { useAuth } from "../_core/hooks/useAuth";
export default function AuditFiscal() {
  const auth = useAuth();
  const logs = trpc.audit.list.useQuery(
    { limit: 200 },
    { enabled: auth.isAuthenticated, retry: false }
  );
  const context = trpc.transactions.context.useQuery(undefined, {
    enabled: auth.isAuthenticated,
    retry: false,
  });
  return (
    <FinancialLayout
      showFiscalBanner={false}
      operatorName={auth.user?.name || undefined}
    >
      <div className="space-y-5">
        <h1 className="font-bold text-2xl">Auditoria financeira interna</h1>
        <p>
          Autoria e data das operações registradas no sistema. Não comprova
          confirmação bancária ou autorização fiscal. Eventos antigos podem
          descrever simulações legadas; seus textos foram preservados e precisam
          de conferência.
        </p>
        <p>
          Consulte valores, referências, datas e responsáveis. Registros legados
          exigem conferência.
        </p>
        {logs.error && <p role="alert">{logs.error.message}</p>}
        {logs.data?.map(log => (
          <article
            key={log.id}
            className="border rounded-xl bg-white p-4 text-slate-900 space-y-2"
          >
            <h2 className="font-bold">
              {log.action} • {log.transactionCode || "Caixa / operação"}
            </h2>
            <p>
              {log.operator} — conta #{log.actorUserId || "legado"} •{" "}
              {new Date(log.createdAt).toLocaleString("pt-BR", {
                timeZone: context.data?.timezone || "America/Sao_Paulo",
              })}
            </p>
            <p>{log.details}</p>
          </article>
        ))}
      </div>
    </FinancialLayout>
  );
}
