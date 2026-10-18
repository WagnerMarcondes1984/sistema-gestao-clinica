import {
  TEAM_ROLES,
  ROLE_LABELS,
  PERMISSION_LABELS,
  allowedTeamPermissions,
  permissionsForRole,
  type Permission,
  type TeamRole,
} from "../../../../shared/permissions";

export type AccessValue = {
  role: TeamRole;
  permissions: Permission[];
  patientId?: number;
};
export function AccessFields({
  value,
  onChange,
  patients,
  canGrantAdmin,
  prefix,
  disabled = false,
}: {
  value: AccessValue;
  onChange: (value: AccessValue) => void;
  patients: { id: number; name: string; linked: boolean }[];
  canGrantAdmin: boolean;
  prefix: string;
  disabled?: boolean;
}) {
  const allowed = allowedTeamPermissions(value.role);
  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={`${prefix}-role`}
          className="block text-sm font-semibold text-slate-700 mb-1"
        >
          Papel
        </label>
        <select
          id={`${prefix}-role`}
          value={value.role}
          disabled={disabled}
          onChange={event => {
            const role = event.target.value as TeamRole;
            onChange({ role, permissions: permissionsForRole(role) });
          }}
          className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-sm"
        >
          {TEAM_ROLES.filter(
            role => canGrantAdmin || role !== "CLINIC_ADMIN"
          ).map(role => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>
      {value.role === "PATIENT" ? (
        <div>
          <label
            htmlFor={`${prefix}-patient`}
            className="block text-sm font-semibold text-slate-700 mb-1"
          >
            Cadastro de paciente
          </label>
          <select
            id={`${prefix}-patient`}
            required
            value={value.patientId ?? ""}
            disabled={disabled}
            onChange={event =>
              onChange({
                ...value,
                patientId: event.target.value
                  ? Number(event.target.value)
                  : undefined,
              })
            }
            className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-sm"
          >
            <option value="">Selecione o paciente</option>
            {patients.map(patient => (
              <option
                key={patient.id}
                value={patient.id}
                disabled={patient.linked && value.patientId !== patient.id}
              >
                {patient.name}
                {patient.linked ? " · conta vinculada" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-2">
            Esta conta acessará somente o portal do cadastro selecionado.
          </p>
        </div>
      ) : value.role === "CLINIC_ADMIN" ? (
        <p className="text-sm rounded-xl bg-amber-50 p-3 text-amber-900">
          Administradores possuem acesso total à clínica. Para limitar o acesso,
          escolha outro papel.
        </p>
      ) : (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="text-sm font-semibold text-slate-700 mb-2">
            Permissões deste vínculo
          </legend>
          {allowed.map(permission => (
            <label
              key={permission}
              className="flex items-start gap-2 text-sm text-slate-600"
            >
              <input
                type="checkbox"
                checked={value.permissions.includes(permission)}
                onChange={event =>
                  onChange({
                    ...value,
                    permissions: event.target.checked
                      ? [...value.permissions, permission]
                      : value.permissions.filter(item => item !== permission),
                  })
                }
                className="mt-1 accent-indigo-600"
              />
              {PERMISSION_LABELS[permission]}
            </label>
          ))}
          {value.role === "PSYCHOLOGIST" && (
            <p className="text-xs text-slate-500">
              Notas restritas exigem concessões adicionais de leitura e escrita.
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}
