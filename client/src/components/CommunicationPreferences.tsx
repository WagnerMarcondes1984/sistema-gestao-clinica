import { useState } from "react";
import { trpc } from "../lib/trpc";
import { buttonClass } from "./patients/PatientSelector";
export function CommunicationPreferences() {
  const q = trpc.crm.myPreferences.useQuery(undefined, { retry: false }),
    save = trpc.crm.saveMyPreferences.useMutation();
  const [error, setError] = useState("");
  async function toggle(channel: "emailAllowed" | "whatsappAllowed") {
    if (!q.data) return;
    try {
      await save.mutateAsync({ ...q.data, [channel]: !q.data[channel] });
      await q.refetch();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="space-y-4">
      <h2 className="font-bold">Preferências de comunicação</h2>
      <p>
        Escolha se deseja receber lembretes administrativos por estes canais.
        Você pode retirar a autorização a qualquer momento. Os provedores ainda
        não foram configurados; nenhuma mensagem é enviada por esta tela.
      </p>
      {q.error && <p role="alert">{q.error.message}</p>}
      {error && <p role="alert">{error}</p>}
      {q.data && (
        <div className="flex flex-wrap gap-3">
          <button
            className={buttonClass}
            disabled={save.isPending || q.isFetching}
            onClick={() => toggle("emailAllowed")}
          >
            E-mail: {q.data.emailAllowed ? "autorizado" : "bloqueado"}
          </button>
          <button
            className={buttonClass}
            disabled={save.isPending || q.isFetching}
            onClick={() => toggle("whatsappAllowed")}
          >
            WhatsApp: {q.data.whatsappAllowed ? "autorizado" : "bloqueado"}
          </button>
        </div>
      )}
      <p className="text-sm text-slate-500">
        O canal preferido e o contato do cadastro também precisam estar
        disponíveis. Seu prontuário não é incluído nos lembretes.
      </p>
    </div>
  );
}
