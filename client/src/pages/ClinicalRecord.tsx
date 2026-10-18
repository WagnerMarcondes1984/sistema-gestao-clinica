import { useState } from "react";
import { toast } from "sonner";
import { FinancialLayout } from "../components/FinancialLayout";
import {
  PatientSelector,
  SessionNotice,
  useSelectedPatient,
  buttonClass,
  fieldClass,
} from "../components/patients/PatientSelector";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";

const recordTypes = {
  ANAMNESIS: "Anamnese",
  EVOLUTION: "Evolução",
  RESTRICTED_NOTE: "Nota restrita",
  GOAL: "Objetivo",
  CARE_PLAN: "Plano de cuidado",
};
type RecordType = keyof typeof recordTypes;
function RecordWorkspace({
  patientId,
  onDirtyChange,
}: {
  patientId: number;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [recordType, setRecordType] = useState<RecordType>("EVOLUTION");
  const [content, setContent] = useState("");
  const [validation, setValidation] = useState("");
  const records = trpc.mindos.clinicalRecords.useQuery(
    { patientId },
    { retry: false }
  );
  const profile = trpc.patients.get.useQuery({ patientId }, { retry: false });
  const create = trpc.mindos.createClinicalRecord.useMutation({
    onSuccess: () => {
      setContent("");
      onDirtyChange(false);
      records.refetch();
      toast.success("Rascunho salvo para o paciente selecionado.");
    },
  });
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
      {records.data && profile.data && (
        <>
          <form
            className="rounded-2xl border bg-white p-5 space-y-3"
            onSubmit={e => {
              e.preventDefault();
              if (!content.trim()) {
                setValidation("Escreva o conteúdo antes de salvar.");
                return;
              }
              create.mutate({ patientId, recordType, content: content.trim() });
            }}
          >
            <h3 className="font-bold">Novo rascunho</h3>
            <label className="block text-sm">
              Tipo de registro
              <select
                className={fieldClass}
                value={recordType}
                onChange={e => setRecordType(e.target.value as RecordType)}
              >
                {Object.entries(recordTypes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Conteúdo
              <textarea
                required
                className={`${fieldClass} min-h-48`}
                value={content}
                onChange={e => {
                  setContent(e.target.value);
                  onDirtyChange(Boolean(e.target.value));
                  setValidation("");
                }}
              />
            </label>
            {(validation || create.error) && (
              <p role="alert" className="text-red-700">
                {validation || create.error?.message}
              </p>
            )}
            <button className={buttonClass} disabled={create.isPending}>
              {create.isPending ? "Salvando…" : "Salvar rascunho"}
            </button>
            <p className="text-xs text-slate-500">
              O servidor verifica a permissão de escrita. Notas restritas exigem
              concessão adicional. A conclusão do fluxo de versões e adendos
              pertence à etapa 4.
            </p>
          </form>
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
                <article key={record.id} className="border-t pt-3">
                  <div className="font-semibold text-sm">
                    {recordTypes[record.recordType]} • {record.status} • v
                    {record.version}
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-wrap">
                    {record.content}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {new Date(record.createdAt).toLocaleString("pt-BR")} •{" "}
                    {record.integrityHash
                      ? "Hash registrado"
                      : "Sem hash registrado"}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
export default function ClinicalRecord() {
  const { user, loading, isAuthenticated } = useAuth();
  const { patientId, selectPatient } = useSelectedPatient();
  const [pendingPatient, setPendingPatient] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  // The selected workspace remounts when changing patients to prevent mixing drafts.
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
