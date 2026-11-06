import { useState, type FormEvent } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  TrendingUp,
  Target,
  Handshake,
  CircleDollarSign,
  Plus,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { useAuth } from "../_core/hooks/useAuth";
import { FinancialLayout } from "../components/FinancialLayout";
import {
  SessionNotice,
  buttonClass,
} from "../components/patients/PatientSelector";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  Field,
  Select,
  Textarea,
  Panel,
  brl,
  moneyInput,
  proposalLabels,
} from "../components/commercial/Fields";
import {
  SALES_STAGES,
  SALES_LABELS,
  SALES_TRANSITIONS,
  SOURCE_LABELS,
  parseCommercialMoney,
  type commercialFilter,
} from "../../../shared/commercial";
import { clinicParts } from "../../../shared/scheduling";
import type { z } from "zod";
type Filters = z.input<typeof commercialFilter>;
type Modal = {
  kind: "create" | "edit" | "move" | "proposal" | "decision" | "goal" | "rule";
  id?: number;
  revision?: number;
  status?: "PRESENTED" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  ownerUserId?: number;
  amount?: number;
  name?: string;
  stage?: string;
  channel?: string;
  delayDays?: number;
  enabled?: boolean;
};
function printProposal(
  p: {
    id: number;
    version: number;
    title: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    total: number;
    validUntil: string;
    terms: string;
    status: string;
  },
  clinic: string,
  lead: string
) {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      c =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!
    );
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Proposta ${p.id}</title><style>body{font:16px/1.6 system-ui;max-width:760px;margin:50px auto;padding:20px;color:#172033}h1{color:#4338ca}pre{white-space:pre-wrap;font:inherit}section{border-block:1px solid #ddd;padding:20px 0}small{color:#555}</style><h1>${escape(clinic)}</h1><h2>Proposta #${p.id} • versão ${p.version}</h2><p>Destinatário: ${escape(lead)}</p><p>${escape(p.title)}</p><section><p>Quantidade: ${p.quantity} • Valor unitário: ${brl(p.unitPrice)}</p><p>Desconto: ${brl(p.discount)}</p><h2>Total: ${brl(p.total)}</h2><p>Válida até: ${escape(p.validUntil)} • Situação: ${proposalLabels[p.status]}</p></section><h3>Condições administrativas</h3><pre>${escape(p.terms)}</pre><small>Documento administrativo. Não comprova pagamento, nota fiscal ou assinatura do destinatário. O aceite registrado pela equipe não é assinatura digital.</small></html>`;
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" })
  );
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export default function Commercial() {
  const auth = useAuth(),
    utils = trpc.useUtils();
  const [filters, setFilters] = useState<Filters>({ page: 0 }),
    [tab, setTab] = useState("pipeline"),
    [selected, setSelected] = useState<number | null>(null),
    [modal, setModal] = useState<Modal | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID()),
    [month, setMonth] = useState("");
  const query = trpc.commercial.overview.useQuery(filters, {
      enabled: auth.isAuthenticated,
      retry: false,
      placeholderData: keepPreviousData,
    }),
    data = query.data;
  const zone = data?.timezone || "America/Sao_Paulo",
    currentMonth = month || clinicParts(new Date(), zone).date.slice(0, 7);
  const details = trpc.commercial.detail.useQuery(
    { opportunityId: selected || 0 },
    { enabled: !!data && !!selected, retry: false }
  );
  const reports = trpc.commercial.report.useQuery(
    {
      month: currentMonth,
      ownerUserId: filters.ownerUserId,
      source: filters.source,
    },
    { enabled: !!data && tab === "reports", retry: false }
  );
  const settings = trpc.commercial.settings.useQuery(undefined, {
    enabled: !!data && tab === "rules",
    retry: false,
  });
  const create = trpc.commercial.create.useMutation(),
    edit = trpc.commercial.edit.useMutation(),
    move = trpc.commercial.move.useMutation(),
    proposal = trpc.commercial.createProposal.useMutation(),
    decision = trpc.commercial.decideProposal.useMutation(),
    goal = trpc.commercial.saveGoal.useMutation(),
    preference = trpc.commercial.savePreference.useMutation(),
    rule = trpc.commercial.saveRule.useMutation(),
    apply = trpc.commercial.applyRules.useMutation();
  const o = details.data?.opportunity;
  const canManage = !!data?.canManage;
  const ownerName = (id: number) =>
    data?.owners.find(m => m.id === id)?.name || `Conta #${id} (rever acesso)`;
  async function refresh() {
    await Promise.all([utils.commercial.invalidate(), utils.crm.invalidate()]);
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      toast.success("Registro comercial salvo.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function open(value: Modal) {
    setError("");
    setRequestKey(crypto.randomUUID());
    setModal(value);
  }
  function filter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(f => ({ ...f, [key]: value, page: 0 }));
    setSelected(null);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const f = new FormData(e.currentTarget),
      v = (k: string) => String(f.get(k) || ""),
      n = (k: string) => Number(v(k));
    const ok = await run(async () => {
      switch (modal.kind) {
        case "create": {
          const r = await create.mutateAsync({
            requestKey,
            leadId: n("lead"),
            title: v("title"),
            amount: parseCommercialMoney(v("amount")),
            ownerUserId: n("owner"),
            expectedCloseDate: v("closeDate"),
          });
          setSelected(r.id);
          return;
        }
        case "edit":
          if (o)
            return edit.mutateAsync({
              opportunityId: o.id,
              revision: modal.revision!,
              title: v("title"),
              amount: parseCommercialMoney(v("amount")),
              ownerUserId: n("owner"),
              expectedCloseDate: v("closeDate"),
            });
          return;
        case "move":
          if (o)
            return move.mutateAsync({
              opportunityId: o.id,
              revision: modal.revision!,
              stage: v("stage") as typeof o.stage,
              reason: v("reason"),
              confirmed: f.has("confirmed"),
            });
          return;
        case "proposal":
          if (o)
            return proposal.mutateAsync({
              requestKey,
              opportunityId: o.id,
              revision: modal.revision!,
              title: v("title"),
              quantity: n("quantity"),
              unitPrice: parseCommercialMoney(v("price")),
              discount: parseCommercialMoney(v("discount")),
              validUntil: v("validUntil"),
              terms: v("terms"),
            });
          return;
        case "decision":
          return decision.mutateAsync({
            proposalId: modal.id!,
            revision: modal.revision!,
            status: modal.status!,
            evidence: v("evidence"),
            confirmed: true,
          });
        case "goal":
          return goal.mutateAsync({
            month: currentMonth,
            ownerUserId: modal.ownerUserId || null,
            targetAmount: parseCommercialMoney(v("amount")),
            revision: modal.revision || 0,
          });
        case "rule":
          return rule.mutateAsync({
            id: modal.id,
            revision: modal.revision || 0,
            name: v("name"),
            stage: v("stage") as "QUALIFICATION" | "PROPOSAL" | "NEGOTIATION",
            channel: v("channel") as "EMAIL" | "WHATSAPP_DISCREET",
            delayDays: n("days"),
            enabled: f.has("enabled"),
          });
      }
    });
    if (ok) setModal(null);
  }
  async function savePreferences(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!details.data) return;
    const f = new FormData(e.currentTarget);
    await run(() =>
      preference.mutateAsync({
        leadId: details.data!.lead.id,
        revision: details.data!.preference.revision,
        emailAllowed: f.has("email"),
        whatsappAllowed: f.has("whatsapp"),
        reason: String(f.get("reason") || ""),
      })
    );
  }
  const report = reports.data;
  return (
    <FinancialLayout
      contextLabel="CRM comercial"
      operatorName={auth.user?.name || undefined}
      showFiscalBanner={false}
    >
      <div className="space-y-6 min-w-0">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-700 text-white p-5 sm:p-7 flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-2">
              Relacionamento e crescimento
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold">CRM comercial</h1>
            <p className="text-indigo-100 mt-2 max-w-2xl text-sm">
              Acompanhe cada oportunidade, prepare propostas e planeje os
              próximos contatos.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link
              href="/crm"
              className="border border-white/40 rounded-xl px-4 py-2 text-sm"
            >
              Contatos e tarefas
            </Link>
            {canManage && (
              <button
                className="rounded-xl bg-white text-indigo-900 px-4 py-2 text-sm font-semibold inline-flex gap-2 items-center"
                onClick={() => open({ kind: "create" })}
              >
                <Plus size={16} />
                Nova oportunidade
              </button>
            )}
          </div>
        </div>
        <SessionNotice
          loading={auth.loading}
          authenticated={auth.isAuthenticated}
        />
        {query.isLoading && auth.isAuthenticated && (
          <p role="status">Carregando oportunidades…</p>
        )}
        {query.error && <p role="alert">{query.error.message}</p>}
        {data && (
          <>
            <p className="text-sm text-slate-600">
              {data.clinicName} •{" "}
              {canManage ? "Gestão comercial" : "Somente consulta"}
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-950 px-4 py-3 text-sm">
              Valores representam negociações, sem comprovação de recebimento.
              Retornos são tarefas internas; e-mail e WhatsApp aguardam
              provedor. Use apenas informações administrativas.
            </div>
            <nav
              aria-label="Áreas do CRM comercial"
              className="flex flex-wrap gap-2"
            >
              {[
                ["pipeline", "Funil de oportunidades"],
                ["reports", "Metas e relatórios"],
                ["rules", "Automações internas"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={tab === id}
                  className={
                    tab === id
                      ? buttonClass
                      : "rounded-xl border px-4 py-2 text-sm bg-white"
                  }
                  onClick={() => {
                    setTab(id);
                    setSelected(null);
                    setError("");
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                className="rounded-xl border px-3 py-2 bg-white ml-auto"
                aria-label="Atualizar CRM comercial"
                disabled={busy || query.isFetching}
                onClick={() => void refresh()}
              >
                <RefreshCw size={16} />
              </button>
            </nav>
            {error && !modal && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
                {error}
              </p>
            )}
            {tab !== "rules" && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Select
                  id="sales-owner-filter"
                  label="Responsável"
                  value={filters.ownerUserId || ""}
                  onChange={e =>
                    filter(
                      "ownerUserId",
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                >
                  <option value="">Todos os responsáveis</option>
                  {data.owners.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name || `Conta #${m.id}`}
                    </option>
                  ))}
                </Select>
                <Select
                  id="sales-source-filter"
                  label="Origem"
                  value={filters.source || ""}
                  onChange={e =>
                    filter(
                      "source",
                      (e.target.value || undefined) as Filters["source"]
                    )
                  }
                >
                  <option value="">Todas as origens</option>
                  {Object.entries(SOURCE_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
                {tab === "pipeline" ? (
                  <>
                    <Select
                      id="sales-stage-filter"
                      label="Etapa"
                      value={filters.stage || ""}
                      onChange={e =>
                        filter(
                          "stage",
                          (e.target.value || undefined) as Filters["stage"]
                        )
                      }
                    >
                      <option value="">Todas as etapas</option>
                      {SALES_STAGES.map(s => (
                        <option key={s} value={s}>
                          {SALES_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                    <Select
                      id="sales-channel-filter"
                      label="Segmento de contato comercial"
                      value={filters.channel || ""}
                      onChange={e =>
                        filter(
                          "channel",
                          (e.target.value || undefined) as Filters["channel"]
                        )
                      }
                    >
                      <option value="">Todos os contatos</option>
                      <option value="EMAIL">E-mail autorizado</option>
                      <option value="WHATSAPP_DISCREET">
                        WhatsApp autorizado
                      </option>
                      <option value="NONE">Sem canal autorizado</option>
                    </Select>
                  </>
                ) : (
                  <Field
                    id="sales-month"
                    label="Mês de fechamento e metas"
                    type="month"
                    min="2000-01"
                    max="2036-12"
                    value={currentMonth}
                    onChange={e => setMonth(e.target.value)}
                  />
                )}
              </div>
            )}
            {tab === "pipeline" && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["Oportunidades no filtro", String(data.total), TrendingUp],
                    [
                      "Em negociação",
                      brl(
                        data.stages
                          .filter(s => !["WON", "LOST"].includes(s.stage))
                          .reduce((n, s) => n + s.amount, 0)
                      ),
                      CircleDollarSign,
                    ],
                    [
                      "Contratações registradas",
                      String(
                        data.stages.find(s => s.stage === "WON")?.count || 0
                      ),
                      Handshake,
                    ],
                  ].map(([label, value, Icon]) => {
                    const MetricIcon = Icon as typeof TrendingUp;
                    return (
                      <div
                        key={String(label)}
                        className="bg-white rounded-2xl border p-4 flex items-center gap-4"
                      >
                        <MetricIcon className="text-indigo-600" size={24} />
                        <div>
                          <p className="text-xs text-slate-500">
                            {String(label)}
                          </p>
                          <p className="font-bold text-xl">{String(value)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Field
                  id="sales-search"
                  label="Buscar por oportunidade ou nome"
                  type="search"
                  maxLength={80}
                  value={filters.search || ""}
                  onChange={e => filter("search", e.target.value)}
                />
                {data.total === 0 && (
                  <Panel title="Nenhuma oportunidade neste filtro">
                    <p>
                      Cadastre um contato no CRM e crie a primeira oportunidade,
                      ou ajuste os filtros.
                    </p>
                    <Link className="text-indigo-700 underline" href="/crm">
                      Abrir contatos do CRM
                    </Link>
                  </Panel>
                )}
                <div
                  className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 items-start"
                  aria-label="Funil comercial"
                  aria-busy={query.isFetching}
                >
                  {SALES_STAGES.map(s => (
                    <section
                      key={s}
                      className="rounded-2xl bg-slate-100 border min-w-0 p-3 space-y-3"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <h2 className="font-semibold text-sm">
                          {SALES_LABELS[s]}
                        </h2>
                        <span className="rounded-full bg-white px-2 py-1 text-xs">
                          {data.stages.find(c => c.stage === s)?.count || 0}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {brl(data.stages.find(c => c.stage === s)?.amount || 0)}
                      </p>
                      {data.items
                        .filter(o => o.stage === s)
                        .map(item => (
                          <button
                            key={item.id}
                            data-opportunity-id={item.id}
                            aria-label={`Abrir oportunidade ${item.title}`}
                            className={`w-full text-left rounded-xl border bg-white p-3 space-y-2 shadow-sm hover:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-500 ${selected === item.id ? "border-indigo-600" : "border-slate-200"}`}
                            onClick={() => {
                              setSelected(item.id);
                              setError("");
                            }}
                          >
                            <p className="font-semibold text-sm break-words">
                              {item.title}
                            </p>
                            <p className="text-xs text-slate-600 break-words">
                              {item.leadName}
                            </p>
                            <p className="font-bold text-indigo-700">
                              {brl(item.amount)}
                            </p>
                            <p className="text-xs text-slate-500 break-words">
                              {ownerName(item.ownerUserId)}
                            </p>
                            <p className="text-xs text-slate-500">
                              Previsão:{" "}
                              {item.expectedCloseDate
                                .split("-")
                                .reverse()
                                .join("/")}
                            </p>
                            <span className="text-xs text-indigo-700 inline-flex items-center gap-1">
                              Ver oportunidade <ArrowRight size={12} />
                            </span>
                          </button>
                        ))}
                      {!data.items.some(o => o.stage === s) && (
                        <p className="text-xs text-slate-500 py-6 text-center">
                          Sem itens nesta página
                        </p>
                      )}
                    </section>
                  ))}
                </div>
                {data.total > 0 && (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span>
                      Página {(filters.page || 0) + 1} • {data.total}{" "}
                      oportunidades • até 60 por página
                    </span>
                    <button
                      className={buttonClass}
                      disabled={!filters.page}
                      onClick={() =>
                        setFilters(f => ({ ...f, page: (f.page || 0) - 1 }))
                      }
                    >
                      Anterior
                    </button>
                    <button
                      className={buttonClass}
                      disabled={((filters.page || 0) + 1) * 60 >= data.total}
                      onClick={() =>
                        setFilters(f => ({ ...f, page: (f.page || 0) + 1 }))
                      }
                    >
                      Próxima
                    </button>
                  </div>
                )}
                {details.isFetching && selected && (
                  <p role="status">Atualizando oportunidade…</p>
                )}
                {details.error && selected && (
                  <p role="alert">{details.error.message}</p>
                )}
                {details.data && o && selected && (
                  <div
                    className="space-y-4"
                    aria-label="Detalhes da oportunidade"
                  >
                    <Panel title={o.title}>
                      <div className="flex flex-wrap justify-between gap-4">
                        <div>
                          <p>
                            {details.data.lead.fullName} •{" "}
                            {SALES_LABELS[o.stage]}
                          </p>
                          <p className="font-bold text-2xl text-indigo-700 my-2">
                            {brl(o.amount)}
                          </p>
                          <p className="text-sm">
                            Responsável: {ownerName(o.ownerUserId)} • Origem:{" "}
                            {SOURCE_LABELS[
                              o.source as keyof typeof SOURCE_LABELS
                            ] || o.source}
                          </p>
                          {o.lostReason && (
                            <p className="mt-2 text-sm">
                              Motivo de perda: {o.lostReason}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-wrap items-start">
                          {canManage && (
                            <>
                              {!["WON", "LOST"].includes(o.stage) && (
                                <>
                                  <button
                                    className={buttonClass}
                                    disabled={busy || details.isFetching}
                                    onClick={() =>
                                      open({
                                        kind: "edit",
                                        revision: o.revision,
                                      })
                                    }
                                  >
                                    Editar oportunidade
                                  </button>
                                  <button
                                    className={buttonClass}
                                    disabled={busy || details.isFetching}
                                    onClick={() =>
                                      open({
                                        kind: "proposal",
                                        revision: o.revision,
                                      })
                                    }
                                  >
                                    Nova proposta
                                  </button>
                                </>
                              )}
                              {SALES_TRANSITIONS[o.stage]?.length > 0 && (
                                <button
                                  className={buttonClass}
                                  disabled={busy || details.isFetching}
                                  onClick={() =>
                                    open({ kind: "move", revision: o.revision })
                                  }
                                >
                                  Mover oportunidade
                                </button>
                              )}
                            </>
                          )}
                          <button
                            className="border rounded-xl px-4 py-2 text-sm"
                            onClick={() => setSelected(null)}
                          >
                            Fechar detalhes
                          </button>
                        </div>
                      </div>
                    </Panel>
                    <Panel title="Propostas e versões">
                      <p className="text-sm text-slate-600">
                        A apresentação e o aceite são registros feitos pela
                        equipe com uma evidência. Não há assinatura digital,
                        envio automático ou cobrança. Uma nova versão substitui
                        propostas ainda abertas.
                      </p>
                      {!details.data.proposals.length && (
                        <p className="text-sm">Nenhuma proposta criada.</p>
                      )}
                      {details.data.proposals.map(p => (
                        <article
                          key={p.id}
                          data-proposal-id={p.id}
                          className="border rounded-xl p-4 space-y-3"
                        >
                          <div className="flex flex-wrap justify-between gap-2">
                            <h3 className="font-semibold">
                              Versão {p.version} • {p.title}
                            </h3>
                            <span className="rounded-full bg-indigo-50 text-indigo-900 px-3 py-1 text-xs">
                              {proposalLabels[p.status]}
                            </span>
                          </div>
                          <p className="text-sm">
                            {p.quantity} × {brl(p.unitPrice)} • Desconto{" "}
                            {brl(p.discount)} •{" "}
                            <strong>Total {brl(p.total)}</strong> • Validade{" "}
                            {p.validUntil.split("-").reverse().join("/")}
                          </p>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {p.terms}
                          </p>
                          {p.evidence && (
                            <p className="text-sm text-slate-600 break-words">
                              Último registro: {p.evidence}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-xl border px-3 py-2 text-sm"
                              onClick={() =>
                                printProposal(
                                  p,
                                  data.clinicName,
                                  details.data!.lead.fullName
                                )
                              }
                            >
                              Abrir para impressão
                            </button>
                            {canManage &&
                              !["WON", "LOST"].includes(o.stage) && (
                                <>
                                  {p.status === "DRAFT" && (
                                    <button
                                      className={buttonClass}
                                      disabled={busy || details.isFetching}
                                      onClick={() =>
                                        open({
                                          kind: "decision",
                                          id: p.id,
                                          revision: p.revision,
                                          status: "PRESENTED",
                                        })
                                      }
                                    >
                                      Registrar apresentação
                                    </button>
                                  )}
                                  {p.status === "PRESENTED" && (
                                    <>
                                      <button
                                        className={buttonClass}
                                        disabled={busy || details.isFetching}
                                        onClick={() =>
                                          open({
                                            kind: "decision",
                                            id: p.id,
                                            revision: p.revision,
                                            status: "ACCEPTED",
                                          })
                                        }
                                      >
                                        Registrar aceite
                                      </button>
                                      <button
                                        className={buttonClass}
                                        disabled={busy || details.isFetching}
                                        onClick={() =>
                                          open({
                                            kind: "decision",
                                            id: p.id,
                                            revision: p.revision,
                                            status: "DECLINED",
                                          })
                                        }
                                      >
                                        Registrar recusa
                                      </button>
                                    </>
                                  )}
                                  {["DRAFT", "PRESENTED", "ACCEPTED"].includes(
                                    p.status
                                  ) && (
                                    <button
                                      className="rounded-xl border px-3 py-2 text-sm"
                                      disabled={busy || details.isFetching}
                                      onClick={() =>
                                        open({
                                          kind: "decision",
                                          id: p.id,
                                          revision: p.revision,
                                          status: "CANCELLED",
                                        })
                                      }
                                    >
                                      Cancelar proposta
                                    </button>
                                  )}
                                </>
                              )}
                          </div>
                        </article>
                      ))}
                    </Panel>
                    <Panel title="Autorização para contato comercial">
                      <p className="text-sm">
                        Registre uma escolha específica informada pela pessoa. A
                        autorização de lembretes de sessão não libera contato
                        comercial. O bloqueio geral no CRM prevalece; para
                        pacientes, as preferências do portal também são
                        respeitadas.
                      </p>
                      <p className="text-sm">
                        Canal disponível agora: e-mail{" "}
                        {details.data.eligible.email
                          ? "autorizado"
                          : "bloqueado"}{" "}
                        • WhatsApp{" "}
                        {details.data.eligible.whatsapp
                          ? "autorizado"
                          : "bloqueado"}
                        .
                      </p>
                      {!details.data.lead.contactAllowed && (
                        <p className="text-sm text-amber-800">
                          Contato geral bloqueado no CRM. Confira a escolha
                          informada antes de habilitar retornos.
                        </p>
                      )}
                      {canManage && (
                        <form
                          key={`${o.leadId}:${details.data.preference.revision}`}
                          onSubmit={savePreferences}
                          className="space-y-3"
                        >
                          <div className="flex gap-4 flex-wrap">
                            <label className="text-sm flex gap-2">
                              <input
                                type="checkbox"
                                name="email"
                                id="sales-email-allowed"
                                defaultChecked={
                                  details.data.preference.emailAllowed
                                }
                              />
                              E-mail comercial autorizado
                            </label>
                            <label className="text-sm flex gap-2">
                              <input
                                type="checkbox"
                                name="whatsapp"
                                defaultChecked={
                                  details.data.preference.whatsappAllowed
                                }
                              />
                              WhatsApp comercial autorizado
                            </label>
                          </div>
                          <Textarea
                            id="sales-preference-reason"
                            name="reason"
                            label="Origem da escolha ou motivo da alteração"
                            minLength={8}
                            maxLength={500}
                            required
                          />
                          <button
                            className={buttonClass}
                            disabled={busy || details.isFetching}
                          >
                            Salvar autorização comercial
                          </button>
                        </form>
                      )}
                    </Panel>
                    <Panel title="Histórico da oportunidade">
                      <p className="text-xs text-slate-500">
                        Até 100 registros recentes. O histórico completo
                        permanece guardado.
                      </p>
                      {details.data.history.map(h => (
                        <p
                          key={h.id}
                          className="border-b pb-3 text-sm break-words"
                        >
                          <span className="text-xs text-slate-500">
                            {new Date(h.createdAt).toLocaleString("pt-BR", {
                              timeZone: zone,
                            })}{" "}
                            • Conta #{h.actorUserId}
                          </span>
                          <br />
                          {h.summary}
                        </p>
                      ))}
                    </Panel>
                  </div>
                )}
              </>
            )}
            {tab === "reports" && (
              <>
                {reports.error && <p role="alert">{reports.error.message}</p>}
                {reports.isLoading && (
                  <p role="status">Calculando relatórios…</p>
                )}
                {report && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-4">
                      {[
                        ["Contratações no mês", brl(report.wonAmount)],
                        ["Ganhos / perdas", `${report.won} / ${report.lost}`],
                        [
                          "Conversão dos encerrados",
                          report.conversion === null
                            ? "Sem encerramentos"
                            : `${(report.conversion * 100).toFixed(1)}%`,
                        ],
                        [
                          "Em aberto com previsão no mês",
                          brl(report.openAmount),
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="border bg-white rounded-2xl p-4"
                        >
                          <p className="text-xs text-slate-600">{label}</p>
                          <p className="text-xl font-bold mt-2">{value}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-slate-600">
                      Conversão = ganhas ÷ (ganhas + perdidas), pela data de
                      encerramento no fuso da clínica. Valores ganhos são
                      comerciais, sem equivalência com receita recebida.
                    </p>
                    <Panel title="Metas mensais">
                      <p className="text-sm">
                        Meta da clínica e metas individuais são acompanhadas
                        separadamente. Atingimento considera contratações
                        registradas no mês.
                      </p>
                      {!report.goalComparisonAvailable && (
                        <p className="text-sm text-amber-800">
                          Retire o filtro de origem para comparar metas; as
                          metas abrangem todas as origens.
                        </p>
                      )}
                      {report.goals.map(g => (
                        <div
                          key={g.id}
                          className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-semibold">{g.label}</p>
                            <p className="text-sm">
                              Meta {brl(g.targetAmount)}
                              {report.goalComparisonAvailable
                                ? ` • Realizado ${brl(g.achieved)} • ${((g.achieved / g.targetAmount) * 100).toFixed(1)}%`
                                : ""}
                            </p>
                          </div>
                          {canManage && (
                            <button
                              className={buttonClass}
                              onClick={() =>
                                open({
                                  kind: "goal",
                                  revision: g.revision,
                                  ownerUserId: g.ownerUserId,
                                  amount: g.targetAmount,
                                })
                              }
                            >
                              Revisar meta
                            </button>
                          )}
                        </div>
                      ))}
                      {canManage && (
                        <div className="flex flex-wrap gap-2">
                          {!filters.ownerUserId && (
                            <button
                              className={buttonClass}
                              onClick={() =>
                                open({
                                  kind: "goal",
                                  revision:
                                    report.goals.find(g => g.ownerUserId === 0)
                                      ?.revision || 0,
                                  amount: report.goals.find(
                                    g => g.ownerUserId === 0
                                  )?.targetAmount,
                                })
                              }
                            >
                              <Target size={14} className="inline mr-1" />
                              Definir meta da clínica
                            </button>
                          )}
                          {data.owners
                            .filter(
                              m =>
                                !filters.ownerUserId ||
                                filters.ownerUserId === m.id
                            )
                            .map(m => (
                              <button
                                key={m.id}
                                className="border rounded-xl px-3 py-2 text-sm"
                                onClick={() =>
                                  open({
                                    kind: "goal",
                                    ownerUserId: m.id,
                                    revision:
                                      report.goals.find(
                                        g => g.ownerUserId === m.id
                                      )?.revision || 0,
                                    amount: report.goals.find(
                                      g => g.ownerUserId === m.id
                                    )?.targetAmount,
                                  })
                                }
                              >
                                Meta: {m.name || m.id}
                              </button>
                            ))}
                        </div>
                      )}
                      {!report.goals.length && (
                        <p className="text-sm">
                          Nenhuma meta definida para este período e responsável.
                        </p>
                      )}
                    </Panel>
                    {[
                      {
                        title: "Conversão por origem",
                        rows: report.bySource,
                        source: true,
                      },
                      {
                        title: "Conversão por responsável",
                        rows: report.byOwner,
                        source: false,
                      },
                    ].map(group => (
                      <Panel key={group.title} title={group.title}>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead>
                              <tr>
                                <th className="p-2">
                                  {group.source ? "Origem" : "Responsável"}
                                </th>
                                <th className="p-2">Ganhas</th>
                                <th className="p-2">Perdidas</th>
                                <th className="p-2">Valor ganho</th>
                                <th className="p-2">Conversão</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map(r => (
                                <tr key={r.id} className="border-t">
                                  <td className="p-2">
                                    {group.source
                                      ? SOURCE_LABELS[
                                          r.id as keyof typeof SOURCE_LABELS
                                        ] || r.id
                                      : r.label}
                                  </td>
                                  <td className="p-2">{r.won}</td>
                                  <td className="p-2">{r.lost}</td>
                                  <td className="p-2 whitespace-nowrap">
                                    {brl(r.wonAmount)}
                                  </td>
                                  <td className="p-2">
                                    {r.conversion === null
                                      ? "—"
                                      : `${(r.conversion * 100).toFixed(1)}%`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {!group.rows.length && (
                          <p>Nenhuma oportunidade registrada.</p>
                        )}
                      </Panel>
                    ))}
                    <Panel title="Motivos de perda no mês">
                      {report.lossReasons.map(r => (
                        <p key={r.reason} className="text-sm break-words">
                          {r.reason}: <strong>{r.count}</strong>
                        </p>
                      ))}
                      {!report.lossReasons.length && (
                        <p className="text-sm">Sem perdas no período.</p>
                      )}
                    </Panel>
                  </>
                )}
              </>
            )}
            {tab === "rules" && (
              <Panel title="Regras de retorno comercial">
                <p className="text-sm">
                  As regras criam tarefas para o responsável ativo ao entrar em
                  uma etapa ou ao aplicar as regras abaixo. Cada entrada gera no
                  máximo uma tarefa por versão da regra. A equipe realiza o
                  contato; não existe disparo de mensagens.
                </p>
                <p className="text-sm">
                  É necessária autorização comercial específica e liberação
                  geral do contato. Ao retirar uma autorização, tarefas
                  automáticas ainda abertas são canceladas. O prazo é contado em
                  períodos de 24 horas desde a entrada na etapa.
                </p>
                {settings.error && <p role="alert">{settings.error.message}</p>}
                {settings.isLoading && <p role="status">Carregando regras…</p>}
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={buttonClass}
                      onClick={() => open({ kind: "rule" })}
                    >
                      Nova regra de retorno
                    </button>
                    <button
                      className={buttonClass}
                      disabled={busy || settings.isFetching}
                      onClick={() =>
                        void run(async () => {
                          const result = await apply.mutateAsync();
                          toast.info(
                            `${result.created} tarefa(s) criada(s); ${result.blocked} regra(s) sem autorização ou responsável ativo.`
                          );
                        })
                      }
                    >
                      Aplicar regras de retorno
                    </button>
                  </div>
                )}
                {settings.data?.rules.map(r => (
                  <article
                    key={r.id}
                    className="border rounded-xl p-4 flex flex-wrap justify-between gap-3"
                  >
                    <div>
                      <h3 className="font-semibold">{r.name}</h3>
                      <p className="text-sm">
                        {SALES_LABELS[r.stage]} •{" "}
                        {r.channel === "EMAIL" ? "E-mail" : "WhatsApp"} •{" "}
                        {r.delayDays} dia(s) •{" "}
                        {r.enabled ? "Ativa" : "Desativada"} • versão{" "}
                        {r.revision}
                      </p>
                    </div>
                    {canManage && (
                      <button
                        className={buttonClass}
                        onClick={() =>
                          open({
                            kind: "rule",
                            id: r.id,
                            revision: r.revision,
                            name: r.name,
                            stage: r.stage,
                            channel: r.channel,
                            delayDays: r.delayDays,
                            enabled: r.enabled,
                          })
                        }
                      >
                        Editar regra
                      </button>
                    )}
                  </article>
                ))}
                {settings.data && !settings.data.rules.length && (
                  <p className="text-sm">
                    Nenhuma regra criada. As regras começam somente quando você
                    as configura.
                  </p>
                )}
                <Link className="text-indigo-700 underline text-sm" href="/crm">
                  Acompanhar tarefas no CRM
                </Link>
              </Panel>
            )}
          </>
        )}
      </div>
      <Dialog
        open={!!modal}
        onOpenChange={value => {
          if (!value && !busy) {
            setModal(null);
            setError("");
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogTitle>
            {
              {
                create: "Nova oportunidade",
                edit: "Editar oportunidade",
                move: "Mover oportunidade",
                proposal: "Nova versão de proposta",
                decision: "Registrar decisão da proposta",
                goal: "Meta mensal",
                rule: "Regra de retorno",
              }[modal?.kind || "create"]
            }
          </DialogTitle>
          <DialogDescription>
            Registre somente informações administrativas. Confira os dados antes
            de salvar.
          </DialogDescription>
          {modal && (
            <form
              key={`${modal.kind}:${modal.id || "new"}:${requestKey}`}
              onSubmit={submit}
              className="space-y-4"
            >
              {["create", "edit"].includes(modal.kind) && (
                <>
                  {modal.kind === "create" && (
                    <Select
                      id="sales-lead"
                      name="lead"
                      label="Contato do CRM"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Selecione um contato
                      </option>
                      {data?.leads.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.fullName}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Field
                    id="sales-title"
                    name="title"
                    label="Nome da oportunidade"
                    minLength={3}
                    maxLength={160}
                    required
                    defaultValue={modal.kind === "edit" ? o?.title : ""}
                  />
                  <Field
                    id="sales-amount"
                    name="amount"
                    label="Valor previsto em reais (ex.: 1500,00)"
                    inputMode="decimal"
                    required
                    defaultValue={moneyInput(
                      modal.kind === "edit" ? o?.amount || 0 : 0
                    )}
                  />
                  <Select
                    id="sales-owner"
                    name="owner"
                    label="Responsável"
                    required
                    defaultValue={
                      modal.kind === "edit" ? o?.ownerUserId : auth.user?.id
                    }
                  >
                    <option value="">Selecione</option>
                    {data?.owners.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))}
                  </Select>
                  <Field
                    id="sales-close-date"
                    name="closeDate"
                    label="Previsão de fechamento"
                    type="date"
                    required
                    min="2000-01-01"
                    max="2036-12-31"
                    defaultValue={
                      modal.kind === "edit"
                        ? o?.expectedCloseDate
                        : clinicParts(new Date(), zone).date
                    }
                  />
                </>
              )}
              {modal.kind === "move" && o && (
                <>
                  <Select
                    id="sales-new-stage"
                    name="stage"
                    label="Próxima etapa"
                    required
                  >
                    {SALES_TRANSITIONS[o.stage].map(s => (
                      <option key={s} value={s}>
                        {SALES_LABELS[s as keyof typeof SALES_LABELS]}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    id="sales-move-reason"
                    name="reason"
                    label="Motivo (obrigatório para perder ou reabrir)"
                    maxLength={500}
                  />
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="confirmed"
                      id="sales-win-confirm"
                    />
                    Conferi a contratação administrativa (necessário para marcar
                    como ganha).
                  </label>
                  <p className="text-xs text-slate-500">
                    Uma oportunidade ganha exige proposta aceita no mesmo valor.
                    Perdas cancelam propostas abertas e preservam seu histórico.
                  </p>
                </>
              )}
              {modal.kind === "proposal" && (
                <>
                  <Field
                    id="sales-proposal-title"
                    name="title"
                    label="Título da proposta"
                    required
                    minLength={3}
                    maxLength={160}
                    defaultValue={o?.title}
                  />
                  <div className="grid sm:grid-cols-3 gap-3">
                    <Field
                      id="sales-proposal-quantity"
                      name="quantity"
                      label="Quantidade"
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      required
                      defaultValue={1}
                    />
                    <Field
                      id="sales-proposal-price"
                      name="price"
                      label="Valor unitário (R$)"
                      inputMode="decimal"
                      required
                      defaultValue={moneyInput(o?.amount || 0)}
                    />
                    <Field
                      id="sales-proposal-discount"
                      name="discount"
                      label="Desconto total (R$)"
                      inputMode="decimal"
                      required
                      defaultValue="0,00"
                    />
                  </div>
                  <Field
                    id="sales-proposal-validity"
                    name="validUntil"
                    label="Validade"
                    type="date"
                    min={clinicParts(new Date(), zone).date}
                    max="2036-12-31"
                    required
                    defaultValue={
                      clinicParts(new Date(Date.now() + 7 * 86400000), zone)
                        .date
                    }
                  />
                  <Textarea
                    id="sales-proposal-terms"
                    name="terms"
                    label="Condições administrativas, sem informações clínicas"
                    minLength={8}
                    maxLength={1500}
                    required
                  />
                  <p className="text-sm text-slate-600">
                    O total será calculado e atualizará o valor da oportunidade.
                    Versões abertas anteriores serão canceladas e preservadas.
                  </p>
                </>
              )}
              {modal.kind === "decision" && (
                <>
                  <p className="font-medium">
                    Decisão: {proposalLabels[modal.status!]}
                  </p>
                  <Textarea
                    id="sales-proposal-evidence"
                    name="evidence"
                    label="Como e quando a apresentação ou decisão foi informada"
                    minLength={8}
                    maxLength={500}
                    required
                  />
                  <label className="flex gap-2 text-sm">
                    <input type="checkbox" required />
                    Confirmo que este registro corresponde ao que foi conferido
                    pela equipe.
                  </label>
                </>
              )}
              {modal.kind === "goal" && (
                <>
                  <p className="text-sm">
                    {currentMonth} •{" "}
                    {modal.ownerUserId
                      ? ownerName(modal.ownerUserId)
                      : "Clínica inteira"}
                  </p>
                  <Field
                    id="sales-goal-amount"
                    name="amount"
                    label="Valor da meta em reais"
                    inputMode="decimal"
                    required
                    defaultValue={modal.amount ? moneyInput(modal.amount) : ""}
                  />
                </>
              )}
              {modal.kind === "rule" && (
                <>
                  <Field
                    id="sales-rule-name"
                    name="name"
                    label="Nome da regra"
                    minLength={3}
                    maxLength={160}
                    required
                    defaultValue={modal.name || ""}
                  />
                  <Select
                    id="sales-rule-stage"
                    name="stage"
                    label="Etapa que inicia o retorno"
                    defaultValue={modal.stage || "QUALIFICATION"}
                  >
                    {SALES_STAGES.filter(s => !["WON", "LOST"].includes(s)).map(
                      s => (
                        <option key={s} value={s}>
                          {SALES_LABELS[s]}
                        </option>
                      )
                    )}
                  </Select>
                  <Select
                    id="sales-rule-channel"
                    name="channel"
                    label="Canal que precisa estar autorizado"
                    defaultValue={modal.channel || "EMAIL"}
                  >
                    <option value="EMAIL">E-mail</option>
                    <option value="WHATSAPP_DISCREET">WhatsApp</option>
                  </Select>
                  <Field
                    id="sales-rule-days"
                    name="days"
                    label="Dias desde a entrada na etapa"
                    type="number"
                    min={0}
                    max={90}
                    step={1}
                    required
                    defaultValue={modal.delayDays ?? 1}
                  />
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={modal.enabled ?? true}
                    />
                    Regra ativa
                  </label>
                  <p className="text-xs text-slate-500">
                    Revisar ou desativar cancela as tarefas ainda abertas da
                    versão anterior. A nova versão passa a valer nas próximas
                    mudanças de etapa ou ao aplicar regras.
                  </p>
                </>
              )}
              {error && (
                <p role="alert" className="text-red-700">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button className={buttonClass} disabled={busy}>
                  {busy ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 text-sm"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </FinancialLayout>
  );
}
