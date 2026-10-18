import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { FinancialLayout } from "../components/FinancialLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  fieldClass,
  buttonClass,
  SessionNotice,
} from "../components/patients/PatientSelector";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import {
  CONTACT_CHANNEL_LABELS,
  PATIENT_STATUSES,
  PATIENT_STATUS_LABELS,
  patientInput,
  type PatientInput,
} from "../../../shared/patients";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type Patient = inferRouterOutputs<AppRouter>["patients"]["get"];
const empty = (): PatientInput => ({
  fullName: "",
  preferredName: "",
  email: "",
  phone: "",
  birthDate: "",
  administrativeStatus: "LEAD",
  preferredChannel: "WHATSAPP_DISCREET",
});

function PatientEditor({
  patient,
  onSaved,
}: {
  patient: Patient | null;
  onSaved: () => void;
}) {
  const [data, setData] = useState<PatientInput>(() =>
    patient
      ? {
          fullName: patient.fullName,
          preferredName: patient.preferredName || "",
          email: patient.email || "",
          phone: patient.phone || "",
          birthDate: patient.birthDate,
          administrativeStatus: patient.administrativeStatus,
          preferredChannel: patient.preferredChannel,
        }
      : empty()
  );
  const [validation, setValidation] = useState("");
  const create = trpc.patients.create.useMutation({ onSuccess: onSaved });
  const update = trpc.patients.update.useMutation({ onSuccess: onSaved });
  const busy = create.isPending || update.isPending;
  const error = create.error || update.error;
  const change = <K extends keyof PatientInput>(
    key: K,
    value: PatientInput[K]
  ) => {
    setData(prev => ({ ...prev, [key]: value }));
    setValidation("");
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = patientInput.safeParse(data);
    if (!parsed.success) {
      setValidation(parsed.error.issues[0].message);
      return;
    }
    if (patient)
      update.mutate({
        patientId: patient.id,
        revision: patient.revision,
        data: parsed.data,
      });
    else create.mutate(parsed.data);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset
        disabled={busy}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <label className="text-sm sm:col-span-2">
          Nome completo *
          <input
            autoFocus
            required
            minLength={2}
            maxLength={160}
            className={fieldClass}
            value={data.fullName}
            onChange={e => change("fullName", e.target.value)}
          />
        </label>
        <label className="text-sm">
          Nome de preferência
          <input
            maxLength={96}
            className={fieldClass}
            value={data.preferredName}
            onChange={e => change("preferredName", e.target.value)}
          />
        </label>
        <label className="text-sm">
          Nascimento
          <input
            type="date"
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
            className={fieldClass}
            value={data.birthDate}
            onChange={e => change("birthDate", e.target.value)}
          />
        </label>
        <label className="text-sm">
          E-mail
          <input
            type="email"
            maxLength={200}
            className={fieldClass}
            value={data.email}
            onChange={e => change("email", e.target.value)}
          />
        </label>
        <label className="text-sm">
          Telefone
          <input
            type="tel"
            maxLength={40}
            className={fieldClass}
            value={data.phone}
            onChange={e => change("phone", e.target.value)}
          />
        </label>
        <label className="text-sm">
          Canal preferido
          <select
            className={fieldClass}
            value={data.preferredChannel}
            onChange={e =>
              change(
                "preferredChannel",
                e.target.value as PatientInput["preferredChannel"]
              )
            }
          >
            {Object.entries(CONTACT_CHANNEL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Situação
          <select
            className={fieldClass}
            value={data.administrativeStatus}
            onChange={e =>
              change(
                "administrativeStatus",
                e.target.value as PatientInput["administrativeStatus"]
              )
            }
          >
            {PATIENT_STATUSES.map(status => (
              <option key={status} value={status}>
                {PATIENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      {["INACTIVE", "CLOSED"].includes(data.administrativeStatus) && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Ao salvar, novos agendamentos ficam bloqueados para este paciente. O
          histórico e os agendamentos existentes serão preservados.
        </p>
      )}
      {(validation || error) && (
        <p role="alert" className="text-sm text-red-700">
          {validation || error?.message}
        </p>
      )}
      <button className={buttonClass} disabled={busy}>
        {busy ? "Salvando…" : "Salvar paciente"}
      </button>
    </form>
  );
}

export default function Patients() {
  const { user, loading, isAuthenticated } = useAuth();
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<
    "ALL" | PatientInput["administrativeStatus"]
  >("ALL");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ patient: Patient | null } | null>(
    null
  );
  const utils = trpc.useUtils();
  const query = trpc.patients.list.useQuery(
    { search, status, page },
    { enabled: isAuthenticated, retry: false }
  );
  const result = query.data;
  async function saved() {
    setEditor(null);
    toast.success("Cadastro de paciente salvo.");
    await Promise.all([
      utils.patients.invalidate(),
      utils.mindos.patient360.invalidate(),
      utils.team.overview.invalidate(),
    ]);
  }
  return (
    <FinancialLayout
      operatorName={user?.name || "Conta autenticada"}
      contextLabel={result?.tenantName || "Pacientes"}
      showFiscalBanner={false}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Pacientes</h1>
            <p className="text-sm text-slate-500">
              Cadastro administrativo da clínica, sem conteúdo de prontuário.
            </p>
          </div>
          {result?.canManage && (
            <button
              className={buttonClass}
              onClick={() => setEditor({ patient: null })}
            >
              Novo paciente
            </button>
          )}
        </div>
        <SessionNotice loading={loading} authenticated={isAuthenticated} />
        {isAuthenticated && (
          <>
            <form
              className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4"
              onSubmit={e => {
                e.preventDefault();
                setSearch(text.trim());
                setPage(1);
              }}
            >
              <label className="flex-1 min-w-40 text-sm">
                Buscar pacientes
                <input
                  type="search"
                  maxLength={160}
                  className={fieldClass}
                  placeholder="Nome, e-mail ou telefone"
                  value={text}
                  onChange={e => setText(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Situação
                <select
                  className={fieldClass}
                  value={status}
                  onChange={e => {
                    setStatus(e.target.value as typeof status);
                    setPage(1);
                  }}
                >
                  <option value="ALL">Todas</option>
                  {PATIENT_STATUSES.map(s => (
                    <option key={s} value={s}>
                      {PATIENT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <button className={buttonClass} disabled={query.isFetching}>
                Buscar
              </button>
            </form>
            {query.isLoading && <p role="status">Carregando pacientes…</p>}
            {query.error && (
              <div role="alert">
                <p className="text-red-700">{query.error.message}</p>
                <button className={buttonClass} onClick={() => query.refetch()}>
                  Tentar novamente
                </button>
              </div>
            )}
            {result && (
              <>
                <p className="text-sm text-slate-500">
                  {result.total} paciente(s) encontrado(s)
                  {!result.canManage ? " • Acesso de consulta" : ""}
                </p>
                <div className="overflow-x-auto rounded-2xl border bg-white">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Pacientes da clínica</caption>
                    <thead className="bg-slate-50">
                      <tr>
                        {["Paciente", "Contato", "Situação", "Ações"].map(s => (
                          <th key={s} className="p-4">
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map(p => (
                        <tr key={p.id} className="border-t">
                          <td className="p-4">
                            <Link
                              className="font-semibold text-indigo-700 underline"
                              href={`/patients/view?patientId=${p.id}`}
                            >
                              {p.fullName}
                            </Link>
                            <div className="text-xs text-slate-500">
                              #{p.id}
                              {p.preferredName ? ` • ${p.preferredName}` : ""}
                            </div>
                          </td>
                          <td className="p-4">
                            <div>{p.email || "Sem e-mail"}</div>
                            <div>{p.phone || "Sem telefone"}</div>
                          </td>
                          <td className="p-4">
                            {PATIENT_STATUS_LABELS[p.administrativeStatus]}
                          </td>
                          <td className="p-4">
                            {result.canManage && (
                              <button
                                className="rounded-lg border px-3 py-2"
                                onClick={() => setEditor({ patient: p })}
                                aria-label={`Editar ${p.fullName}`}
                              >
                                Editar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.items.length === 0 && (
                    <p className="p-8 text-center text-slate-500">
                      Nenhum paciente encontrado. Ajuste os filtros ou cadastre
                      um paciente.
                    </p>
                  )}
                </div>
                <div className="flex justify-between items-center gap-2">
                  <button
                    className={buttonClass}
                    disabled={page <= 1 || query.isFetching}
                    onClick={() => setPage(p => p - 1)}
                  >
                    Anterior
                  </button>
                  <span className="text-sm">
                    Página {page} de{" "}
                    {Math.max(1, Math.ceil(result.total / result.pageSize))}
                  </span>
                  <button
                    className={buttonClass}
                    disabled={
                      page * result.pageSize >= result.total || query.isFetching
                    }
                    onClick={() => setPage(p => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </>
            )}
          </>
        )}
        <Dialog
          open={Boolean(editor && isAuthenticated && result?.canManage)}
          onOpenChange={open => {
            if (!open) setEditor(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editor?.patient ? "Editar paciente" : "Novo paciente"}
              </DialogTitle>
              <DialogDescription>
                Dados administrativos. Não inclua informações clínicas neste
                cadastro.
              </DialogDescription>
            </DialogHeader>
            {editor && (
              <PatientEditor
                key={editor.patient?.id || "new"}
                patient={editor.patient}
                onSaved={saved}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </FinancialLayout>
  );
}
