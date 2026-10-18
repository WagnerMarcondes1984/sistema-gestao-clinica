import { useState, type FormEvent } from "react";
import { z } from "zod";
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
  buttonClass,
  fieldClass,
  SessionNotice,
} from "../components/patients/PatientSelector";
import { configInput } from "../../../shared/scheduling";
type Config = z.infer<typeof configInput>;
const names = {
  professional: "Profissionais",
  unit: "Unidades",
  service: "Serviços",
  availability: "Disponibilidade",
};
const weekdays = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
const minuteTime = (v: number) =>
  `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
const timeMinute = (v: string) =>
  Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
function ConfigEditor({
  initial,
  onSaved,
}: {
  initial: Config;
  onSaved: () => void;
}) {
  const context = trpc.scheduling.context.useQuery();
  const [value, setValue] = useState(initial);
  const mutation = trpc.scheduling.saveConfig.useMutation({
    onSuccess: onSaved,
  });
  const [validation, setValidation] = useState("");
  const change = <K extends keyof Config>(key: K, v: Config[K]) =>
    setValue(prev => ({ ...prev, [key]: v }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = configInput.safeParse(value);
    if (!parsed.success) {
      setValidation(parsed.error.issues[0].message);
      return;
    }
    mutation.mutate(parsed.data);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={mutation.isPending} className="space-y-3">
        {value.kind !== "availability" ? (
          <label className="block text-sm">
            Nome
            <input
              id="config-name"
              autoFocus
              required
              minLength={2}
              maxLength={value.kind === "unit" ? 128 : 160}
              className={fieldClass}
              value={value.name || ""}
              onChange={e => change("name", e.target.value)}
            />
          </label>
        ) : (
          <>
            <label className="block text-sm">
              Profissional
              <select
                required
                id="config-professional"
                className={fieldClass}
                value={value.professionalId || ""}
                onChange={e => change("professionalId", Number(e.target.value))}
              >
                <option value="">Selecione</option>
                {context.data?.professionals.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.active ? " (inativo)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Unidade
              <select
                required
                id="config-unit"
                className={fieldClass}
                value={value.unitId || ""}
                onChange={e => change("unitId", Number(e.target.value))}
              >
                <option value="">Selecione</option>
                {context.data?.units.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.active ? " (inativa)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Dia da semana
              <select
                id="config-weekday"
                className={fieldClass}
                value={value.weekday ?? 1}
                onChange={e => change("weekday", Number(e.target.value))}
              >
                {weekdays.map((n, i) => (
                  <option key={i} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Início
                <input
                  id="config-start"
                  required
                  type="time"
                  className={fieldClass}
                  value={minuteTime(value.startMinute ?? 480)}
                  onChange={e =>
                    change("startMinute", timeMinute(e.target.value))
                  }
                />
              </label>
              <label className="text-sm">
                Fim
                <input
                  id="config-end"
                  required
                  type="time"
                  className={fieldClass}
                  value={minuteTime(
                    value.endMinute === 1440 ? 0 : (value.endMinute ?? 1080)
                  )}
                  onChange={e =>
                    change(
                      "endMinute",
                      e.target.value === "00:00"
                        ? 1440
                        : timeMinute(e.target.value)
                    )
                  }
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Fim às 00:00 representa meia-noite ao final do dia.
            </p>
          </>
        )}
        {value.kind === "professional" && (
          <>
            <label className="block text-sm">
              Registro profissional
              <input
                id="config-registration"
                maxLength={80}
                className={fieldClass}
                value={value.registration || ""}
                onChange={e => change("registration", e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Conta de acesso (opcional)
              <select
                className={fieldClass}
                value={value.userId || ""}
                onChange={e => change("userId", Number(e.target.value) || null)}
              >
                <option value="">Sem conta vinculada</option>
                {context.data?.accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name || `Conta #${a.id}`}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-500">
              Cadastro profissional não cria login. Vínculos de acesso continuam
              em Equipe.
            </p>
          </>
        )}
        {value.kind === "service" && (
          <>
            <label className="block text-sm">
              Duração em minutos
              <input
                id="config-duration"
                required
                type="number"
                min={10}
                max={240}
                className={fieldClass}
                value={value.durationMinutes ?? 50}
                onChange={e =>
                  change("durationMinutes", Number(e.target.value))
                }
              />
            </label>
            <label className="block text-sm">
              Modalidade
              <select
                id="config-mode"
                className={fieldClass}
                value={value.mode || "BOTH"}
                onChange={e => change("mode", e.target.value as Config["mode"])}
              >
                <option value="BOTH">Presencial e online</option>
                <option value="IN_PERSON">Presencial</option>
                <option value="ONLINE">Online</option>
              </select>
            </label>
            <label className="flex gap-2 text-sm">
              <input
                id="config-public"
                type="checkbox"
                checked={value.publicEnabled || false}
                onChange={e => change("publicEnabled", e.target.checked)}
              />{" "}
              Aceitar solicitações públicas para este serviço
            </label>
          </>
        )}
        <label className="flex gap-2 text-sm">
          <input
            id="config-active"
            type="checkbox"
            checked={value.active}
            onChange={e => change("active", e.target.checked)}
          />{" "}
          Cadastro ativo
        </label>
      </fieldset>
      {(validation || mutation.error) && (
        <p role="alert" className="text-red-700">
          {validation || mutation.error?.message}
        </p>
      )}
      <button className={buttonClass} disabled={mutation.isPending}>
        {mutation.isPending ? "Salvando…" : "Salvar configuração"}
      </button>
    </form>
  );
}
export default function SchedulingSettings() {
  const { user, loading, isAuthenticated } = useAuth();
  const query = trpc.scheduling.context.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const utils = trpc.useUtils();
  const [kind, setKind] = useState<Config["kind"]>("professional");
  const [editing, setEditing] = useState<Config | null>(null);
  const [timezone, setTimezone] = useState("");
  const tz = trpc.scheduling.saveTimezone.useMutation({
    onSuccess: async () => {
      toast.success("Fuso da clínica salvo.");
      await utils.scheduling.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const data = query.data;
  const rows: { id: number; label: string; detail: string; config: Config }[] =
    !data
      ? []
      : kind === "professional"
        ? data.professionals.map(p => ({
            id: p.id,
            label: p.name,
            detail: p.active ? "Ativo" : "Inativo",
            config: {
              kind: "professional",
              id: p.id,
              revision: p.revision,
              name: p.name,
              registration: p.registration || "",
              userId: p.userId,
              active: p.active,
            },
          }))
        : kind === "unit"
          ? data.units.map(p => ({
              id: p.id,
              label: p.name,
              detail: p.active ? "Ativa" : "Inativa",
              config: {
                kind: "unit",
                id: p.id,
                revision: p.revision,
                name: p.name,
                active: p.active,
              },
            }))
          : kind === "service"
            ? data.services.map(p => ({
                id: p.id,
                label: p.name,
                detail: `${p.active ? "Ativo" : "Inativo"} • ${p.durationMinutes} min • ${p.publicEnabled ? "Público" : "Interno"}`,
                config: {
                  kind: "service",
                  id: p.id,
                  revision: p.revision,
                  name: p.name,
                  active: p.active,
                  durationMinutes: p.durationMinutes,
                  mode: p.mode,
                  publicEnabled: p.publicEnabled,
                },
              }))
            : data.availability.map(p => ({
                id: p.id,
                label: `${data.professionals.find(a => a.id === p.professionalId)?.name || "Profissional"} • ${weekdays[p.weekday]} • ${minuteTime(p.startMinute)}–${minuteTime(p.endMinute)}`,
                detail: `${p.active ? "Ativa" : "Inativa"} • ${data.units.find(u => u.id === p.unitId)?.name || "Unidade"}`,
                config: {
                  kind: "availability",
                  id: p.id,
                  revision: p.revision,
                  professionalId: p.professionalId,
                  unitId: p.unitId,
                  weekday: p.weekday,
                  startMinute: p.startMinute,
                  endMinute: p.endMinute,
                  active: p.active,
                },
              }));
  const create = () =>
    setEditing({
      kind,
      active: true,
      ...(kind === "availability"
        ? { weekday: 1, startMinute: 480, endMinute: 1080 }
        : {}),
      ...(kind === "service"
        ? { durationMinutes: 50, mode: "BOTH", publicEnabled: false }
        : {}),
    });
  return (
    <FinancialLayout
      operatorName={user?.name || "Conta autenticada"}
      contextLabel={data?.clinic.name || "Configuração da agenda"}
      showFiscalBanner={false}
    >
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Configuração da agenda</h1>
        <SessionNotice loading={loading} authenticated={isAuthenticated} />
        {query.error && <p role="alert">{query.error.message}</p>}
        {isAuthenticated && data && (
          <>
            <p className="text-sm text-slate-500">
              Fuso da clínica: {data.clinic.timezone}. Inativar um recurso
              preserva as sessões existentes e impede novas reservas com ele.
            </p>
            {data.canConfigure && (
              <form
                className="flex items-end gap-3"
                onSubmit={e => {
                  e.preventDefault();
                  tz.mutate({
                    timezone: timezone || data.clinic.timezone,
                    expected: data.clinic.timezone,
                  });
                }}
              >
                <label className="text-sm flex-1">
                  Fuso IANA
                  <input
                    className={fieldClass}
                    placeholder={data.clinic.timezone}
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                  />
                </label>
                <button className={buttonClass} disabled={tz.isPending}>
                  Salvar fuso
                </button>
              </form>
            )}
            <div className="flex flex-wrap gap-2">
              {Object.entries(names).map(([k, label]) => (
                <button
                  key={k}
                  className={`rounded-xl px-4 py-2 border ${kind === k ? "bg-indigo-600 text-white" : "bg-white"}`}
                  onClick={() => setKind(k as Config["kind"])}
                >
                  {label}
                </button>
              ))}
            </div>
            {data.canConfigure && (
              <button className={buttonClass} onClick={create}>
                Novo cadastro
              </button>
            )}
            <div className="rounded-2xl border bg-white divide-y">
              {rows.map(row => (
                <div
                  key={row.id}
                  className="p-4 flex justify-between gap-3 items-center"
                >
                  <div>
                    <p className="font-semibold">{row.label}</p>
                    <p className="text-sm text-slate-500">{row.detail}</p>
                  </div>
                  {data.canConfigure && (
                    <button
                      className="border rounded-xl px-3 py-2"
                      onClick={() => setEditing(row.config)}
                      aria-label={`Editar configuração ${row.id}`}
                    >
                      Editar
                    </button>
                  )}
                </div>
              ))}
              {rows.length === 0 && (
                <p className="p-6 text-slate-500">
                  Nenhum cadastro nesta categoria.
                </p>
              )}
            </div>
          </>
        )}
        <Dialog
          open={Boolean(editing && data?.canConfigure && isAuthenticated)}
          onOpenChange={open => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {names[kind]} — {editing?.id ? "editar" : "novo"}
              </DialogTitle>
              <DialogDescription>
                As alterações afetam novas reservas. Revise antes de salvar.
              </DialogDescription>
            </DialogHeader>
            {editing && (
              <ConfigEditor
                key={`${editing.kind}-${editing.id || "new"}`}
                initial={editing}
                onSaved={async () => {
                  setEditing(null);
                  toast.success("Configuração salva.");
                  await utils.scheduling.context.invalidate();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </FinancialLayout>
  );
}
