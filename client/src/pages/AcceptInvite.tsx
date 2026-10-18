import { useEffect, useState } from "react";
import { Link } from "wouter";
import { PENDING_INVITE_KEY } from "@shared/const";
import { ROLE_LABELS, PERMISSION_LABELS } from "../../../shared/permissions";
import { useAuth } from "../_core/hooks/useAuth";
import { startLogin } from "../const";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

function readInviteToken() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (token) return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY) || "";
  } catch {
    return "";
  }
}

export default function AcceptInvite() {
  const [token, setToken] = useState(readInviteToken);
  const [acceptedRole, setAcceptedRole] = useState<string | null>(null);
  const { user, isAuthenticated, loading, logout } = useAuth();
  const utils = trpc.useUtils();
  const preview = trpc.team.previewInvite.useMutation();
  const verify = preview.mutate;
  const accept = trpc.team.acceptInvite.useMutation({
    onSuccess: async result => {
      try {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
      } catch {}
      setAcceptedRole(result.role);
      setToken("");
      await utils.team.overview.invalidate();
      toast.success("Convite aceito. Seu vínculo foi registrado.");
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    if (!token) return;
    try {
      sessionStorage.setItem(PENDING_INVITE_KEY, token);
    } catch {}
    if (window.location.hash)
      window.history.replaceState(null, "", window.location.pathname);
  }, [token]);
  useEffect(() => {
    if (isAuthenticated && token) verify({ token });
  }, [isAuthenticated, user?.id, token, verify]);
  const buttonClass =
    "rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <main className="max-w-lg mx-auto rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-extrabold text-indigo-700"
        >
          <ShieldCheck className="w-5 h-5" aria-hidden="true" /> MindOS
        </Link>
        <h1 className="text-2xl font-extrabold text-slate-900">
          Convite de acesso
        </h1>
        {acceptedRole ? (
          <>
            <p className="text-sm text-emerald-800" role="status">
              Convite aceito. Seu acesso está ativo.
            </p>
            <Link
              href={
                acceptedRole === "PATIENT"
                  ? "/portal"
                  : acceptedRole === "FINANCIAL"
                    ? "/finance"
                    : acceptedRole === "CLINIC_ADMIN"
                      ? "/app/team"
                      : "/"
              }
              className="inline-block rounded-xl bg-indigo-600 px-4 py-2.5 text-white font-semibold"
            >
              Acessar sistema
            </Link>
          </>
        ) : !token ? (
          <p role="alert" className="text-sm text-slate-600">
            Nenhum convite válido foi informado. Solicite um novo link ao
            administrador.
          </p>
        ) : loading ? (
          <p role="status">Verificando sessão…</p>
        ) : !isAuthenticated ? (
          <>
            <p className="text-sm text-slate-600">
              Entre com a conta do e-mail destinatário para verificar e aceitar
              este convite.
            </p>
            <button className={buttonClass} onClick={startLogin}>
              Entrar para aceitar convite
            </button>
          </>
        ) : preview.isPending ? (
          <p role="status">Verificando convite…</p>
        ) : preview.isError ? (
          <>
            <p role="alert" className="text-sm text-red-800">
              {preview.error.message}
            </p>
            <p className="text-xs text-slate-500">
              Conta atual: {user?.email || "e-mail não informado"}
            </p>
            <div className="flex gap-3">
              <button className={buttonClass} onClick={() => verify({ token })}>
                Verificar novamente
              </button>
              <button
                className="text-sm font-semibold text-indigo-700"
                onClick={() => void logout()}
              >
                Sair da conta
              </button>
            </div>
          </>
        ) : preview.data ? (
          <>
            <p className="text-sm text-slate-600">
              Você foi convidado para <strong>{preview.data.clinicName}</strong>
              .
            </p>
            <dl className="rounded-xl bg-slate-50 p-4 text-sm space-y-3">
              <div>
                <dt className="text-slate-500">Conta destinatária</dt>
                <dd className="font-semibold break-all">
                  {preview.data.email}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Papel</dt>
                <dd className="font-semibold">
                  {ROLE_LABELS[preview.data.role]}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Validade</dt>
                <dd>
                  {new Date(preview.data.expiresAt).toLocaleString("pt-BR")}
                </dd>
              </div>
            </dl>
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Acesso concedido
              </h2>
              {preview.data.permissions.length ? (
                <ul className="list-disc pl-5 mt-2 text-sm text-slate-600 space-y-1">
                  {preview.data.permissions.map(permission => (
                    <li key={permission}>{PERMISSION_LABELS[permission]}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600 mt-2">
                  Somente o portal do paciente vinculado à sua conta.
                </p>
              )}
            </div>
            <button
              className={buttonClass}
              disabled={accept.isPending}
              onClick={() => accept.mutate({ token })}
            >
              {accept.isPending ? "Aceitando…" : "Aceitar convite"}
            </button>
          </>
        ) : (
          <p role="status">Preparando a verificação…</p>
        )}
        <p className="text-xs text-slate-500 border-t pt-4">
          O convite é pessoal e de uso único. Não compartilhe o link.
        </p>
      </main>
    </div>
  );
}
