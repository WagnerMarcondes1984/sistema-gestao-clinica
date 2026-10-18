import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "../_core/hooks/useAuth";
import { startLogin } from "../const";
import { trpc } from "../lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  buttonClass,
  fieldClass,
} from "../components/patients/PatientSelector";
import { STATUS_LABELS } from "../../../shared/scheduling";
const labels = {
  ACCEPTED: "Aceito",
  DECLINED: "Não aceito",
  WITHDRAWN: "Aceite retirado",
};
export default function PatientPortal() {
  const { isAuthenticated, loading, logout } = useAuth();
  const query = trpc.mindos.portalData.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    refetchInterval: 15000,
  });
  const data = query.data;
  const [tab, setTab] = useState("schedule"),
    [reschedule, setReschedule] = useState<{
      id: number;
      date: string;
      time: string;
    } | null>(null),
    [consent, setConsent] = useState<{
      id: number;
      title: string;
      body: string;
      hash: string;
      decision: "ACCEPTED" | "DECLINED" | "WITHDRAWN";
    } | null>(null),
    [acknowledged, setAcknowledged] = useState(false);
  const refresh = () => query.refetch();
  const request = trpc.care.requestReschedule.useMutation({
    onSuccess: () => {
      setReschedule(null);
      refresh();
    },
  });
  const cancel = trpc.care.cancelReschedule.useMutation({ onSuccess: refresh });
  const decide = trpc.care.decideConsent.useMutation({
    onSuccess: () => {
      setConsent(null);
      setAcknowledged(false);
      refresh();
    },
  });
  const zone = data?.clinic.timezone || "America/Sao_Paulo";
  const format = (date: Date) =>
    new Date(date).toLocaleString("pt-BR", {
      timeZone: zone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="px-5 sm:px-8 py-4 bg-white border-b flex justify-between gap-4">
        <Link href="/" className="font-bold">
          MindOS · Portal do paciente
        </Link>
        {isAuthenticated && (
          <button
            onClick={() => void logout()}
            className="text-indigo-700 font-semibold"
          >
            Sair
          </button>
        )}
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <h1 className="text-2xl font-bold">
          {data && isAuthenticated
            ? `Olá, ${data.patient.preferredName || data.patient.fullName}`
            : "Portal do paciente"}
        </h1>
        <p className="text-sm text-slate-500">
          Informações liberadas pela clínica para seu cadastro.
        </p>
        {loading ? (
          <p role="status">Verificando acesso…</p>
        ) : !isAuthenticated ? (
          <section className="border rounded-2xl bg-white p-6 space-y-4">
            <p>Entre com sua conta para consultar seus dados.</p>
            <button className={buttonClass} onClick={startLogin}>
              Entrar
            </button>
          </section>
        ) : query.isLoading ? (
          <p role="status">Carregando informações liberadas…</p>
        ) : query.error ? (
          <section
            role="alert"
            className="border rounded-2xl bg-white p-6 space-y-3"
          >
            <p>
              Não foi possível abrir o portal. Confirme com a clínica se sua
              conta está vinculada ao cadastro de paciente.
            </p>
            <p className="text-sm text-slate-500">{query.error.message}</p>
            <button className={buttonClass} onClick={() => query.refetch()}>
              Tentar novamente
            </button>
          </section>
        ) : data ? (
          <>
            <p className="text-sm text-slate-500">
              {data.clinic.name} • fuso: {zone}
            </p>
            <nav
              aria-label="Seções do portal"
              className="rounded-2xl bg-white border p-2 flex gap-2 overflow-x-auto"
            >
              {[
                ["schedule", "Agenda"],
                ["documents", "Documentos"],
                ["consents", "Consentimentos"],
                ["financial", "Financeiro"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-current={tab === id ? "page" : undefined}
                  className={`px-4 py-2 rounded-xl font-semibold ${tab === id ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <section className="border rounded-2xl bg-white p-6 space-y-4">
              {tab === "schedule" && (
                <>
                  <h2 className="font-bold">Minhas sessões</h2>
                  {data.appointments.length === 0 && (
                    <p>Nenhuma sessão cadastrada.</p>
                  )}
                  {data.appointments.map(a => (
                    <article
                      key={a.id}
                      className="border-t pt-3 space-y-2"
                      data-portal-appointment-id={a.id}
                    >
                      <p className="font-semibold">
                        {format(a.startsAt)} • {STATUS_LABELS[a.status]}
                      </p>
                      <p className="text-sm">
                        {a.mode === "ONLINE" ? "Online" : "Presencial"}
                      </p>
                      {new Date(a.startsAt) > new Date() &&
                        ["SCHEDULED", "CONFIRMED"].includes(a.status) && (
                          <button
                            className="border rounded-xl px-3 py-2"
                            disabled={data.rescheduleRequests.some(
                              r =>
                                r.appointmentId === a.id &&
                                r.status === "PENDING"
                            )}
                            onClick={() => {
                              request.reset();
                              const parts = new Intl.DateTimeFormat("en-CA", {
                                timeZone: zone,
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                              }).format(new Date(a.startsAt));
                              setReschedule({
                                id: a.id,
                                date: parts,
                                time: "09:00",
                              });
                            }}
                          >
                            Solicitar reagendamento
                          </button>
                        )}
                    </article>
                  ))}
                  <h3 className="font-bold pt-4">
                    Meus pedidos de reagendamento
                  </h3>
                  {data.rescheduleRequests.length === 0 && (
                    <p className="text-sm text-slate-500">
                      Nenhum pedido registrado.
                    </p>
                  )}
                  {data.rescheduleRequests.map(r => (
                    <div key={r.id} className="border-t pt-3 space-y-2">
                      <p className="text-sm">
                        Pedido #{r.id} • sessão #{r.appointmentId} •{" "}
                        {r.date.split("-").reverse().join("/")} às {r.time} •{" "}
                        {r.status === "PENDING"
                          ? "Aguardando equipe"
                          : r.status === "APPROVED"
                            ? "Aprovado"
                            : r.status === "DECLINED"
                              ? "Recusado"
                              : "Cancelado"}
                      </p>
                      {r.status === "PENDING" && (
                        <button
                          className="text-indigo-700 underline"
                          disabled={cancel.isPending}
                          onClick={() => cancel.mutate({ id: r.id })}
                        >
                          Cancelar solicitação
                        </button>
                      )}
                      {r.replacementAppointmentId && (
                        <p className="text-sm">
                          Nova sessão #{r.replacementAppointmentId}.
                        </p>
                      )}
                    </div>
                  ))}
                  {cancel.error && (
                    <p role="alert" className="text-red-700">
                      {cancel.error.message}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    A preferência solicitada não altera a sessão até a aprovação
                    da equipe. Teleatendimento integrado não está disponível
                    nesta entrega; combine o atendimento online diretamente com
                    a clínica.
                  </p>
                </>
              )}
              {tab === "documents" && (
                <>
                  <h2 className="font-bold">Documentos liberados</h2>
                  {data.documents.length === 0 && (
                    <p>Nenhum documento liberado pela clínica.</p>
                  )}
                  {data.documents.map(d => (
                    <article key={d.id} className="border-t pt-3 space-y-2">
                      <p className="font-semibold">
                        {d.title} • versão {d.version}
                      </p>
                      {d.hasFile ? (
                        <a
                          className="inline-block border rounded-xl px-3 py-2 text-indigo-700"
                          href={`/api/private-documents/${d.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Baixar documento
                        </a>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Registro legado sem arquivo disponível.
                        </p>
                      )}
                    </article>
                  ))}
                </>
              )}
              {tab === "consents" && (
                <>
                  <h2 className="font-bold">Consentimentos</h2>
                  <p className="text-sm text-slate-500">
                    Leia o texto integral antes de registrar sua decisão. O
                    aceite identifica sua conta e a versão do termo.
                  </p>
                  {data.consents.length === 0 && (
                    <p>Nenhum termo publicado no momento.</p>
                  )}
                  {data.consents.map(t => (
                    <article
                      key={t.id}
                      className="border-t pt-3 space-y-3"
                      data-portal-consent-id={t.id}
                    >
                      <h3 className="font-semibold">
                        {t.title} • v{t.version}
                      </h3>
                      <p className="whitespace-pre-wrap text-sm">{t.body}</p>
                      <p className="text-sm">
                        {t.decision
                          ? labels[t.decision]
                          : "Aguardando sua decisão"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {t.decision !== "ACCEPTED" ? (
                          <>
                            <button
                              className={buttonClass}
                              onClick={() => {
                                decide.reset();
                                setAcknowledged(false);
                                setConsent({
                                  id: t.id,
                                  title: t.title,
                                  body: t.body,
                                  hash: t.bodyHash,
                                  decision: "ACCEPTED",
                                });
                              }}
                            >
                              Aceitar termo
                            </button>
                            <button
                              className="border rounded-xl px-3 py-2"
                              onClick={() => {
                                decide.reset();
                                setAcknowledged(false);
                                setConsent({
                                  id: t.id,
                                  title: t.title,
                                  body: t.body,
                                  hash: t.bodyHash,
                                  decision: "DECLINED",
                                });
                              }}
                            >
                              Não aceitar
                            </button>
                          </>
                        ) : (
                          <button
                            className="border rounded-xl px-3 py-2"
                            onClick={() => {
                              decide.reset();
                              setAcknowledged(false);
                              setConsent({
                                id: t.id,
                                title: t.title,
                                body: t.body,
                                hash: t.bodyHash,
                                decision: "WITHDRAWN",
                              });
                            }}
                          >
                            Retirar aceite
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                  <h3 className="font-bold pt-4">Histórico de decisões</h3>
                  {data.consentHistory.length === 0 && (
                    <p>Nenhuma decisão registrada.</p>
                  )}
                  {data.consentHistory.map(d => {
                    const snapshot = JSON.parse(d.snapshotJson) as {
                      title: string;
                      version: number;
                      body: string;
                    };
                    const active =
                      data.consentHistory
                        .filter(e => e.templateId === d.templateId)
                        .at(-1)?.id === d.id && d.decision === "ACCEPTED";
                    return (
                      <details key={d.id} className="border-t pt-3">
                        <summary>
                          {snapshot.title} • v{snapshot.version} •{" "}
                          {labels[d.decision]} • {format(d.decidedAt)}
                        </summary>
                        <p className="whitespace-pre-wrap text-sm mt-2">
                          {snapshot.body}
                        </p>
                        <p className="text-xs text-slate-500 break-all mt-2">
                          Evidência: {d.evidenceHash}
                        </p>
                        {active &&
                          !data.consents.some(t => t.id === d.templateId) && (
                            <button
                              className="border rounded-xl px-3 py-2 mt-3"
                              onClick={() => {
                                decide.reset();
                                setAcknowledged(false);
                                setConsent({
                                  id: d.templateId,
                                  title: snapshot.title,
                                  body: snapshot.body,
                                  hash: d.bodyHash,
                                  decision: "WITHDRAWN",
                                });
                              }}
                            >
                              Retirar aceite desta versão
                            </button>
                          )}
                      </details>
                    );
                  })}
                </>
              )}
              {tab === "financial" && (
                <>
                  <h2 className="font-bold">Financeiro</h2>
                  <p className="text-sm text-slate-500">
                    Lançamentos internos vinculados ao seu cadastro e liberados
                    pela equipe. Pagamentos e comprovantes bancários dependem da
                    integração financeira.
                  </p>
                  {data.financial.length === 0 && (
                    <p>Nenhuma cobrança liberada para consulta.</p>
                  )}
                  {data.financial.map(f => (
                    <article key={f.id} className="border-t pt-3 space-y-1">
                      <p className="font-semibold">
                        {f.code} • {f.title}
                      </p>
                      <p>
                        {(f.totalAmount / 100).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}{" "}
                        • Situação interna: {f.status}
                        {f.ledgerVersion !== 1 && " • Legado não conferido"}
                      </p>
                      <p className="text-sm text-slate-500">
                        Recebido líquido registrado:{" "}
                        {(
                          (f.paidAmount - f.refundedAmount) /
                          100
                        ).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}{" "}
                        • Vencimento: {format(f.dueDate)}
                      </p>
                    </article>
                  ))}
                </>
              )}
            </section>
          </>
        ) : null}
        <Dialog
          open={Boolean(reschedule && isAuthenticated)}
          onOpenChange={open => {
            if (!open && !request.isPending) setReschedule(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Solicitar reagendamento</DialogTitle>
              <DialogDescription>
                Informe uma preferência no fuso da clínica. A equipe irá
                conferir a disponibilidade antes de alterar sua sessão.
              </DialogDescription>
            </DialogHeader>
            {reschedule && (
              <form
                className="space-y-3"
                onSubmit={e => {
                  e.preventDefault();
                  request.mutate({
                    appointmentId: reschedule.id,
                    date: reschedule.date,
                    time: reschedule.time,
                  });
                }}
              >
                <label className="block text-sm">
                  Nova data
                  <input
                    id="portal-request-date"
                    type="date"
                    required
                    className={fieldClass}
                    value={reschedule.date}
                    onChange={e =>
                      setReschedule({ ...reschedule, date: e.target.value })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Horário de preferência
                  <input
                    id="portal-request-time"
                    type="time"
                    required
                    className={fieldClass}
                    value={reschedule.time}
                    onChange={e =>
                      setReschedule({ ...reschedule, time: e.target.value })
                    }
                  />
                </label>
                {request.error && (
                  <p role="alert" className="text-red-700">
                    {request.error.message}
                  </p>
                )}
                <button className={buttonClass} disabled={request.isPending}>
                  Enviar solicitação
                </button>
              </form>
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(consent && isAuthenticated)}
          onOpenChange={open => {
            if (!open && !decide.isPending) setConsent(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {consent?.decision === "ACCEPTED"
                  ? "Confirmar aceite"
                  : consent?.decision === "DECLINED"
                    ? "Registrar não aceite"
                    : "Retirar aceite"}
              </DialogTitle>
              <DialogDescription>
                A decisão será registrada com sua identidade autenticada, a
                versão do texto e a data do servidor.
              </DialogDescription>
            </DialogHeader>
            <p className="font-semibold">{consent?.title}</p>
            <p className="text-sm whitespace-pre-wrap">{consent?.body}</p>
            <label className="flex gap-2 text-sm">
              <input
                id="portal-consent-ack"
                type="checkbox"
                checked={acknowledged}
                onChange={e => setAcknowledged(e.target.checked)}
              />{" "}
              Li o texto e confirmo esta decisão.
            </label>
            {decide.error && (
              <p role="alert" className="text-red-700">
                {decide.error.message}
              </p>
            )}
            <button
              className={buttonClass}
              disabled={!acknowledged || decide.isPending}
              onClick={() => {
                if (consent)
                  decide.mutate({
                    templateId: consent.id,
                    bodyHash: consent.hash,
                    decision: consent.decision,
                    acknowledged,
                  });
              }}
            >
              Confirmar decisão
            </button>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
