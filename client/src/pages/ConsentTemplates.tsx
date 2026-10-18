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
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import {
  SessionNotice,
  buttonClass,
  fieldClass,
} from "../components/patients/PatientSelector";
type Draft = {
  id?: number;
  revision?: number;
  code: string;
  title: string;
  body: string;
};
export default function ConsentTemplates() {
  const { user, loading, isAuthenticated } = useAuth();
  const ctx = trpc.scheduling.context.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const terms = trpc.care.consentTemplates.useQuery(undefined, {
    enabled: isAuthenticated && Boolean(ctx.data?.canConfigure),
    retry: false,
  });
  const [editing, setEditing] = useState<Draft | null>(null);
  const [action, setAction] = useState<{
    id: number;
    revision: number;
    retire: boolean;
    title: string;
    body: string;
  } | null>(null);
  const save = trpc.care.saveConsent.useMutation({
    onSuccess: () => {
      setEditing(null);
      terms.refetch();
      toast.success("Versão salva como rascunho.");
    },
  });
  const publish = trpc.care.publishConsent.useMutation({
    onSuccess: () => {
      setAction(null);
      terms.refetch();
      toast.success("Publicação de termo atualizada.");
    },
  });
  return (
    <FinancialLayout
      operatorName={user?.name || "Conta autenticada"}
      contextLabel="Consentimentos versionados"
      showFiscalBanner={false}
    >
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Termos de consentimento</h1>
        <SessionNotice loading={loading} authenticated={isAuthenticated} />
        <p className="text-sm text-slate-500">
          Termos publicados são imutáveis. Alterações exigem nova versão; cada
          decisão do paciente preserva o texto e a identidade autenticada. Este
          fluxo registra aceite eletrônico simples.
        </p>
        {(ctx.error || terms.error) && (
          <p role="alert">{ctx.error?.message || terms.error?.message}</p>
        )}
        {isAuthenticated && ctx.data && !ctx.data.canConfigure && (
          <p>Somente a administração pode gerenciar os termos.</p>
        )}
        {isAuthenticated && ctx.data?.canConfigure && (
          <>
            <button
              className={buttonClass}
              onClick={() => {
                save.reset();
                setEditing({ code: "", title: "", body: "" });
              }}
            >
              Novo termo
            </button>
            {terms.data?.length === 0 && <p>Nenhum termo cadastrado.</p>}
            {terms.data?.map(t => (
              <article
                key={t.id}
                className="rounded-2xl border bg-white p-5 space-y-3"
                data-template-id={t.id}
              >
                <h2 className="font-semibold">
                  {t.title} • {t.code} • v{t.version} •{" "}
                  {t.status === "DRAFT"
                    ? "Rascunho"
                    : t.status === "PUBLISHED"
                      ? "Publicado"
                      : "Retirado"}
                </h2>
                <p className="text-sm whitespace-pre-wrap">{t.body}</p>
                <div className="flex flex-wrap gap-2">
                  {t.status === "DRAFT" ? (
                    <>
                      <button
                        className="border rounded-xl px-3 py-2"
                        onClick={() => {
                          save.reset();
                          setEditing({
                            id: t.id,
                            revision: t.revision,
                            code: t.code,
                            title: t.title,
                            body: t.body,
                          });
                        }}
                      >
                        Editar rascunho
                      </button>
                      <button
                        className={buttonClass}
                        onClick={() => {
                          publish.reset();
                          setAction({ ...t, retire: false });
                        }}
                      >
                        Publicar versão
                      </button>
                    </>
                  ) : (
                    <button
                      className="border rounded-xl px-3 py-2"
                      onClick={() => {
                        save.reset();
                        setEditing({
                          code: t.code,
                          title: t.title,
                          body: t.body,
                        });
                      }}
                    >
                      Criar nova versão
                    </button>
                  )}
                  {t.status === "PUBLISHED" && (
                    <button
                      className="border rounded-xl px-3 py-2"
                      onClick={() => {
                        publish.reset();
                        setAction({ ...t, retire: true });
                      }}
                    >
                      Retirar publicação
                    </button>
                  )}
                </div>
              </article>
            ))}
          </>
        )}
        <Dialog
          open={Boolean(editing && isAuthenticated && ctx.data?.canConfigure)}
          onOpenChange={open => {
            if (!open && !save.isPending) setEditing(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Rascunho de termo</DialogTitle>
              <DialogDescription>
                Revise o texto com os responsáveis da clínica antes de publicar.
              </DialogDescription>
            </DialogHeader>
            {editing && (
              <form
                className="space-y-3"
                onSubmit={e => {
                  e.preventDefault();
                  save.mutate(editing);
                }}
              >
                <label className="block text-sm">
                  Código (letras minúsculas, números e hífen)
                  <input
                    required
                    minLength={2}
                    maxLength={64}
                    pattern="[a-z0-9-]+"
                    disabled={Boolean(editing.id)}
                    className={fieldClass}
                    value={editing.code}
                    onChange={e =>
                      setEditing({ ...editing, code: e.target.value })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Título
                  <input
                    id="consent-title"
                    required
                    maxLength={180}
                    className={fieldClass}
                    value={editing.title}
                    onChange={e =>
                      setEditing({ ...editing, title: e.target.value })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Texto integral
                  <textarea
                    required
                    maxLength={30000}
                    className={`${fieldClass} min-h-56`}
                    value={editing.body}
                    onChange={e =>
                      setEditing({ ...editing, body: e.target.value })
                    }
                  />
                </label>
                {save.error && (
                  <p role="alert" className="text-red-700">
                    {save.error.message}
                  </p>
                )}
                <button className={buttonClass} disabled={save.isPending}>
                  Salvar versão
                </button>
              </form>
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(action && isAuthenticated)}
          onOpenChange={open => {
            if (!open && !publish.isPending) setAction(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {action?.retire
                  ? "Retirar termo publicado"
                  : "Publicar termo imutável"}
              </DialogTitle>
              <DialogDescription>
                {action?.retire
                  ? "Novos aceites serão bloqueados. Evidências anteriores serão preservadas."
                  : "A versão publicada aparecerá no portal e substituirá a versão anterior do mesmo código para novas decisões."}
              </DialogDescription>
            </DialogHeader>
            <p className="font-semibold">{action?.title}</p>
            <p className="whitespace-pre-wrap text-sm">{action?.body}</p>
            {publish.error && (
              <p role="alert" className="text-red-700">
                {publish.error.message}
              </p>
            )}
            <button
              className={buttonClass}
              disabled={publish.isPending}
              onClick={() => {
                if (action)
                  publish.mutate({
                    id: action.id,
                    revision: action.revision,
                    retire: action.retire,
                  });
              }}
            >
              Confirmar publicação
            </button>
          </DialogContent>
        </Dialog>
      </div>
    </FinancialLayout>
  );
}
