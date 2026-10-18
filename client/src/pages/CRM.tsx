import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { trpc } from "../lib/trpc";
import { useAuth } from "../_core/hooks/useAuth";
import { FinancialLayout } from "../components/FinancialLayout";
import {
  SessionNotice,
  fieldClass,
  buttonClass,
} from "../components/patients/PatientSelector";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  CRM_STAGE_LABELS,
  CRM_STAGES,
  CRM_TRANSITIONS,
} from "../../../shared/crm";
import { clinicParts, civilToInstant } from "../../../shared/scheduling";
import { toast } from "sonner";
type Modal = {
  kind:
    | "import"
    | "create"
    | "edit"
    | "convert"
    | "task"
    | "editTask"
    | "interaction"
    | "resolve";
  requestId?: number;
  leadId?: number;
  patientId?: number;
  taskId?: number;
  revision?: number;
  name?: string;
  title?: string;
  owner?: string;
  date?: string;
  stage?: string;
  allowed?: boolean;
  next?: string;
};
const sourceLabels: Record<string, string> = {
  MANUAL: "Manual",
  REFERRAL: "Indicação",
  PUBLIC_BOOKING: "Solicitação online",
  OTHER: "Outra",
};
const channelLabels: Record<string, string> = {
  PHONE: "Telefone",
  EMAIL: "E-mail",
  WHATSAPP_DISCREET: "WhatsApp discreto",
  INTERNAL: "Nota interna",
  IN_PERSON: "Presencial",
};
function Input({
  label,
  id,
  ...props
}: {
  label: string;
  id: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium" htmlFor={id}>
      {label}
      <input id={id} className={fieldClass} {...props} />
    </label>
  );
}
function Preferences({ patientId }: { patientId: number }) {
  const q = trpc.crm.preferences.useQuery({ patientId }, { retry: false }),
    save = trpc.crm.savePreferences.useMutation();
  const [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const utils = trpc.useUtils();
  async function toggle(kind: "emailAllowed" | "whatsappAllowed") {
    if (!q.data) return;
    try {
      await save.mutateAsync({
        patientId,
        ...q.data,
        [kind]: !q.data[kind],
        reason,
      });
      await Promise.all([q.refetch(), utils.crm.reminders.invalidate()]);
      setError("");
      toast.success("Preferência registrada; nenhum envio realizado.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border bg-white p-4 text-slate-900">
      <h2 className="font-bold">Preferências de lembretes do paciente</h2>
      <p className="text-sm">
        Registre apenas a escolha comunicada pelo paciente. Sem autorização
        registrada, o canal fica bloqueado.
      </p>
      <Input
        id="crm-pref-reason"
        label="Origem da preferência informada (mínimo 8 caracteres)"
        value={reason}
        onChange={e => setReason(e.target.value)}
        maxLength={500}
      />
      {q.error && <p role="alert">{q.error.message}</p>}
      {q.data && (
        <div className="flex gap-3 flex-wrap">
          <button
            className={buttonClass}
            disabled={
              save.isPending || q.isFetching || reason.trim().length < 8
            }
            onClick={() => toggle("emailAllowed")}
          >
            E-mail: {q.data.emailAllowed ? "autorizado" : "bloqueado"}
          </button>
          <button
            className={buttonClass}
            disabled={
              save.isPending || q.isFetching || reason.trim().length < 8
            }
            onClick={() => toggle("whatsappAllowed")}
          >
            WhatsApp: {q.data.whatsappAllowed ? "autorizado" : "bloqueado"}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export default function CRM() {
  const auth = useAuth(),
    utils = trpc.useUtils();
  const q = trpc.crm.overview.useQuery(undefined, {
    enabled: auth.isAuthenticated,
    retry: false,
  });
  const data = q.data,
    zone = data?.timezone || "America/Sao_Paulo";
  const [tab, setTab] = useState("leads"),
    [search, setSearch] = useState(""),
    [stage, setStage] = useState("ALL"),
    [ownerFilter, setOwnerFilter] = useState("ALL"),
    [subject, setSubject] = useState<{
      leadId?: number;
      patientId?: number;
    } | null>(null),
    [patient, setPatient] = useState("");
  const [modal, setModal] = useState<Modal | null>(null),
    [requestKey, setKey] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const history = trpc.crm.history.useQuery(subject || { leadId: 0 }, {
      enabled: !!subject,
      retry: false,
    }),
    metrics = trpc.crm.metrics.useQuery(undefined, {
      enabled: !!data && tab === "metrics",
      retry: false,
    }),
    reminders = trpc.crm.reminders.useQuery(undefined, {
      enabled: !!data && tab === "reminders",
      retry: false,
    });
  const create = trpc.crm.create.useMutation(),
    update = trpc.crm.update.useMutation(),
    convert = trpc.crm.convert.useMutation(),
    importRequest = trpc.crm.importRequest.useMutation(),
    task = trpc.crm.addTask.useMutation(),
    editTask = trpc.crm.updateTask.useMutation(),
    resolve = trpc.crm.resolveTask.useMutation(),
    interaction = trpc.crm.addInteraction.useMutation(),
    prepare = trpc.crm.prepareReminders.useMutation();
  const format = (d: Date | null) =>
    d
      ? new Date(d).toLocaleString("pt-BR", { timeZone: zone })
      : "Não definido";
  const local = (d: Date | null) => {
    if (!d) return "";
    const p = clinicParts(d, zone);
    return `${p.date}T${p.time}`;
  };
  const instant = (s: string) => {
    const [d, t] = s.split("T");
    return civilToInstant(d, t, zone);
  };
  const refresh = async () => {
    await Promise.all([
      utils.crm.invalidate(),
      utils.patients.invalidate(),
      utils.scheduling.invalidate(),
    ]);
  };
  function open(value: Modal) {
    setModal(value);
    setKey(crypto.randomUUID());
    setError("");
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      toast.success("Registro administrativo salvo.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const f = new FormData(e.currentTarget),
      v = (k: string) => String(f.get(k) || ""),
      id = (k: string) => (v(k) ? Number(v(k)) : null);
    const s = { leadId: modal.leadId, patientId: modal.patientId };
    const ok = await run(async () => {
      switch (modal.kind) {
        case "import":
          return importRequest.mutateAsync({
            requestId: modal.requestId!,
            ownerUserId: null,
            targetLeadId: id("targetLead") || undefined,
            identityConfirmed: true,
          });
        case "create":
          return create.mutateAsync({
            requestKey,
            fullName: v("fullName"),
            email: v("email"),
            phone: v("phone"),
            source: v("source") as "MANUAL" | "REFERRAL" | "OTHER",
            ownerUserId: id("owner"),
            nextContactAt: v("date") ? instant(v("date")) : null,
            preferredChannel: v("channel") as
              | "EMAIL"
              | "WHATSAPP_DISCREET"
              | "PHONE",
            contactAllowed: f.has("allowed"),
          });
        case "edit":
          return update.mutateAsync({
            leadId: modal.leadId!,
            revision: modal.revision!,
            stage: v("stage") as "NEW" | "CONTACTED" | "QUALIFIED" | "LOST",
            ownerUserId: id("owner"),
            nextContactAt: v("date") ? instant(v("date")) : null,
            contactAllowed: f.has("allowed"),
            reason: v("reason"),
          });
        case "convert":
          return convert.mutateAsync({
            leadId: modal.leadId!,
            revision: modal.revision!,
            patientId: id("patient") || undefined,
            identityConfirmed: true,
          });
        case "task":
          return task.mutateAsync({
            ...s,
            requestKey,
            title: v("title"),
            kind: v("kind") as "FOLLOW_UP" | "RETURN",
            ownerUserId: Number(v("owner")),
            dueAt: instant(v("date")),
          });
        case "editTask":
          return editTask.mutateAsync({
            taskId: modal.taskId!,
            revision: modal.revision!,
            title: v("title"),
            ownerUserId: Number(v("owner")),
            dueAt: instant(v("date")),
          });
        case "resolve":
          return resolve.mutateAsync({
            taskId: modal.taskId!,
            revision: modal.revision!,
            status: v("status") as "DONE" | "CANCELLED",
            resolution: v("reason"),
          });
        case "interaction":
          return interaction.mutateAsync({
            ...s,
            requestKey,
            channel: v("channel") as
              | "PHONE"
              | "EMAIL"
              | "WHATSAPP_DISCREET"
              | "INTERNAL"
              | "IN_PERSON",
            outcome: v("outcome") as
              | "ATTEMPTED"
              | "REACHED"
              | "NO_RESPONSE"
              | "NOTE",
            summary: v("summary"),
          });
      }
    });
    if (ok) setModal(null);
  }
  const ownerName = (id: number | null) =>
    data?.owners.find(o => o.id === id)?.name ||
    (id ? `Conta #${id} (rever acesso)` : "Sem responsável");
  const subjectName = (leadId: number | null, patientId: number | null) =>
    data?.leads.find(l => l.id === leadId)?.fullName ||
    data?.patients.find(p => p.id === patientId)?.fullName ||
    "Cadastro administrativo";
  const leads =
    data?.leads.filter(
      l =>
        (stage === "ALL" || l.stage === stage) &&
        (ownerFilter === "ALL" ||
          (ownerFilter === "NONE" && !l.ownerUserId) ||
          String(l.ownerUserId) === ownerFilter) &&
        [l.fullName, l.email || "", l.phone || ""].some(s =>
          s.toLowerCase().includes(search.toLowerCase())
        )
    ) || [];
  return (
    <FinancialLayout
      showFiscalBanner={false}
      operatorName={auth.user?.name || undefined}
      contextLabel="CRM administrativo"
    >
      <div className="space-y-5">
        <h1 className="font-bold text-2xl">CRM administrativo</h1>
        <SessionNotice
          loading={auth.loading}
          authenticated={auth.isAuthenticated}
        />
        {q.error && <p role="alert">{q.error.message}</p>}
        {data && (
          <>
            <p>
              {data.clinicName} • fuso {zone} •{" "}
              {data.canManage ? "Gestão administrativa" : "Somente consulta"}
            </p>
            <p className="border rounded-xl bg-amber-50 text-amber-950 p-4 text-sm">
              Provedores de e-mail e WhatsApp a definir. Interações são
              registros manuais; lembretes preparados não são enviados. Registre
              somente informações administrativas, sem conteúdo clínico.
            </p>
            <nav className="flex gap-2 overflow-x-auto">
              {[
                ["leads", "Leads"],
                ["requests", "Solicitações online"],
                ["tasks", "Tarefas"],
                ["patients", "Pacientes e preferências"],
                ["reminders", "Lembretes"],
                ["metrics", "Indicadores"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={
                    tab === id
                      ? buttonClass
                      : "border rounded-xl px-4 py-2 text-sm whitespace-nowrap"
                  }
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {error && !modal && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            {tab === "leads" && (
              <>
                <div className="flex gap-3 flex-wrap items-end">
                  <Input
                    id="crm-search"
                    label="Buscar lead"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  <label>
                    Etapa
                    <select
                      id="crm-stage-filter"
                      className={fieldClass}
                      value={stage}
                      onChange={e => setStage(e.target.value)}
                    >
                      <option value="ALL">Todas</option>
                      {CRM_STAGES.map(s => (
                        <option key={s} value={s}>
                          {CRM_STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Responsável
                    <select
                      className={fieldClass}
                      value={ownerFilter}
                      onChange={e => setOwnerFilter(e.target.value)}
                    >
                      <option value="ALL">Todos</option>
                      <option value="NONE">Sem responsável</option>
                      {data.owners.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {data.canManage && (
                    <button
                      className={buttonClass}
                      onClick={() => open({ kind: "create" })}
                    >
                      Novo lead
                    </button>
                  )}
                </div>
                {!leads.length && <p>Nenhum lead encontrado.</p>}
                {leads.map(l => (
                  <article
                    key={l.id}
                    data-lead-id={l.id}
                    className="border rounded-2xl bg-white p-5 text-slate-900 space-y-2"
                  >
                    <h2 className="font-bold">
                      {l.fullName} • {CRM_STAGE_LABELS[l.stage]}
                    </h2>
                    <p>
                      {sourceLabels[l.source]} • {ownerName(l.ownerUserId)} •
                      Próximo contato: {format(l.nextContactAt)}
                    </p>
                    <p>
                      {l.email || l.phone} • Contato administrativo{" "}
                      {l.contactAllowed
                        ? "autorizado conforme registro"
                        : "não autorizado"}
                    </p>
                    {l.patientId && (
                      <Link
                        className="underline"
                        href={`/patients/view?patientId=${l.patientId}`}
                      >
                        Paciente #{l.patientId}
                      </Link>
                    )}
                    {l.lostReason && <p>Motivo: {l.lostReason}</p>}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        className="border rounded-xl p-2"
                        onClick={() => setSubject({ leadId: l.id })}
                      >
                        Histórico
                      </button>
                      {data.canManage && (
                        <>
                          <button
                            className="border rounded-xl p-2"
                            onClick={() =>
                              open({
                                kind: "interaction",
                                leadId: l.id,
                                name: l.fullName,
                              })
                            }
                          >
                            Registrar interação
                          </button>
                          {l.stage !== "CONVERTED" && (
                            <>
                              <button
                                className="border rounded-xl p-2"
                                onClick={() =>
                                  open({
                                    kind: "edit",
                                    leadId: l.id,
                                    revision: l.revision,
                                    name: l.fullName,
                                    owner: l.ownerUserId
                                      ? String(l.ownerUserId)
                                      : "",
                                    stage: l.stage,
                                    allowed: l.contactAllowed,
                                    next: local(l.nextContactAt),
                                  })
                                }
                              >
                                Gerenciar lead
                              </button>
                              <button
                                className="border rounded-xl p-2"
                                onClick={() =>
                                  open({
                                    kind: "task",
                                    leadId: l.id,
                                    name: l.fullName,
                                  })
                                }
                              >
                                Criar tarefa
                              </button>
                            </>
                          )}
                          {data.canConvert &&
                            !["CONVERTED", "LOST"].includes(l.stage) && (
                              <button
                                className={buttonClass}
                                onClick={() =>
                                  open({
                                    kind: "convert",
                                    leadId: l.id,
                                    revision: l.revision,
                                    name: l.fullName,
                                  })
                                }
                              >
                                Converter em paciente
                              </button>
                            )}
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </>
            )}
            {tab === "requests" && (
              <section className="space-y-3">
                <h2 className="font-bold">Solicitações ainda em triagem</h2>
                <p>
                  Importar não cria paciente nem confirma horário. Nome e
                  contato coincidentes são conferidos para reaproveitar o lead;
                  a escolha do paciente ocorre na conversão.
                </p>
                {data.requests.map(r => (
                  <article
                    key={r.id}
                    className="border rounded-xl bg-white p-4 text-slate-900"
                  >
                    <p>
                      {r.name} • {r.contactValue} • {r.status}
                    </p>
                    {r.crmLeadId ? (
                      <p>Lead vinculado #{r.crmLeadId}</p>
                    ) : (
                      data.canManage && (
                        <button
                          className={buttonClass}
                          disabled={busy}
                          onClick={() =>
                            open({
                              kind: "import",
                              requestId: r.id,
                              name: r.name,
                            })
                          }
                        >
                          Importar solicitação #{r.id}
                        </button>
                      )
                    )}
                  </article>
                ))}
              </section>
            )}
            {tab === "tasks" && (
              <section className="space-y-3">
                <h2 className="font-bold">Retornos e vencimentos</h2>
                {!data.tasks.length && <p>Nenhuma tarefa cadastrada.</p>}
                {data.tasks.map(t => (
                  <article
                    key={t.id}
                    data-task-id={t.id}
                    className="border rounded-xl bg-white text-slate-900 p-4 space-y-2"
                  >
                    <h3 className="font-bold">{t.title}</h3>
                    <p>
                      {subjectName(t.leadId, t.patientId)} •{" "}
                      {ownerName(t.ownerUserId)} • {format(t.dueAt)}
                    </p>
                    <p>
                      {t.status === "OPEN"
                        ? t.overdue
                          ? "Vencida"
                          : "Aberta"
                        : t.status === "DONE"
                          ? "Concluída"
                          : "Cancelada"}{" "}
                      •{" "}
                      {t.kind === "RETURN"
                        ? "Retorno de paciente"
                        : "Acompanhamento"}
                    </p>
                    {t.resolution && <p>{t.resolution}</p>}
                    {data.canManage && t.status === "OPEN" && (
                      <div className="flex gap-2">
                        <button
                          className="border rounded-xl p-2"
                          onClick={() =>
                            open({
                              kind: "editTask",
                              taskId: t.id,
                              revision: t.revision,
                              title: t.title,
                              owner: String(t.ownerUserId),
                              date: local(t.dueAt),
                            })
                          }
                        >
                          Editar tarefa
                        </button>
                        <button
                          className={buttonClass}
                          onClick={() =>
                            open({
                              kind: "resolve",
                              taskId: t.id,
                              revision: t.revision,
                              name: t.title,
                            })
                          }
                        >
                          Concluir ou cancelar
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            )}
            {tab === "patients" && (
              <section className="space-y-4">
                <label>
                  Paciente
                  <select
                    id="crm-patient"
                    className={fieldClass}
                    value={patient}
                    onChange={e => setPatient(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {data.patients.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                {patient && (
                  <>
                    <div className="flex gap-2">
                      <button
                        className="border rounded-xl p-2"
                        onClick={() =>
                          setSubject({ patientId: Number(patient) })
                        }
                      >
                        Histórico administrativo
                      </button>
                      {data.canManage && (
                        <>
                          <button
                            className={buttonClass}
                            onClick={() =>
                              open({
                                kind: "task",
                                patientId: Number(patient),
                                name: subjectName(null, Number(patient)),
                              })
                            }
                          >
                            Criar tarefa de retorno
                          </button>
                          <button
                            className="border rounded-xl p-2"
                            onClick={() =>
                              open({
                                kind: "interaction",
                                patientId: Number(patient),
                              })
                            }
                          >
                            Registrar interação
                          </button>
                        </>
                      )}
                    </div>
                    {data.canManage && (
                      <Preferences key={patient} patientId={Number(patient)} />
                    )}
                  </>
                )}
              </section>
            )}
            {tab === "reminders" && (
              <section className="space-y-4">
                <h2 className="font-bold">
                  Preparação de lembretes administrativos
                </h2>
                <p>
                  Próximos sete dias: sessões, confirmação e tarefas de retorno.
                  A preparação confere preferências e alterações na agenda. Nada
                  é enviado enquanto o provedor estiver indefinido.
                </p>
                {data.canManage && (
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => run(() => prepare.mutateAsync())}
                  >
                    Preparar lembretes
                  </button>
                )}
                {reminders.error && (
                  <p role="alert">{reminders.error.message}</p>
                )}
                {reminders.data?.items.map(r => (
                  <article
                    key={r.id}
                    className="border rounded-xl bg-white text-slate-900 p-4 space-y-1"
                  >
                    <p className="font-bold">
                      {subjectName(null, r.patientId)} •{" "}
                      {r.kind === "RETURN"
                        ? "Retorno"
                        : r.kind === "CONFIRMATION"
                          ? "Confirmação"
                          : "Lembrete de compromisso"}
                    </p>
                    <p>
                      {format(r.dueAt)} •{" "}
                      {channelLabels[r.channel] || r.channel} •{" "}
                      {r.status === "WAITING_PROVIDER"
                        ? "Aguardando provedor"
                        : r.status === "SUPPRESSED"
                          ? "Bloqueado por preferência"
                          : "Cancelado"}
                    </p>
                    <p>{r.reason}</p>
                    <p className="text-sm">{r.templateText}</p>
                  </article>
                ))}
              </section>
            )}
            {tab === "metrics" && (
              <section className="space-y-4">
                <h2 className="font-bold">
                  Indicadores administrativos — todo o período
                </h2>
                {metrics.error && <p role="alert">{metrics.error.message}</p>}
                {metrics.data && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        ["Leads cadastrados", metrics.data.totalLeads],
                        ["Leads convertidos", metrics.data.converted],
                        [
                          "Conversão",
                          metrics.data.conversionRate === null
                            ? "Sem base"
                            : `${(metrics.data.conversionRate * 100).toFixed(1)}%`,
                        ],
                        ["Tarefas vencidas", metrics.data.overdueTasks],
                        [
                          "Comparecimento",
                          metrics.data.attendanceRate === null
                            ? "Sem base"
                            : `${(metrics.data.attendanceRate * 100).toFixed(1)}%`,
                        ],
                        [
                          "Pacientes com retorno observado",
                          metrics.data.returnedPatients,
                        ],
                      ].map(([label, value]) => (
                        <article
                          key={label}
                          className="border rounded-xl bg-white p-4 text-slate-900"
                        >
                          <p>{label}</p>
                          <strong className="text-xl">{value}</strong>
                        </article>
                      ))}
                    </div>
                    <p className="text-sm">
                      Conversão = leads convertidos / leads cadastrados.
                      Comparecimento = sessões concluídas / (concluídas +
                      faltas) dos pacientes convertidos pelo CRM. Retorno
                      observado = pacientes dessa mesma base com duas ou mais
                      sessões concluídas; não comprova efeito de uma mensagem.
                    </p>
                    {metrics.data.bySource.map(s => (
                      <p key={s.source}>
                        {sourceLabels[s.source]}: {s.converted} convertido(s) de{" "}
                        {s.total} lead(s).
                      </p>
                    ))}
                  </>
                )}
              </section>
            )}
          </>
        )}
        <Dialog
          open={!!modal}
          onOpenChange={v => {
            if (!v && !busy) setModal(null);
          }}
        >
          <DialogContent
            onInteractOutside={e => e.preventDefault()}
            onEscapeKeyDown={e => {
              if (busy) e.preventDefault();
            }}
            showCloseButton={!busy}
            className="max-h-[90vh] overflow-y-auto"
          >
            <DialogTitle>
              {modal?.kind === "import"
                ? "Importar solicitação"
                : modal?.kind === "create"
                  ? "Novo lead"
                  : modal?.kind === "edit"
                    ? "Gerenciar lead"
                    : modal?.kind === "convert"
                      ? "Converter em paciente"
                      : modal?.kind === "interaction"
                        ? "Registrar interação"
                        : modal?.kind === "resolve"
                          ? "Encerrar tarefa"
                          : "Tarefa administrativa"}
            </DialogTitle>
            <DialogDescription>
              {modal?.name ||
                "Registro administrativo da clínica. Não inclua conteúdo clínico."}
            </DialogDescription>
            {modal && (
              <form onSubmit={submit} className="space-y-3">
                <fieldset disabled={busy} className="space-y-3">
                  {modal.kind === "import" && (
                    <>
                      <p>
                        Vincular mantém o histórico existente. Confira nome e
                        contato antes de reaproveitar um lead.
                      </p>
                      <label>
                        Lead existente
                        <select
                          id="crm-import-target"
                          name="targetLead"
                          className={fieldClass}
                        >
                          <option value="">Criar novo lead</option>
                          {data?.leads.map(l => (
                            <option key={l.id} value={l.id}>
                              {l.fullName} • {l.email || l.phone}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <input id="crm-import-ack" required type="checkbox" />
                        Conferi o nome e o contato da solicitação
                      </label>
                    </>
                  )}
                  {modal.kind === "create" && (
                    <>
                      <Input
                        id="crm-name"
                        name="fullName"
                        label="Nome do lead"
                        required
                        minLength={2}
                        maxLength={160}
                      />
                      <Input
                        id="crm-email"
                        name="email"
                        label="E-mail"
                        type="email"
                        maxLength={200}
                      />
                      <Input
                        id="crm-phone"
                        name="phone"
                        label="Telefone"
                        maxLength={40}
                      />
                      <label>
                        Origem
                        <select name="source" className={fieldClass}>
                          <option value="MANUAL">Manual</option>
                          <option value="REFERRAL">Indicação</option>
                          <option value="OTHER">Outra</option>
                        </select>
                      </label>
                      <label>
                        Canal preferido
                        <select name="channel" className={fieldClass}>
                          <option value="EMAIL">E-mail</option>
                          <option value="WHATSAPP_DISCREET">
                            WhatsApp discreto
                          </option>
                          <option value="PHONE">Telefone</option>
                        </select>
                      </label>
                    </>
                  )}
                  {modal.kind === "edit" && (
                    <>
                      <label>
                        Etapa do lead
                        <select
                          id="crm-stage"
                          name="stage"
                          defaultValue={modal.stage}
                          className={fieldClass}
                        >
                          {[
                            modal.stage!,
                            ...(CRM_TRANSITIONS[modal.stage!] || []),
                          ].map(s => (
                            <option key={s} value={s}>
                              {
                                CRM_STAGE_LABELS[
                                  s as keyof typeof CRM_STAGE_LABELS
                                ]
                              }
                            </option>
                          ))}
                        </select>
                      </label>
                      <Input
                        id="crm-reason"
                        name="reason"
                        label="Motivo (obrigatório para perda ou reabertura)"
                        maxLength={500}
                      />
                    </>
                  )}
                  {["create", "edit", "task", "editTask"].includes(
                    modal.kind
                  ) && (
                    <label>
                      Responsável
                      <select
                        id="crm-owner"
                        name="owner"
                        required={["task", "editTask"].includes(modal.kind)}
                        defaultValue={modal.owner || ""}
                        className={fieldClass}
                      >
                        <option value="">Sem responsável</option>
                        {data?.owners.map(o => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {["create", "edit", "task", "editTask"].includes(
                    modal.kind
                  ) && (
                    <Input
                      id="crm-date"
                      name="date"
                      label={
                        ["task", "editTask"].includes(modal.kind)
                          ? "Vencimento no fuso da clínica"
                          : "Próximo contato no fuso da clínica"
                      }
                      required={["task", "editTask"].includes(modal.kind)}
                      type="datetime-local"
                      defaultValue={modal.next || modal.date || ""}
                    />
                  )}
                  {["create", "edit"].includes(modal.kind) && (
                    <label className="flex gap-2 text-sm">
                      <input
                        name="allowed"
                        type="checkbox"
                        defaultChecked={modal.allowed}
                      />
                      O contato administrativo foi autorizado pela pessoa
                    </label>
                  )}
                  {modal.kind === "convert" && (
                    <>
                      <p>
                        Confira a identidade antes de vincular. Se já existe
                        paciente com o mesmo nome e contato, use o cadastro
                        existente.
                      </p>
                      <label>
                        Paciente existente
                        <select
                          id="crm-convert-patient"
                          name="patient"
                          className={fieldClass}
                        >
                          <option value="">
                            Criar cadastro ativo a partir deste lead
                          </option>
                          {data?.patients
                            .filter(p => p.status === "ACTIVE")
                            .map(p => (
                              <option key={p.id} value={p.id}>
                                {p.fullName} (#{p.id})
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="flex gap-2">
                        <input id="crm-identity-ack" required type="checkbox" />
                        Conferi a identidade e o cadastro selecionado
                      </label>
                    </>
                  )}
                  {["task", "editTask"].includes(modal.kind) && (
                    <Input
                      id="crm-task-title"
                      name="title"
                      label="Título administrativo"
                      required
                      minLength={3}
                      maxLength={180}
                      defaultValue={modal.title || ""}
                    />
                  )}
                  {modal.kind === "task" && (
                    <label>
                      Tipo
                      <select name="kind" className={fieldClass}>
                        <option
                          value={modal.patientId ? "RETURN" : "FOLLOW_UP"}
                        >
                          {modal.patientId
                            ? "Retorno de paciente"
                            : "Acompanhamento do lead"}
                        </option>
                      </select>
                    </label>
                  )}
                  {modal.kind === "resolve" && (
                    <>
                      <label>
                        Situação
                        <select name="status" className={fieldClass}>
                          <option value="DONE">Concluída</option>
                          <option value="CANCELLED">Cancelada</option>
                        </select>
                      </label>
                      <Input
                        id="crm-task-resolution"
                        name="reason"
                        label="Resultado administrativo"
                        required
                        minLength={3}
                        maxLength={500}
                      />
                    </>
                  )}
                  {modal.kind === "interaction" && (
                    <>
                      <label>
                        Canal
                        <select name="channel" className={fieldClass}>
                          {Object.entries(channelLabels).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Resultado
                        <select name="outcome" className={fieldClass}>
                          <option value="ATTEMPTED">
                            Tentativa registrada
                          </option>
                          <option value="REACHED">Contato realizado</option>
                          <option value="NO_RESPONSE">Sem resposta</option>
                          <option value="NOTE">Nota administrativa</option>
                        </select>
                      </label>
                      <label>
                        Resumo administrativo
                        <textarea
                          id="crm-summary"
                          name="summary"
                          className={fieldClass}
                          required
                          minLength={3}
                          maxLength={1000}
                        />
                      </label>
                      <p className="text-sm">
                        Não envia mensagem. Registra somente a interação que
                        você realizou.
                      </p>
                    </>
                  )}
                  {error && (
                    <p role="alert" className="text-red-700">
                      {error}
                    </p>
                  )}
                  <button className={buttonClass} disabled={busy} type="submit">
                    {busy ? "Salvando…" : "Salvar registro"}
                  </button>
                </fieldset>
              </form>
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!subject}
          onOpenChange={v => {
            if (!v) setSubject(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogTitle>Histórico administrativo</DialogTitle>
            <DialogDescription>
              Autoria e datas preservadas; contatos manuais não comprovam envio
              externo.
            </DialogDescription>
            {history.error && <p role="alert">{history.error.message}</p>}
            {history.data?.map(r => (
              <article key={r.id} className="border-t pt-3 space-y-1">
                <p>{r.summary}</p>
                <p className="text-sm text-slate-500">
                  Conta #{r.actorUserId} • {format(r.createdAt)} •{" "}
                  {channelLabels[r.channel] || r.channel}
                </p>
              </article>
            ))}
          </DialogContent>
        </Dialog>
      </div>
    </FinancialLayout>
  );
}
