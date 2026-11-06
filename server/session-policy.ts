// Compartilhado pelo assinador e pelo callback: nenhuma sessão ganha um prazo
// maior por usar um caminho diferente de criação do cookie.
export function sessionTtlMs() {
  const hours = Number(process.env.SESSION_TTL_HOURS || 8);
  if (!Number.isFinite(hours) || hours < 1 || hours > 24)
    throw new Error("SESSION_TTL_HOURS deve estar entre 1 e 24");
  return hours * 3600000;
}
