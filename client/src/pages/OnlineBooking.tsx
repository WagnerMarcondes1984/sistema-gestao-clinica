import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { trpc } from "../lib/trpc";
import { publicBookingInput, clinicParts } from "../../../shared/scheduling";
import {
  buttonClass,
  fieldClass,
} from "../components/patients/PatientSelector";
export default function OnlineBooking() {
  const clinicSlug =
    new URLSearchParams(window.location.search).get("clinic") || undefined;
  const context = trpc.publicMindos.scheduling.useQuery(
    clinicSlug ? { clinicSlug } : undefined,
    {
      retry: false,
    }
  );
  const [validation, setValidation] = useState("");
  const request = trpc.publicMindos.requestBooking.useMutation();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = publicBookingInput.safeParse({
      clinicSlug,
      name: form.get("name"),
      contactChannel: form.get("contactChannel"),
      contactValue: form.get("contactValue"),
      serviceId: Number(form.get("serviceId")),
      date: form.get("date"),
      time: form.get("time"),
      consent: form.get("consent") === "on",
      website: String(form.get("website") || ""),
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0].message);
      return;
    }
    setValidation("");
    request.mutate(parsed.data);
  }
  return (
    <main className="min-h-screen bg-slate-50 p-5">
      <div className="mx-auto max-w-xl space-y-5">
        <a
          href={
            clinicSlug ? `/site/${encodeURIComponent(clinicSlug)}` : "/site"
          }
          className="font-bold text-indigo-700"
        >
          {context.data?.clinicName || "Clínica"}
        </a>
        <h1 className="text-3xl font-bold">Solicitar um horário</h1>
        <p className="text-slate-600">
          {context.data?.clinicName || "Clínica"}. Informe somente dados para
          contato. Esta solicitação será analisada pela equipe e ainda não
          reserva um horário.
        </p>
        {request.data ? (
          <section className="rounded-2xl bg-white border p-6">
            <h2 className="font-bold text-xl">Solicitação recebida</h2>
            <p className="mt-3">
              Protocolo #{request.data.requestId}. Aguarde o contato da equipe
              para confirmar disponibilidade.
            </p>
          </section>
        ) : (
          <form
            onSubmit={submit}
            className="rounded-2xl bg-white border p-6 space-y-4"
          >
            <fieldset disabled={request.isPending} className="space-y-4">
              <label className="block text-sm">
                Nome
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={160}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                Canal de contato
                <select name="contactChannel" className={fieldClass}>
                  <option value="WHATSAPP_DISCREET">WhatsApp discreto</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="PHONE">Telefone</option>
                </select>
              </label>
              <label className="block text-sm">
                Telefone ou e-mail
                <input
                  name="contactValue"
                  required
                  maxLength={200}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                Serviço
                <select
                  name="serviceId"
                  required
                  className={fieldClass}
                  defaultValue=""
                >
                  <option value="">Selecione</option>
                  {context.data?.services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min)
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Data na clínica
                  <input
                    name="date"
                    type="date"
                    required
                    min={
                      context.data
                        ? clinicParts(new Date(), context.data.timezone).date
                        : undefined
                    }
                    className={fieldClass}
                  />
                </label>
                <label className="text-sm">
                  Horário na clínica
                  <input
                    name="time"
                    type="time"
                    required
                    className={fieldClass}
                  />
                </label>
              </div>
              <p className="text-sm text-slate-500">
                Fuso: {context.data?.timezone || "carregando…"}.
              </p>
              <label className="flex gap-2 text-sm">
                <input name="consent" type="checkbox" required /> Autorizo o uso
                destes dados para contato sobre esta solicitação.
              </label>
              <div className="hidden" aria-hidden="true">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
            </fieldset>
            {context.isLoading && <p role="status">Carregando serviços…</p>}
            {(context.error || request.error || validation) && (
              <p role="alert" className="text-red-700">
                {validation || request.error?.message || context.error?.message}
              </p>
            )}
            {context.data?.services.length === 0 && (
              <p>Nenhum serviço público disponível no momento.</p>
            )}
            <button
              className={buttonClass}
              disabled={request.isPending || !context.data?.services.length}
            >
              {request.isPending ? "Enviando…" : "Solicitar horário"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
