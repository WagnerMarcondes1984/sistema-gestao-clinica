import { useState, type FormEvent } from "react";
import { useAuth } from "../_core/hooks/useAuth";
import { FinancialLayout } from "../components/FinancialLayout";
import { SessionNotice } from "../components/patients/PatientSelector";
import { trpc } from "../lib/trpc";
import {
  buttonClass,
  fieldClass,
} from "../components/patients/PatientSelector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  BLOCK_KINDS,
  BLOCK_LABELS,
  defaultSite,
  siteContent,
  type SiteContent,
} from "../../../shared/public-site";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
type Overview = inferRouterOutputs<AppRouter>["mindos"]["cms"]["versions"];
const statuses = {
  DRAFT: "Rascunho",
  PREVIEW: "Prévia legada",
  APPROVED: "Aprovada",
  PUBLISHED: "Publicada",
  ARCHIVED: "Arquivada",
};
function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium space-y-1">
      <span>{label}</span>
      <input {...props} className={fieldClass} />
    </label>
  );
}
function Text({
  label,
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block text-sm font-medium space-y-1">
      <span>{label}</span>
      <textarea {...props} className={fieldClass} rows={4} />
    </label>
  );
}
export default function AdminStudio() {
  const auth = useAuth(),
    q = trpc.mindos.cms.versions.useQuery(undefined, {
      enabled: auth.isAuthenticated,
      retry: false,
    });
  return (
    <FinancialLayout
      operatorName={auth.user?.name || undefined}
      contextLabel="Administração do site"
    >
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Admin Studio</h1>
        <SessionNotice
          loading={auth.loading}
          authenticated={auth.isAuthenticated}
        />
        {q.error && <p role="alert">{q.error.message}</p>}
        {q.isLoading && auth.isAuthenticated && (
          <p role="status">Carregando versões do site…</p>
        )}
        {q.data && (
          <Studio
            data={q.data}
            refresh={async () => {
              const r = await q.refetch();
              if (!r.data || r.error)
                throw r.error || new Error("Falha ao atualizar versões");
              return r.data;
            }}
          />
        )}
      </div>
    </FinancialLayout>
  );
}
function Studio({
  data,
  refresh,
}: {
  data: Overview;
  refresh: () => Promise<Overview>;
}) {
  const initial =
    data.versions.find(v => v.content && v.status === "DRAFT") ||
    data.versions.find(v => v.id === data.publishedVersionId);
  const [content, setContent] = useState<SiteContent>(() =>
    structuredClone(initial?.content || defaultSite(data.clinicName))
  );
  const [revision, setRevision] = useState(data.revision),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID()),
    [summary, setSummary] = useState("");
  const [selected, setSelected] = useState<number | null>(initial?.id || null),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState("brand"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [action, setAction] = useState<{
      kind: "approve" | "publish" | "rollback";
      version: Overview["versions"][number];
      revision: number;
    } | null>(null),
    [ack, setAck] = useState(false);
  const utils = trpc.useUtils();
  const save = trpc.mindos.cms.saveDraft.useMutation(),
    approve = trpc.mindos.cms.approve.useMutation(),
    publish = trpc.mindos.cms.publish.useMutation(),
    rollback = trpc.mindos.cms.rollback.useMutation();
  const change = (next: SiteContent) => {
    setContent(next);
    setDirty(true);
    setNotice("");
  };
  const block = (
    index: number,
    update: Partial<SiteContent["blocks"][number]>
  ) =>
    change({
      ...content,
      blocks: content.blocks.map((b, i) =>
        i === index ? { ...b, ...update } : b
      ),
    });
  async function load(v: Overview["versions"][number] | null) {
    if (dirty && !window.confirm("Descartar alterações não salvas do editor?"))
      return;
    const latest = await refresh();
    setContent(structuredClone(v?.content || defaultSite(data.clinicName)));
    setSelected(v?.id || null);
    setRevision(latest.revision);
    setRequestKey(crypto.randomUUID());
    setSummary("");
    setDirty(false);
    setError("");
    setNotice(
      v
        ? `Versão ${v.versionNumber} carregada. Alterações serão salvas em nova versão.`
        : "Novo rascunho preparado."
    );
  }
  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const parsed = siteContent.safeParse(content);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const r = await save.mutateAsync({
        content: parsed.data,
        revision,
        requestKey,
        changeSummary: summary,
      });
      const latest = await refresh();
      setRevision(latest.revision);
      setSelected(r.id);
      setRequestKey(crypto.randomUUID());
      setDirty(false);
      setNotice("Rascunho salvo. O site público continua na versão publicada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirmAction() {
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      const input = { versionId: action.version.id, revision: action.revision };
      await (
        action.kind === "approve"
          ? approve
          : action.kind === "publish"
            ? publish
            : rollback
      ).mutateAsync(input);
      const latest = await refresh();
      await utils.mindos.brand.invalidate();
      setRevision(latest.revision);
      setAction(null);
      setAck(false);
      setNotice(
        action.kind === "approve"
          ? "Versão aprovada. A publicação é uma ação separada."
          : "Site público atualizado na clínica atual."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        {data.clinicName} •{" "}
        {data.canEdit ? "Edição autorizada" : "Somente consulta"}
        {data.canPublish
          ? " • Aprovação e publicação autorizadas"
          : " • Publicação depende de administrador autorizado"}
      </p>
      <section className="border rounded-2xl bg-white p-5 space-y-3">
        <h2 className="font-bold">Situação do site</h2>
        <p>
          {data.publishedVersionId
            ? `Há uma versão publicada (#${data.versions.find(v => v.id === data.publishedVersionId)?.versionNumber || data.publishedVersionId}).`
            : "Nenhum conteúdo desta entrega foi publicado."}
        </p>
        <p>
          <a
            href={data.publicPath}
            target="_blank"
            rel="noreferrer"
            className="underline text-indigo-700"
          >
            Abrir site público
          </a>{" "}
          • <code className="break-all">{data.publicPath}</code>
        </p>
        <p className="text-sm">
          Domínio e certificado: DNS/TLS não verificados. O endereço canônico é
          somente uma informação editorial; a conexão de domínio depende da
          hospedagem.
        </p>
      </section>
      <nav
        aria-label="Seções do Admin Studio"
        className="flex gap-2 overflow-x-auto"
      >
        {[
          ["brand", "Marca e configurações"],
          ["blocks", "Blocos de conteúdo"],
          ["seo", "Metadados e contato"],
          ["versions", "Versões e publicação"],
          ["limits", "Integrações pendentes"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
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
      {error && !action && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="border rounded-xl bg-green-50 text-green-950 p-3"
        >
          {notice}
        </p>
      )}
      {tab !== "versions" && tab !== "limits" && (
        <form onSubmit={saveDraft} className="space-y-5">
          <p className="text-sm">
            Editor{" "}
            {selected
              ? `baseado na versão #${data.versions.find(v => v.id === selected)?.versionNumber || selected}`
              : "de novo rascunho"}
            . {dirty ? "Há alterações não salvas." : "Conteúdo carregado."}{" "}
            Salvar cria uma nova versão; publicação exige aprovação.
          </p>
          <fieldset
            disabled={busy || !data.canEdit}
            className="border rounded-2xl bg-white p-5 space-y-5"
          >
            {tab === "brand" && (
              <>
                <Field
                  label="Nome público"
                  id="site-name"
                  value={content.brand.name}
                  required
                  maxLength={160}
                  onChange={e =>
                    change({
                      ...content,
                      brand: { ...content.brand, name: e.target.value },
                    })
                  }
                />
                <Field
                  label="Marca textual (até 12 caracteres)"
                  value={content.brand.logoText}
                  maxLength={12}
                  onChange={e =>
                    change({
                      ...content,
                      brand: { ...content.brand, logoText: e.target.value },
                    })
                  }
                />
                <div className="flex gap-5 flex-wrap">
                  <Field
                    label="Cor principal"
                    type="color"
                    value={content.brand.primary}
                    onChange={e =>
                      change({
                        ...content,
                        brand: { ...content.brand, primary: e.target.value },
                      })
                    }
                  />
                  <Field
                    label="Cor de destaque"
                    type="color"
                    value={content.brand.accent}
                    onChange={e =>
                      change({
                        ...content,
                        brand: { ...content.brand, accent: e.target.value },
                      })
                    }
                  />
                </div>
                <p className="text-sm">
                  A marca publicada aparece no site, no cabeçalho do sistema e
                  no portal. Upload de imagens e scripts personalizados não está
                  disponível nesta entrega.
                </p>
                <label className="block">
                  <input
                    type="checkbox"
                    checked={content.bookingEnabled}
                    onChange={e =>
                      change({ ...content, bookingEnabled: e.target.checked })
                    }
                  />{" "}
                  Exibir atalhos públicos para agendamento
                </label>
                <label className="block">
                  <input
                    type="checkbox"
                    checked={content.portalEnabled}
                    onChange={e =>
                      change({ ...content, portalEnabled: e.target.checked })
                    }
                  />{" "}
                  Exibir atalho público para o portal
                </label>
                <p className="text-sm">
                  Essas opções controlam os atalhos do site; não revogam contas
                  nem alteram as permissões dos módulos.
                </p>
              </>
            )}
            {tab === "blocks" && (
              <>
                <p>
                  Publique somente informações institucionais. Profissionais e
                  serviços destes blocos são textos públicos revisados;
                  cadastros internos e prontuários não são importados.
                </p>
                {content.blocks.map((b, i) => (
                  <section
                    key={b.id}
                    data-block-id={b.id}
                    className="border rounded-xl p-4 space-y-3"
                  >
                    <h2 className="font-bold">
                      Bloco {i + 1} — {BLOCK_LABELS[b.kind]}
                    </h2>
                    <label className="block">
                      Tipo
                      <select
                        className={fieldClass}
                        value={b.kind}
                        onChange={e =>
                          block(i, { kind: e.target.value as typeof b.kind })
                        }
                      >
                        {BLOCK_KINDS.map(k => (
                          <option key={k} value={k}>
                            {BLOCK_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <input
                        type="checkbox"
                        checked={b.enabled}
                        onChange={e => block(i, { enabled: e.target.checked })}
                      />{" "}
                      Visível no site
                    </label>
                    <Field
                      label="Título do bloco"
                      value={b.title}
                      maxLength={160}
                      onChange={e => block(i, { title: e.target.value })}
                    />
                    <Text
                      label="Texto do bloco"
                      value={b.body}
                      maxLength={3000}
                      onChange={e => block(i, { body: e.target.value })}
                    />
                    {b.items.map((item, j) => (
                      <div key={j} className="border-l-4 pl-3 space-y-2">
                        <Field
                          label={
                            b.kind === "FAQ"
                              ? `Pergunta ${j + 1}`
                              : `Título do item ${j + 1}`
                          }
                          value={item.title}
                          maxLength={160}
                          onChange={e =>
                            block(i, {
                              items: b.items.map((x, n) =>
                                n === j ? { ...x, title: e.target.value } : x
                              ),
                            })
                          }
                        />
                        <Text
                          label={
                            b.kind === "FAQ"
                              ? `Resposta ${j + 1}`
                              : `Texto do item ${j + 1}`
                          }
                          value={item.body}
                          maxLength={1500}
                          onChange={e =>
                            block(i, {
                              items: b.items.map((x, n) =>
                                n === j ? { ...x, body: e.target.value } : x
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            block(i, {
                              items: b.items.filter((_, n) => n !== j),
                            })
                          }
                        >
                          Remover item {j + 1}
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-4 text-sm underline">
                      <button
                        type="button"
                        disabled={b.items.length >= 12}
                        onClick={() =>
                          block(i, {
                            items: [...b.items, { title: "", body: "" }],
                          })
                        }
                      >
                        Adicionar item
                      </button>
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => {
                          const a = [...content.blocks];
                          [a[i - 1], a[i]] = [a[i], a[i - 1]];
                          change({ ...content, blocks: a });
                        }}
                      >
                        Mover acima
                      </button>
                      <button
                        type="button"
                        disabled={i === content.blocks.length - 1}
                        onClick={() => {
                          const a = [...content.blocks];
                          [a[i + 1], a[i]] = [a[i], a[i + 1]];
                          change({ ...content, blocks: a });
                        }}
                      >
                        Mover abaixo
                      </button>
                      <button
                        type="button"
                        disabled={content.blocks.length === 1}
                        onClick={() =>
                          change({
                            ...content,
                            blocks: content.blocks.filter((_, n) => n !== i),
                          })
                        }
                      >
                        Remover bloco
                      </button>
                    </div>
                  </section>
                ))}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={content.blocks.length >= 16}
                  onClick={() =>
                    change({
                      ...content,
                      blocks: [
                        ...content.blocks,
                        {
                          id: crypto.randomUUID(),
                          kind: "ABOUT",
                          enabled: true,
                          title: "",
                          body: "",
                          items: [],
                        },
                      ],
                    })
                  }
                >
                  Adicionar bloco
                </button>
              </>
            )}
            {tab === "seo" && (
              <>
                <Field
                  id="site-seo-title"
                  label="Título nos buscadores"
                  required
                  maxLength={100}
                  value={content.seo.title}
                  onChange={e =>
                    change({
                      ...content,
                      seo: { ...content.seo, title: e.target.value },
                    })
                  }
                />
                <Text
                  id="site-description"
                  label="Descrição pública"
                  required
                  minLength={10}
                  maxLength={300}
                  value={content.seo.description}
                  onChange={e =>
                    change({
                      ...content,
                      seo: { ...content.seo, description: e.target.value },
                    })
                  }
                />
                <Field
                  label="Origem canônica HTTPS (opcional)"
                  maxLength={300}
                  placeholder="https://clinica.example.com"
                  value={content.seo.publicOrigin}
                  onChange={e =>
                    change({
                      ...content,
                      seo: { ...content.seo, publicOrigin: e.target.value },
                    })
                  }
                />
                {(
                  [
                    ["city", "Cidade", 120],
                    ["address", "Endereço público", 300],
                    ["email", "E-mail público", 200],
                    ["phone", "Telefone público", 40],
                  ] as const
                ).map(([key, label, max]) => (
                  <Field
                    key={key}
                    label={label}
                    type={key === "email" ? "email" : "text"}
                    maxLength={max}
                    value={content.contact[key]}
                    onChange={e =>
                      change({
                        ...content,
                        contact: { ...content.contact, [key]: e.target.value },
                      })
                    }
                  />
                ))}
                <p className="text-sm">
                  Título, descrição, dados estruturados e llms.txt são gerados
                  no servidor exclusivamente a partir da versão publicada. Não
                  há índices, avaliações ou credenciais profissionais
                  inventados.
                </p>
              </>
            )}
            <Field
              id="site-summary"
              label="Resumo da alteração (mínimo 8 caracteres)"
              value={summary}
              minLength={8}
              maxLength={255}
              required
              onChange={e => setSummary(e.target.value)}
            />
            <button type="submit" className={buttonClass}>
              Salvar novo rascunho
            </button>
          </fieldset>
        </form>
      )}
      {tab === "versions" && (
        <section className="space-y-4">
          <p>
            Prévia é privada e exige acesso ao site desta clínica. Versões
            publicadas são imutáveis; editar salva uma nova versão. Conteúdo
            legado exige novo rascunho revisado.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => void load(null).catch(e => setError(e.message))}
            >
              Novo rascunho
            </button>
            <button
              className="border rounded-xl p-2"
              disabled={busy}
              onClick={() => void refresh().catch(e => setError(e.message))}
            >
              Atualizar versões
            </button>
          </div>
          {data.versions.map(v => (
            <article
              key={v.id}
              data-version-id={v.id}
              className="border rounded-2xl bg-white p-5 space-y-3"
            >
              <h2 className="font-bold">
                Versão {v.versionNumber} • {statuses[v.status]}
                {v.legacy ? " • Legada (não publicável)" : ""}
              </h2>
              <p>{v.changeSummary || "Sem resumo registrado"}</p>
              <p className="text-sm">
                Autor #{v.createdByUserId} •{" "}
                {new Date(v.createdAt).toLocaleString("pt-BR", {
                  timeZone: data.timezone,
                })}
                {v.approvedByUserId
                  ? ` • Aprovação: conta #${v.approvedByUserId}`
                  : ""}
              </p>
              <div className="flex gap-3 flex-wrap">
                {v.content && (
                  <>
                    <a
                      href={`/api/site-preview/${v.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="border rounded-xl p-2"
                    >
                      Abrir prévia privada
                    </a>
                    {data.canEdit && (
                      <button
                        type="button"
                        disabled={busy}
                        className="border rounded-xl p-2"
                        onClick={() =>
                          void load(v)
                            .then(() => setTab("brand"))
                            .catch(e => setError(e.message))
                        }
                      >
                        Carregar no editor
                      </button>
                    )}
                  </>
                )}
                {data.canPublish &&
                  !v.legacy &&
                  (v.status === "DRAFT" ||
                    v.status === "APPROVED" ||
                    (v.status === "ARCHIVED" &&
                      v.publishedAt &&
                      v.approvedAt)) && (
                    <button
                      type="button"
                      disabled={busy || dirty}
                      className={buttonClass}
                      onClick={() => {
                        setError("");
                        setAck(false);
                        setAction({
                          kind:
                            v.status === "DRAFT"
                              ? "approve"
                              : v.status === "APPROVED"
                                ? "publish"
                                : "rollback",
                          version: v,
                          revision: data.revision,
                        });
                      }}
                    >
                      {v.status === "DRAFT"
                        ? "Aprovar versão"
                        : v.status === "APPROVED"
                          ? "Publicar versão"
                          : "Restaurar versão"}
                    </button>
                  )}
              </div>
            </article>
          ))}
        </section>
      )}
      {tab === "limits" && (
        <section className="border rounded-2xl bg-white p-5 space-y-3">
          <h2 className="font-bold">Serviços ainda não configurados</h2>
          <p>
            Pagamentos bancários e emissão fiscal: provedores a definir. O
            financeiro registra movimentos internos; emissão e estorno externos
            dependem de integração.
          </p>
          <p>
            E-mail e WhatsApp: provedores a definir. O CRM prepara lembretes sem
            enviar mensagens.
          </p>
          <p>
            Teleatendimento por vídeo, conexão de domínio e verificação DNS/TLS:
            indisponíveis nesta entrega. Upload público de mídia não está
            implementado.
          </p>
          <p>
            Login Manus mantido; o fluxo real depende das credenciais do
            ambiente. Configurações de privacidade, permissões e documentos são
            geridas nos módulos próprios.
          </p>
        </section>
      )}
      <Dialog
        open={!!action}
        onOpenChange={v => {
          if (!v && !busy) {
            setAction(null);
            setError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "approve"
                ? "Aprovar conteúdo"
                : action?.kind === "rollback"
                  ? "Restaurar publicação"
                  : "Publicar conteúdo"}
            </DialogTitle>
            <DialogDescription>
              Confira a versão antes de confirmar. A operação vale somente para{" "}
              {data.clinicName}.
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy} className="space-y-4">
            <p>
              Versão {action?.version.versionNumber} —{" "}
              {action?.version.content?.brand.name}
            </p>
            <p>{action?.version.changeSummary}</p>
            <p>
              {action?.kind === "approve"
                ? "A aprovação preserva o site público atual. Publique em uma ação separada."
                : "Esta versão substituirá o conteúdo público atual, inclusive marca e metadados."}
            </p>
            <label className="block">
              <input
                id="site-action-ack"
                type="checkbox"
                checked={ack}
                onChange={e => setAck(e.target.checked)}
              />{" "}
              Conferi o conteúdo e autorizo esta operação.
            </label>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <button
              className={buttonClass}
              disabled={!ack}
              onClick={() => void confirmAction()}
            >
              Confirmar operação
            </button>
          </fieldset>
        </DialogContent>
      </Dialog>
    </>
  );
}
