import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { trpc } from "../lib/trpc";
import {
  PatientSelector,
  buttonClass,
  fieldClass,
} from "./patients/PatientSelector";
import {
  appointmentInput,
  clinicParts,
  type AppointmentInput,
} from "../../../shared/scheduling";

export default function AppointmentForm({
  initial,
  editing = false,
  seriesAvailable = true,
  single = false,
  busy,
  error,
  onSubmit,
}: {
  initial?: Partial<AppointmentInput>;
  editing?: boolean;
  seriesAvailable?: boolean;
  single?: boolean;
  busy: boolean;
  error?: string;
  onSubmit: (data: AppointmentInput, scope: "ONE" | "SERIES") => void;
}) {
  const context = trpc.scheduling.context.useQuery();
  const timezone = context.data?.clinic.timezone || "America/Sao_Paulo";
  const [data, setData] = useState<AppointmentInput>(() => ({
    patientId: 0,
    professionalId: 0,
    unitId: 0,
    serviceId: 0,
    mode: "IN_PERSON",
    date: clinicParts(new Date(), timezone).date,
    time: "09:00",
    count: 1,
    intervalWeeks: 1,
    ...initial,
  }));
  const [scope, setScope] = useState<"ONE" | "SERIES">("ONE");
  const [validation, setValidation] = useState("");
  const change = <K extends keyof AppointmentInput>(
    key: K,
    value: AppointmentInput[K]
  ) => setData(previous => ({ ...previous, [key]: value }));
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = appointmentInput.safeParse(data);
    if (!parsed.success) {
      setValidation(
        "Selecione paciente, profissional, unidade, serviço e datas válidas."
      );
      return;
    }
    setValidation("");
    onSubmit(parsed.data, scope);
  }
  if (context.isLoading)
    return <p role="status">Carregando opções da agenda…</p>;
  if (context.error) return <p role="alert">{context.error.message}</p>;
  const options = context.data!;
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        <PatientSelector
          disabled={editing}
          value={data.patientId}
          onChange={id => change("patientId", id)}
        />
        {editing && (
          <p className="text-sm text-slate-500">
            Reagendamento mantém o paciente original. O histórico da sessão
            anterior será preservado.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Profissional
            <select
              required
              id="schedule-professional"
              className={fieldClass}
              value={data.professionalId || ""}
              onChange={e => change("professionalId", Number(e.target.value))}
            >
              <option value="">Selecione</option>
              {options.professionals
                .filter(p => p.active)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            Unidade
            <select
              required
              id="schedule-unit"
              className={fieldClass}
              value={data.unitId || ""}
              onChange={e => change("unitId", Number(e.target.value))}
            >
              <option value="">Selecione</option>
              {options.units
                .filter(p => p.active)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            Serviço
            <select
              required
              id="schedule-service"
              className={fieldClass}
              value={data.serviceId || ""}
              onChange={e => change("serviceId", Number(e.target.value))}
            >
              <option value="">Selecione</option>
              {options.services
                .filter(p => p.active)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.durationMinutes} min)
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            Modalidade
            <select
              id="schedule-mode"
              className={fieldClass}
              value={data.mode}
              onChange={e =>
                change("mode", e.target.value as AppointmentInput["mode"])
              }
            >
              <option value="IN_PERSON">Presencial</option>
              <option value="ONLINE">Online</option>
            </select>
          </label>
          <label className="text-sm">
            Data na clínica
            <input
              required
              id="schedule-date"
              type="date"
              className={fieldClass}
              value={data.date}
              onChange={e => change("date", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Horário na clínica
            <input
              required
              id="schedule-time"
              type="time"
              className={fieldClass}
              value={data.time}
              onChange={e => change("time", e.target.value)}
            />
          </label>
          {editing ? (
            <label className="text-sm sm:col-span-2">
              Aplicar alteração
              <select
                id="schedule-scope"
                className={fieldClass}
                value={scope}
                onChange={e => setScope(e.target.value as typeof scope)}
              >
                <option value="ONE">Somente esta ocorrência</option>
                {seriesAvailable && (
                  <option value="SERIES">
                    Esta e as próximas agendadas/confirmadas da série
                  </option>
                )}
              </select>
            </label>
          ) : (
            !single && (
              <>
                <label className="text-sm">
                  Número de sessões
                  <input
                    id="schedule-count"
                    required
                    type="number"
                    min={1}
                    max={24}
                    className={fieldClass}
                    value={data.count}
                    onChange={e => change("count", Number(e.target.value))}
                  />
                </label>
                <label className="text-sm">
                  Intervalo em semanas
                  <input
                    id="schedule-interval"
                    required
                    type="number"
                    min={1}
                    max={8}
                    className={fieldClass}
                    value={data.intervalWeeks}
                    onChange={e =>
                      change("intervalWeeks", Number(e.target.value))
                    }
                  />
                </label>
              </>
            )
          )}
        </div>
      </fieldset>
      <p className="text-sm text-slate-500">
        Fuso: {timezone}. A duração vem do serviço. Todas as ocorrências devem
        caber na disponibilidade; um conflito impede salvar a série inteira.
      </p>
      {options.canConfigure && (
        <Link
          href="/app/scheduling"
          className="block text-sm text-indigo-700 underline"
        >
          Configurar profissionais, serviços e disponibilidade
        </Link>
      )}
      {(validation || error) && (
        <p role="alert" className="text-red-700">
          {validation || error}
        </p>
      )}
      <button className={buttonClass} disabled={busy}>
        {busy
          ? "Salvando…"
          : editing
            ? "Salvar reagendamento"
            : "Salvar agendamento"}
      </button>
    </form>
  );
}
