import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "../../lib/trpc";
import { useAuth } from "../../_core/hooks/useAuth";
import { startLogin } from "../../const";
import { PATIENT_STATUS_LABELS } from "../../../../shared/patients";

export const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm bg-white text-slate-900";
export const buttonClass =
  "rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";

export function useSelectedPatient() {
  const search = useSearch();
  const [path, navigate] = useLocation();
  const raw = new URLSearchParams(search).get("patientId") || "";
  const value = /^\d+$/.test(raw) ? Number(raw) : 0;
  const patientId = Number.isSafeInteger(value) && value > 0 ? value : 0;
  return {
    patientId,
    selectPatient: (id: number) =>
      navigate(id ? `${path}?patientId=${id}` : path),
  };
}

export function SessionNotice({
  loading,
  authenticated,
}: {
  loading: boolean;
  authenticated: boolean;
}) {
  return loading ? (
    <p role="status">Carregando sessão…</p>
  ) : !authenticated ? (
    <div className="rounded-2xl border bg-white p-6">
      <p className="mb-4">
        Entre com sua conta para acessar os pacientes da clínica.
      </p>
      <button className={buttonClass} onClick={() => startLogin()}>
        Entrar
      </button>
    </div>
  ) : null;
}

export function PatientSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  disabled?: boolean;
  onChange: (id: number) => void;
}) {
  const { isAuthenticated } = useAuth();
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const options = trpc.patients.list.useQuery(
    { search, pageSize: 100 },
    { enabled: isAuthenticated, retry: false }
  );
  const selected = trpc.patients.get.useQuery(
    { patientId: value },
    { enabled: isAuthenticated && value > 0, retry: false }
  );
  const items = options.data?.items || [];
  const includeSelected = selected.data && !items.some(p => p.id === value);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div role="search" className="flex gap-2 items-end">
        <label className="flex-1 text-sm font-medium">
          Buscar paciente
          <input
            className={fieldClass}
            disabled={disabled}
            type="search"
            maxLength={160}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                setSearch(text.trim());
              }
            }}
            placeholder="Nome, e-mail ou telefone"
          />
        </label>
        <button
          type="button"
          onClick={() => setSearch(text.trim())}
          className={buttonClass}
          disabled={disabled || options.isFetching}
        >
          Buscar
        </button>
      </div>
      <label className="block text-sm font-medium">
        Paciente selecionado
        <select
          className={fieldClass}
          value={value || ""}
          onChange={e => onChange(Number(e.target.value))}
          disabled={disabled || !options.data}
        >
          <option value="">Selecione um paciente</option>
          {includeSelected && (
            <option value={value}>{selected.data?.fullName}</option>
          )}
          {items.map(p => (
            <option key={p.id} value={p.id}>
              {p.fullName} — {PATIENT_STATUS_LABELS[p.administrativeStatus]} (#
              {p.id})
            </option>
          ))}
        </select>
      </label>
      {options.isLoading && <p role="status">Carregando pacientes…</p>}
      {(options.error || selected.error) && (
        <p role="alert" className="text-sm text-red-700">
          {options.error?.message || selected.error?.message}
        </p>
      )}
      {options.data && options.data.total === 0 && (
        <p className="text-sm text-slate-500">Nenhum paciente encontrado.</p>
      )}
      {options.data && options.data.total > 100 && (
        <p className="text-sm text-slate-500">
          Mostrando até 100 resultados. Refine a busca para localizar o
          paciente.
        </p>
      )}
    </div>
  );
}
