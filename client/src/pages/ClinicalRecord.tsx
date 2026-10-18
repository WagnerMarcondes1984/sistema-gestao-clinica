import { useState } from "react";
import { toast } from "sonner";
import { FinancialLayout } from "../components/FinancialLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  PatientSelector,
  SessionNotice,
  useSelectedPatient,
  buttonClass,
  fieldClass,
} from "../components/patients/PatientSelector";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
const actionLabels: Record<string, string> = {
  CREATE: "Criação",
  CREATE_ADDENDUM: "Criação de adendo",
  EDIT: "Edição de rascunho",
  FINALIZE: "Finalização",
  LEGACY_BASELINE:
    "Registro legado observado; histórico anterior não verificável",
};
const recordTypes = {
  ANAMNESIS: "Anamnese",
  EVOLUTION: "Evolução",
  RESTRICTED_NOTE: "Nota restrita",
  GOAL: "Objetivo",
  CARE_PLAN: "Plano de cuidado",
};
type RecordType = keyof typeof recordTypes;
type RecordRow = inferRouterOutputs<AppRouter>["care"]["records"][number];
function RecordWorkspace({
  patientId,
  onDirtyChange,
}: {
  patientId: number;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [recordType, setRecordType] = useState<RecordType>("EVOLUTION"),
    [content, setContent] = useState("");
  const [editing, setEditing] = useState<RecordRow | null>(null),
    [parent, setParent] = useState<RecordRow | null>(null),
    [finalizing, setFinalizing] = useState<RecordRow | null>(null),
    [historyId, setHistoryId] = useState(0),
    [appointmentId, setAppointmentId] = useState(0);
  const context = trpc.scheduling.context.useQuery(undefined, { retry: false });
  const zone = context.data?.clinic.timezone || "America/Sao_Paulo";
  const records = trpc.mindos.clinicalRecords.useQuery(
    { patientId },
    { retry: false }
  );
  const profile = trpc.patients.get.useQuery({ patientId }, { retry: false });
  const appointments = trpc.scheduling.list.useQuery(
    { patientId },
    { enabled: Boolean(context.data?.canSchedule), retry: false }
  );
  const history = trpc.care.recordHistory.useQuery(
    { recordId: historyId },
    { enabled: historyId > 0, retry: false }
  );
  function clear() {
    setContent("");
    setEditing(null);
    setParent(null);
    setAppointmentId(0);
    onDirtyChange(false);
  }
  const create = trpc.mindos.createClinicalRecord.useMutation({
    onSuccess: async () => {
      await records.refetch();
      clear();
      toast.success("Rascunho salvo para o paciente selecionado.");
    },
  });
  const addendum = trpc.care.createRecord.useMutation({
    onSuccess: async () => {
      await records.refetch();
      clear();
      toast.success("Rascunho de adendo salvo.");
    },
  });
  const update = trpc.care.updateRecord.useMutation({
    onSuccess: async () => {
      await records.refetch();
      if (historyId > 0) await history.refetch();
      clear();
      setFinalizing(null);
      toast.success("Registro atualizado com histórico preservado.");
    },
  });
  const busy = create.isPending || addendum.isPending || update.isPending;
  const error = create.error || addendum.error || update.error;
  const access = trpc.care.recordAccess.useQuery(
    { patientId },
    { retry: false }
  );
  const showEditor = records.data && profile.data;
  return (
    <div className="space-y-4">
      {profile.data && (
        <h2 className="font-bold">
          {profile.data.fullName} • #{patientId}
        </h2>
      )}
      {(records.isLoading || profile.isLoading) && (
        <p role="status">Carregando prontuário…</p>
      )}
      {(records.error || profile.error) && (
        <p role="alert" className="text-red-700">
          {records.error?.message || profile.error?.message}
        </p>
      )}
      {showEditor && (
        <>
          {access.data?.canWrite && (
            <form
              className="rounded-2xl border bg-white p-5 space-y-3"
              onSubmit={e => {
                e.preventDefault();
                if (editing)
                  update.mutate({
                    recordId: editing.id,
                    revision: editing.revision,
                    content: content.trim(),
                    finalize: false,
                  });
                else if (parent)
                  addendum.mutate({
                    patientId,
                    recordType,
                    parentRecordId: parent.id,
                    appointmentId: parent.appointmentId || undefined,
                    content: content.trim(),
                  });
                else
                  create.mutate({
                    patientId,
                    recordType,
                    appointmentId: appointmentId || undefined,
                    content: content.trim(),
                  });
              }}
            >
              <h3 className="font-bold">
                {editing
                  ? `Editar rascunho #${editing.id}`
                  : parent
                    ? `Adendo ao registro #${parent.id}`
                    : "Novo rascunho"}
              </h3>
              <fieldset disabled={busy} className="space-y-3">
                <label className="block text-sm">
                  Tipo de registro
                  <select
                    className={fieldClass}
                    value={recordType}
                    disabled={Boolean(editing || parent)}
                    onChange={e => setRecordType(e.target.value as RecordType)}
                  >
                    {Object.entries(recordTypes).map(([value, label]) => (
                      <option
                        key={value}
                        value={value}
                        disabled={
                          value === "RESTRICTED_NOTE" &&
                          !access.data?.canWriteRestricted
                        }
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {!editing && !parent && appointments.data && (
                  <label className="block text-sm">
                    Sessão vinculada (opcional)
                    <select
                      id="clinical-appointment"
                      className={fieldClass}
                      value={appointmentId}
                      onChange={e => setAppointmentId(Number(e.target.value))}
                    >
                      <option value={0}>Sem sessão vinculada</option>
                      {appointments.data.items.map(a => (
                        <option key={a.id} value={a.id}>
                          #{a.id} • {a.local.date} {a.local.time} • {a.status}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block text-sm">
                  Conteúdo
                  <textarea
                    required
                    maxLength={30000}
                    className={`${fieldClass} min-h-48`}
                    value={content}
                    onChange={e => {
                      setContent(e.target.value);
                      onDirtyChange(Boolean(e.target.value));
                    }}
                  />
                </label>
              </fieldset>
              {error && (
                <p role="alert" className="text-red-700">
                  {error.message}
                </p>
              )}
              <div className="flex gap-3">
                <button className={buttonClass} disabled={busy}>
                  {busy
                    ? "Salvando…"
                    : editing
                      ? "Salvar edição"
                      : parent
                        ? "Salvar adendo"
                        : "Salvar rascunho"}
                </button>
                <button
                  type="button"
                  className="border rounded-xl px-3 py-2"
                  disabled={busy}
                  onClick={clear}
                >
                  Descartar texto
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Somente o autor edita ou finaliza o rascunho. Após finalizar,
                mudanças ficam em adendos; notas restritas exigem concessão
                adicional.
              </p>
            </form>
          )}
          <section className="rounded-2xl border bg-white p-5">
            <h3 className="font-bold">
              Registros autorizados ({records.data.length})
            </h3>
            {records.data.length === 0 && (
              <p className="mt-3 text-sm text-slate-500">
                Nenhum registro para este paciente.
              </p>
            )}
            <div className="mt-4 space-y-4">
              {records.data.map(record => (
                <article
                  key={record.id}
                  className="border-t pt-3 space-y-2"
                  data-record-id={record.id}
                >
                  <p className="font-semibold text-sm">
                    {recordTypes[record.recordType]} •{" "}
                    {record.status === "DRAFT"
                      ? "Rascunho"
                      : record.status === "ADDENDUM"
                        ? "Adendo finalizado"
                        : "Finalizado"}{" "}
                    • v{record.version} • #{record.id}
                  </p>
                  {record.parentRecordId && (
                    <p className="text-xs text-slate-500">
                      Adendo ao registro #{record.parentRecordId}.
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap">
                    {record.content}
                  </p>
                  <p className="text-xs text-slate-500">
                    Autor: {record.authorName} (conta #{record.authorUserId}) •{" "}
                    {new Date(record.createdAt).toLocaleString("pt-BR", {
                      timeZone: zone,
                    })}{" "}
                    •{" "}
                    {record.integrityStatus === "VERIFIED"
                      ? "Integridade verificada"
                      : "Legado: integridade anterior não verificável"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {record.canEdit && (
                      <>
                        <button
                          className="border rounded-xl px-3 py-2 text-sm"
                          disabled={Boolean(content) || busy}
                          onClick={() => {
                            create.reset();
                            update.reset();
                            setEditing(record);
                            setParent(null);
                            setRecordType(record.recordType);
                            setContent(record.content);
                            onDirtyChange(true);
                          }}
                        >
                          Editar rascunho
                        </button>
                        <button
                          className="border rounded-xl px-3 py-2 text-sm"
                          disabled={Boolean(content) || busy}
                          onClick={() => {
                            update.reset();
                            setFinalizing(record);
                          }}
                        >
                          Finalizar
                        </button>
                      </>
                    )}
                    {record.canAddendum && (
                      <button
                        className="border rounded-xl px-3 py-2 text-sm"
                        disabled={Boolean(content) || busy}
                        onClick={() => {
                          setParent(record);
                          setEditing(null);
                          setRecordType(record.recordType);
                        }}
                      >
                        Novo adendo
                      </button>
                    )}
                    <button
                      className="border rounded-xl px-3 py-2 text-sm"
                      onClick={() => setHistoryId(record.id)}
                    >
                      Ver histórico
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <Dialog
        open={Boolean(finalizing)}
        onOpenChange={open => {
          if (!open && !busy) setFinalizing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Finalizar registro</DialogTitle>
            <DialogDescription>
              Confira o conteúdo. Após finalizar, o registro não poderá ser
              sobrescrito; correções serão adendos identificados.
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{finalizing?.content}</p>
          {update.error && (
            <p role="alert" className="text-red-700">
              {update.error.message}
            </p>
          )}
          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => {
              if (finalizing)
                update.mutate({
                  recordId: finalizing.id,
                  revision: finalizing.revision,
                  finalize: true,
                });
            }}
          >
            Confirmar finalização
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={historyId > 0}
        onOpenChange={open => {
          if (!open) setHistoryId(0);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico do registro #{historyId}</DialogTitle>
            <DialogDescription>
              Versões verificadas com autoria e ação registradas. Legado sem
              versões anteriores permanece identificado.
            </DialogDescription>
          </DialogHeader>
          {history.isLoading && <p role="status">Carregando histórico…</p>}
          {history.error && <p role="alert">{history.error.message}</p>}
          {history.data?.length === 0 && (
            <p>Registro legado sem histórico verificável anterior.</p>
          )}
          {history.data?.map(v => (
            <article key={v.id} className="border-t pt-3">
              <p className="text-sm font-semibold">
                Revisão {v.revision} •{" "}
                {actionLabels[v.action] || "Alteração registrada"} • Autor #
                {v.actorUserId}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(v.createdAt).toLocaleString("pt-BR", {
                  timeZone: zone,
                })}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {(JSON.parse(v.snapshotJson) as { content: string }).content}
              </p>
            </article>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default function ClinicalRecord() {
  const { user, loading, isAuthenticated } = useAuth();
  const { patientId, selectPatient } = useSelectedPatient();
  const [pendingPatient, setPendingPatient] = useState<number | null>(null),
    [dirty, setDirty] = useState(false);
  return (
    <FinancialLayout
      operatorName={user?.name || "Conta autenticada"}
      contextLabel="Prontuário"
      showFiscalBanner={false}
    >
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Prontuário psicológico</h1>
        <SessionNotice loading={loading} authenticated={isAuthenticated} />
        {isAuthenticated && (
          <>
            <PatientSelector
              value={patientId}
              onChange={id => {
                if (dirty) setPendingPatient(id);
                else selectPatient(id);
              }}
            />
            {pendingPatient !== null && (
              <div role="alert" className="rounded-xl border bg-amber-50 p-4">
                <p>
                  Trocar de paciente descarta o texto não salvo deste
                  prontuário.
                </p>
                <button
                  className={buttonClass}
                  onClick={() => {
                    selectPatient(pendingPatient);
                    setPendingPatient(null);
                    setDirty(false);
                  }}
                >
                  Descartar e trocar
                </button>
                <button
                  className="ml-3 underline"
                  onClick={() => setPendingPatient(null)}
                >
                  Continuar editando
                </button>
              </div>
            )}
            {patientId > 0 && (
              <RecordWorkspace
                key={patientId}
                patientId={patientId}
                onDirtyChange={setDirty}
              />
            )}
          </>
        )}
      </div>
    </FinancialLayout>
  );
}
