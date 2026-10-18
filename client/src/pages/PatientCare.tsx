import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FinancialLayout } from "../components/FinancialLayout";
import {
  PatientSelector,
  SessionNotice,
  useSelectedPatient,
  fieldClass,
  buttonClass,
} from "../components/patients/PatientSelector";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
function download(id: number) {
  window.open(
    `/api/private-documents/${id}/download`,
    "_blank",
    "noopener,noreferrer"
  );
}
function DocumentPanel({
  patientId,
  canManage,
}: {
  patientId: number;
  canManage: boolean;
}) {
  const docs = trpc.care.documents.useQuery({ patientId }, { retry: false });
  const [title, setTitle] = useState(""),
    [scope, setScope] = useState<"ADMINISTRATIVE" | "CLINICAL">(
      "ADMINISTRATIVE"
    ),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const access = trpc.care.documentAccess.useMutation({
    onSuccess: () => {
      docs.refetch();
      toast.success("Acesso ao documento atualizado.");
    },
    onError: e => toast.error(e.message),
  });
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("Arquivo deve ter até 8 MB");
      const response = await fetch(`/api/private-documents/${patientId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
          "X-Document-Title": encodeURIComponent(title),
          "X-Document-Scope": scope,
        },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha no upload");
      setTitle("");
      setFile(null);
      form.reset();
      await docs.refetch();
      toast.success(
        "Documento enviado em modo privado. Libere no portal quando apropriado."
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="font-bold text-lg">Documentos privados</h2>
      {canManage && (
        <form
          onSubmit={upload}
          className="rounded-2xl border bg-white p-5 space-y-3"
        >
          <label className="block text-sm">
            Título
            <input
              required
              maxLength={180}
              className={fieldClass}
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Camada
            <select
              className={fieldClass}
              value={scope}
              onChange={e => setScope(e.target.value as typeof scope)}
            >
              <option value="ADMINISTRATIVE">Administrativo</option>
              <option value="CLINICAL">
                Clínico (exige vínculo e permissão)
              </option>
            </select>
          </label>
          <label className="block text-sm">
            Arquivo (PDF, PNG ou JPEG, até 8 MB)
            <input
              id="care-upload"
              type="file"
              required
              accept="application/pdf,image/png,image/jpeg"
              className={fieldClass}
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
          </label>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <button className={buttonClass} disabled={busy}>
            {busy ? "Enviando…" : "Enviar documento privado"}
          </button>
        </form>
      )}
      {docs.isLoading && <p role="status">Carregando documentos…</p>}
      {docs.error && (
        <p role="alert" className="text-red-700">
          {docs.error.message}
        </p>
      )}
      {docs.data?.length === 0 && <p>Nenhum documento cadastrado.</p>}
      {docs.data?.map(d => (
        <article
          key={d.id}
          className="border rounded-2xl bg-white p-4 space-y-2"
          data-document-id={d.id}
        >
          <p className="font-semibold">
            {d.title} • v{d.version}
          </p>
          <p className="text-sm text-slate-500">
            {d.status === "REVOKED"
              ? "Revogado"
              : d.portalVisible
                ? "Liberado no portal"
                : "Privado"}{" "}
            • {d.scope === "CLINICAL" ? "Clínico" : "Administrativo"}
            {!d.hasFile ? " • Legado sem arquivo" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {d.hasFile && d.status !== "REVOKED" && (
              <button
                className="border rounded-xl px-3 py-2"
                onClick={() => download(d.id)}
              >
                Baixar
              </button>
            )}
            {canManage && d.status !== "REVOKED" && (
              <>
                <button
                  className="border rounded-xl px-3 py-2"
                  disabled={
                    access.isPending || (!d.portalVisible && !d.hasFile)
                  }
                  onClick={() =>
                    access.mutate({
                      documentId: d.id,
                      revision: d.revision,
                      action: d.portalVisible ? "HIDE" : "RELEASE",
                    })
                  }
                >
                  {d.portalVisible ? "Ocultar do portal" : "Liberar no portal"}
                </button>
                <button
                  className="border rounded-xl px-3 py-2"
                  disabled={access.isPending}
                  onClick={() =>
                    access.mutate({
                      documentId: d.id,
                      revision: d.revision,
                      action: "REVOKE",
                    })
                  }
                >
                  Revogar documento
                </button>
              </>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
function AssignmentPanel({ patientId }: { patientId: number }) {
  const links = trpc.care.assignments.useQuery({ patientId }, { retry: false });
  const update = trpc.care.assign.useMutation({
    onSuccess: () => {
      links.refetch();
      toast.success("Vínculo clínico atualizado.");
    },
    onError: e => toast.error(e.message),
  });
  return (
    <section className="rounded-2xl border bg-white p-5 space-y-3">
      <h2 className="font-bold">Profissionais autorizados ao paciente</h2>
      <p className="text-sm text-slate-500">
        Psicólogos precisam de vínculo ativo e das permissões correspondentes.
        Administradores têm acesso de supervisão auditado.
      </p>
      {links.error && <p role="alert">{links.error.message}</p>}
      {links.data?.length === 0 && (
        <p>
          Nenhum psicólogo associado à clínica. Cadastre o acesso em Equipe
          primeiro.
        </p>
      )}
      {links.data?.map(l => (
        <label key={l.userId} className="flex gap-2 items-center border-t pt-3">
          <input
            type="checkbox"
            disabled={update.isPending || (!l.active && !l.assigned)}
            checked={l.assigned}
            onChange={e =>
              update.mutate({
                patientId,
                userId: l.userId,
                active: e.target.checked,
              })
            }
          />
          {l.name || `Conta #${l.userId}`}
          {!l.active ? " (conta inativa)" : ""}
        </label>
      ))}
    </section>
  );
}
function FinancialPanel({
  patientId,
  canManage,
}: {
  patientId: number;
  canManage: boolean;
}) {
  const links = trpc.care.financialLinks.useQuery(
    { patientId },
    { retry: false }
  );
  const [code, setCode] = useState("");
  const mutation = trpc.care.financialAccess.useMutation({
    onSuccess: () => {
      setCode("");
      links.refetch();
      toast.success("Visibilidade financeira atualizada.");
    },
    onError: e => toast.error(e.message),
  });
  return (
    <section className="rounded-2xl border bg-white p-5 space-y-3">
      <h2 className="font-bold">Lançamentos no portal</h2>
      <p className="text-sm text-slate-500">
        Revise a identidade do paciente na cobrança antes de vincular seu
        código. Só lançamentos explicitamente vinculados e liberados aparecem no
        portal. Isso não confirma pagamento bancário nem emite documento fiscal.
      </p>
      {canManage && (
        <form
          className="flex gap-3 items-end"
          onSubmit={e => {
            e.preventDefault();
            mutation.mutate({ patientId, code, visible: true });
          }}
        >
          <label className="text-sm flex-1">
            Código da cobrança
            <input
              required
              maxLength={32}
              className={fieldClass}
              value={code}
              onChange={e => setCode(e.target.value)}
            />
          </label>
          <button className={buttonClass} disabled={mutation.isPending}>
            Vincular e liberar
          </button>
        </form>
      )}
      {links.error && <p role="alert">{links.error.message}</p>}
      {links.data?.length === 0 && <p>Nenhum lançamento vinculado.</p>}
      {links.data?.map(row => (
        <div key={row.id} className="border-t pt-3 flex justify-between gap-3">
          <div>
            <p>
              {row.code} • {row.title}
            </p>
            <p className="text-sm text-slate-500">
              {(row.totalAmount / 100).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}{" "}
              • {row.status} • {row.portalVisible ? "Liberado" : "Oculto"}
            </p>
          </div>
          {canManage && (
            <button
              className="border rounded-xl px-3 py-2"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  patientId,
                  code: row.code,
                  visible: !row.portalVisible,
                })
              }
            >
              {row.portalVisible ? "Ocultar" : "Liberar"}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
function ConsentHistoryPanel({
  patientId,
  timezone,
}: {
  patientId: number;
  timezone: string;
}) {
  const query = trpc.care.consentHistory.useQuery(
    { patientId },
    { retry: false }
  );
  return (
    <section className="rounded-2xl border bg-white p-5 space-y-3">
      <h2 className="font-bold">Evidências de consentimento</h2>
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data?.length === 0 && <p>Nenhuma decisão registrada no portal.</p>}
      {query.data?.map(d => {
        const snapshot = JSON.parse(d.snapshotJson) as {
          title: string;
          version: number;
          body: string;
          actorName: string;
        };
        return (
          <details key={d.id} className="border-t pt-3">
            <summary>
              {snapshot.title} • v{snapshot.version} • {d.decision} •{" "}
              {new Date(d.decidedAt).toLocaleString("pt-BR", {
                timeZone: timezone,
              })}
            </summary>
            <p className="text-sm mt-2">
              {snapshot.actorName} • conta #{d.actorUserId}
            </p>
            <p className="whitespace-pre-wrap text-sm mt-2">{snapshot.body}</p>
            <p className="text-xs break-all mt-2 text-slate-500">
              Evidência: {d.evidenceHash}
            </p>
          </details>
        );
      })}
    </section>
  );
}
export default function PatientCare() {
  const { user, loading, isAuthenticated } = useAuth();
  const { patientId, selectPatient } = useSelectedPatient();
  const access = trpc.patients.list.useQuery(
    { pageSize: 1 },
    { enabled: isAuthenticated, retry: false }
  );
  const [tab, setTab] = useState("documents");
  const data = access.data;
  return (
    <FinancialLayout
      operatorName={user?.name || "Conta autenticada"}
      contextLabel={data?.tenantName || "Documentos e portal"}
      showFiscalBanner={false}
    >
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Documentos e acesso do paciente</h1>
        <SessionNotice loading={loading} authenticated={isAuthenticated} />
        {access.error && <p role="alert">{access.error.message}</p>}
        {isAuthenticated && (
          <>
            <PatientSelector value={patientId} onChange={selectPatient} />
            <nav className="flex flex-wrap gap-2">
              {[
                ["documents", "Documentos", data?.canViewDocuments],
                ["consents", "Consentimentos", data?.canViewDocuments],
                ["assignments", "Acesso clínico", data?.canManageTeam],
                ["financial", "Financeiro no portal", data?.canViewFinancial],
              ]
                .filter(([, , allowed]) => allowed)
                .map(([id, label]) => (
                  <button
                    key={String(id)}
                    className={`border rounded-xl px-4 py-2 ${tab === id ? "bg-indigo-600 text-white" : "bg-white"}`}
                    onClick={() => setTab(String(id))}
                  >
                    {label}
                  </button>
                ))}
            </nav>
            {patientId > 0 && (
              <div key={patientId}>
                {tab === "documents" && data?.canViewDocuments && (
                  <DocumentPanel
                    patientId={patientId}
                    canManage={data.canManageDocuments}
                  />
                )}{" "}
                {tab === "consents" && data?.canViewDocuments && (
                  <ConsentHistoryPanel
                    patientId={patientId}
                    timezone={data.timezone}
                  />
                )}{" "}
                {tab === "assignments" && data?.canManageTeam && (
                  <AssignmentPanel patientId={patientId} />
                )}{" "}
                {tab === "financial" && data?.canViewFinancial && (
                  <FinancialPanel
                    patientId={patientId}
                    canManage={data.canManageFinancial}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </FinancialLayout>
  );
}
