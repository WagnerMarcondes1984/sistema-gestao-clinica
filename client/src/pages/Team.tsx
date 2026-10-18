import { useState, type FormEvent } from "react";
import { FinancialLayout } from "../components/FinancialLayout";
import {
  AccessFields,
  type AccessValue,
} from "../components/team/AccessFields";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { useAuth } from "../_core/hooks/useAuth";
import { startLogin } from "../const";
import { trpc } from "../lib/trpc";
import {
  permissionsForRole,
  ROLE_LABELS,
  type TeamRole,
} from "../../../shared/permissions";
import { toast } from "sonner";
import { UsersRound, ShieldCheck, Copy, Link2 } from "lucide-react";

const initialAccess = (): AccessValue => ({
  role: "RECEPTIONIST",
  permissions: permissionsForRole("RECEPTIONIST"),
});
const buttonClass =
  "rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
const inputClass =
  "mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm";

export default function Team() {
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const overview = trpc.team.overview.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<AccessValue>(initialAccess);
  const [inviteLink, setInviteLink] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [slug, setSlug] = useState("");
  const [editing, setEditing] = useState<{
    membershipId: number;
    name: string;
    active: boolean;
    access: AccessValue;
  } | null>(null);
  const refresh = () => utils.team.overview.invalidate();
  const createClinic = trpc.team.createClinic.useMutation({
    onSuccess: async () => {
      toast.success(
        "Clínica criada e sua associação de proprietário registrada."
      );
      await refresh();
    },
    onError: error => toast.error(error.message),
  });
  const createInvite = trpc.team.createInvite.useMutation({
    onSuccess: async result => {
      setInviteLink(`${window.location.origin}/invite#token=${result.token}`);
      setEmail("");
      setAccess(initialAccess());
      toast.success(
        "Convite criado. Copie o link para compartilhar com o destinatário."
      );
      await refresh();
    },
    onError: error => toast.error(error.message),
  });
  const revoke = trpc.team.revokeInvite.useMutation({
    onSuccess: async () => {
      toast.success("Convite cancelado.");
      setInviteLink("");
      await refresh();
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.team.updateMember.useMutation({
    onSuccess: async () => {
      setEditing(null);
      toast.success("Acesso atualizado e registrado na auditoria.");
      await refresh();
    },
    onError: error => toast.error(error.message),
  });
  const data = overview.data;
  const canGrantAdmin = data?.role === "OWNER" || data?.role === "SUPER_ADMIN";
  const submitInvite = (event: FormEvent) => {
    event.preventDefault();
    createInvite.mutate({ email, ...access });
  };
  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    if (editing)
      update.mutate({
        membershipId: editing.membershipId,
        active: editing.active,
        ...editing.access,
      });
  };

  return (
    <FinancialLayout
      operatorName={user?.name || "Visitante"}
      contextLabel={data?.clinic?.name || "Acesso da clínica"}
      showFiscalBanner={false}
    >
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold uppercase tracking-wide">
            <UsersRound className="w-4 h-4" aria-hidden="true" /> Administração
            de acesso
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-2">
            Equipe e acessos
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {data?.clinic?.name ??
              "Gerencie os vínculos da sua clínica e os convites de acesso."}
          </p>
        </header>
        {loading ? (
          <p role="status">Verificando sessão…</p>
        ) : !isAuthenticated ? (
          <section className="rounded-2xl border bg-white p-6 space-y-4">
            <p>Entre para gerenciar seus vínculos.</p>
            <button className={buttonClass} onClick={startLogin}>
              Entrar
            </button>
          </section>
        ) : overview.isLoading ? (
          <p role="status">Carregando acessos…</p>
        ) : overview.isError ? (
          <section
            role="alert"
            className="rounded-2xl border bg-white p-6 space-y-3"
          >
            <p>{overview.error.message}</p>
            <button
              className="text-indigo-700 font-semibold"
              onClick={() => void overview.refetch()}
            >
              Tentar novamente
            </button>
          </section>
        ) : data?.state !== "ACTIVE" ? (
          <section className="rounded-2xl border bg-white p-6 space-y-4">
            <h2 className="font-bold">
              {data?.state === "INACTIVE"
                ? "Acesso indisponível"
                : "Conta sem clínica vinculada"}
            </h2>
            <p className="text-sm text-slate-600">
              {data?.state === "INACTIVE"
                ? "Seu acesso está desativado ou a clínica está indisponível. Solicite revisão ao administrador."
                : "Peça um convite ao administrador. Para aceitar, use a conta com o e-mail destinatário."}
            </p>
            {data?.canCreateClinic && (
              <form
                onSubmit={event => {
                  event.preventDefault();
                  createClinic.mutate({ name: clinicName, slug });
                }}
                className="max-w-lg space-y-4 border-t pt-4"
              >
                <h3 className="font-semibold">Criar clínica autorizada</h3>
                <p className="text-xs text-slate-500">
                  Disponível somente ao administrador da instalação sem
                  associação anterior.
                </p>
                <label className="block text-sm font-semibold">
                  Nome da clínica
                  <input
                    required
                    minLength={2}
                    maxLength={160}
                    value={clinicName}
                    onChange={event => setClinicName(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Identificador
                  <input
                    required
                    minLength={3}
                    maxLength={80}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={slug}
                    onChange={event =>
                      setSlug(event.target.value.toLowerCase())
                    }
                    className={inputClass}
                  />
                  <span className="block text-xs font-normal text-slate-500 mt-1">
                    Use letras minúsculas, números e hífens.
                  </span>
                </label>
                <button
                  className={buttonClass}
                  disabled={createClinic.isPending}
                >
                  {createClinic.isPending
                    ? "Criando…"
                    : "Criar clínica e assumir propriedade"}
                </button>
              </form>
            )}
          </section>
        ) : !data.canManage ? (
          <section className="rounded-2xl border bg-white p-6">
            <h2 className="font-bold">Acesso restrito à administração</h2>
            <p className="text-sm text-slate-600 mt-2">
              Seu papel é {data.role ? ROLE_LABELS[data.role] : "não definido"}.
              Somente administradores autorizados gerenciam a equipe.
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="p-5 border-b">
                <h2 className="font-bold text-slate-900">Pessoas vinculadas</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Alterações entram em vigor nas próximas requisições. Dados
                  clínicos não aparecem nesta lista.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <caption className="sr-only">
                    Vínculos e permissões da clínica
                  </caption>
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      {["Pessoa", "Papel", "Situação", "Ação"].map(label => (
                        <th
                          key={label}
                          scope="col"
                          className="px-5 py-3 font-semibold"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.members.map(member => {
                      const protectedMember =
                        member.userId === data.currentUserId ||
                        ["OWNER", "SUPER_ADMIN"].includes(member.role) ||
                        (member.role === "CLINIC_ADMIN" && !canGrantAdmin);
                      return (
                        <tr key={member.id}>
                          <td className="px-5 py-4">
                            <span className="font-semibold text-slate-800">
                              {member.name || "Nome não informado"}
                            </span>
                            <span className="block text-xs text-slate-500 mt-1">
                              {member.email || "E-mail não informado"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {ROLE_LABELS[member.role]}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={
                                member.active
                                  ? "text-emerald-700"
                                  : "text-slate-500"
                              }
                            >
                              {member.active ? "Ativo" : "Desativado"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {protectedMember ? (
                              <span className="text-xs text-slate-500">
                                {member.userId === data.currentUserId
                                  ? "Sua conta"
                                  : "Acesso protegido"}
                              </span>
                            ) : (
                              <button
                                className="text-indigo-700 font-semibold"
                                aria-label={`Editar acesso de ${member.name || member.email}`}
                                onClick={() =>
                                  setEditing({
                                    membershipId: member.id,
                                    name:
                                      member.name || member.email || "Pessoa",
                                    active: member.active,
                                    access: {
                                      role: member.role as TeamRole,
                                      permissions: member.permissions,
                                      ...(member.patientId
                                        ? { patientId: member.patientId }
                                        : {}),
                                    },
                                  })
                                }
                              >
                                Editar acesso
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <h2 className="font-bold text-slate-900">Convidar pessoa</h2>
                <p className="text-xs text-slate-500">
                  O link vale por 72 horas e exige login com o e-mail indicado.
                  Não há envio automático de e-mail nesta entrega.
                </p>
                <form onSubmit={submitInvite} className="space-y-4">
                  <label className="block text-sm font-semibold text-slate-700">
                    E-mail destinatário
                    <input
                      type="email"
                      required
                      maxLength={320}
                      autoComplete="off"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      className={inputClass}
                      disabled={createInvite.isPending}
                    />
                  </label>
                  <AccessFields
                    value={access}
                    onChange={setAccess}
                    patients={data.patients}
                    canGrantAdmin={canGrantAdmin}
                    prefix="invite"
                    disabled={createInvite.isPending}
                  />
                  <button
                    className={buttonClass}
                    disabled={createInvite.isPending}
                  >
                    {createInvite.isPending
                      ? "Criando convite…"
                      : "Criar convite"}
                  </button>
                </form>
                {inviteLink && (
                  <div
                    role="status"
                    className="rounded-xl bg-indigo-50 p-4 space-y-2"
                  >
                    <label
                      htmlFor="created-invite-link"
                      className="block text-sm font-semibold text-indigo-900"
                    >
                      <Link2
                        className="inline w-4 h-4 mr-1"
                        aria-hidden="true"
                      />{" "}
                      Link criado
                    </label>
                    <input
                      id="created-invite-link"
                      readOnly
                      value={inviteLink}
                      className="w-full border rounded-lg bg-white p-2 text-xs"
                      onFocus={event => event.target.select()}
                    />
                    <button
                      className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteLink);
                          toast.success("Link copiado.");
                        } catch {
                          toast.error("Selecione o link e copie manualmente.");
                        }
                      }}
                    >
                      <Copy className="w-4 h-4" aria-hidden="true" /> Copiar
                      link
                    </button>
                    <p className="text-xs text-indigo-800">
                      Copie agora: o segredo não poderá ser consultado
                      novamente. Compartilhe somente com o destinatário.
                    </p>
                  </div>
                )}
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <h2 className="font-bold text-slate-900">Convites recentes</h2>
                {data.invites.length ? (
                  <ul className="divide-y">
                    {data.invites.map(invite => (
                      <li key={invite.id} className="py-3 space-y-2">
                        <div className="font-semibold text-sm break-all">
                          {invite.email}
                        </div>
                        <div className="text-xs text-slate-500">
                          {ROLE_LABELS[invite.role]} ·{" "}
                          {invite.expired
                            ? "Expirado"
                            : invite.status === "PENDING"
                              ? "Pendente"
                              : invite.status === "ACCEPTED"
                                ? "Aceito"
                                : "Cancelado"}
                        </div>
                        <div className="text-xs text-slate-500">
                          Validade:{" "}
                          {new Date(invite.expiresAt).toLocaleString("pt-BR")}
                        </div>
                        {invite.status === "PENDING" &&
                          (canGrantAdmin || invite.role !== "CLINIC_ADMIN") && (
                            <button
                              className="text-xs text-red-700 font-semibold"
                              disabled={revoke.isPending}
                              aria-label={`Cancelar convite para ${invite.email}`}
                              onClick={() =>
                                revoke.mutate({ inviteId: invite.id })
                              }
                            >
                              Cancelar convite
                            </button>
                          )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">
                    Nenhum convite criado.
                  </p>
                )}
              </section>
            </div>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" /> Criação,
              aceitação, cancelamento e alterações de acesso geram auditoria.
            </p>
          </>
        )}
        <Dialog
          open={isAuthenticated && !!data?.canManage && !!editing}
          onOpenChange={open => {
            if (!open && !update.isPending) setEditing(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar acesso</DialogTitle>
              <DialogDescription>
                {editing?.name} · As permissões serão aplicadas às próximas
                requisições.
              </DialogDescription>
            </DialogHeader>
            {editing && data && (
              <form onSubmit={submitEdit} className="space-y-5">
                <AccessFields
                  value={editing.access}
                  onChange={value => setEditing({ ...editing, access: value })}
                  patients={data.patients}
                  canGrantAdmin={canGrantAdmin}
                  prefix="edit"
                  disabled={update.isPending}
                />
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={editing.active}
                    disabled={update.isPending}
                    onChange={event =>
                      setEditing({ ...editing, active: event.target.checked })
                    }
                  />{" "}
                  Acesso ativo
                </label>
                {!editing.active && (
                  <p className="text-sm text-amber-800">
                    Esta pessoa perderá o acesso à clínica após salvar.
                  </p>
                )}
                <button className={buttonClass} disabled={update.isPending}>
                  {update.isPending ? "Salvando…" : "Salvar acesso"}
                </button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </FinancialLayout>
  );
}
