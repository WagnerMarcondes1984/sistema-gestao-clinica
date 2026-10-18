export const PERMISSIONS = [
  "ALL",
  "VIEW_PATIENT_BASIC",
  "VIEW_ADMINISTRATIVE",
  "MANAGE_APPOINTMENTS",
  "VIEW_CLINICAL_RECORD",
  "EDIT_CLINICAL_RECORD",
  "VIEW_RESTRICTED_NOTE",
  "EDIT_RESTRICTED_NOTE",
  "VIEW_FINANCIAL",
  "MANAGE_FINANCIAL",
  "MANAGE_PUBLIC_SITE",
  "MANAGE_TEAM",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Modelos para novos vínculos. As permissões efetivas continuam explícitas em
// permissionsJson; trocar um modelo não concede acesso novo a vínculos existentes.
export const ROLE_PERMISSION_TEMPLATES = {
  OWNER: ["ALL"],
  CLINIC_ADMIN: ["ALL"],
  SUPER_ADMIN: ["ALL"],
  PSYCHOLOGIST: [
    "VIEW_PATIENT_BASIC",
    "VIEW_ADMINISTRATIVE",
    "MANAGE_APPOINTMENTS",
    "VIEW_CLINICAL_RECORD",
    "EDIT_CLINICAL_RECORD",
  ],
  ASSISTANT: [
    "VIEW_PATIENT_BASIC",
    "VIEW_ADMINISTRATIVE",
    "MANAGE_APPOINTMENTS",
  ],
  RECEPTIONIST: [
    "VIEW_PATIENT_BASIC",
    "VIEW_ADMINISTRATIVE",
    "MANAGE_APPOINTMENTS",
  ],
  FINANCIAL: ["VIEW_PATIENT_BASIC", "VIEW_FINANCIAL", "MANAGE_FINANCIAL"],
  SALES: ["VIEW_PATIENT_BASIC", "VIEW_ADMINISTRATIVE"],
  VIEWER: ["VIEW_PATIENT_BASIC"],
  PATIENT: [],
} as const satisfies Record<string, readonly Permission[]>;
export type ClinicRole = keyof typeof ROLE_PERMISSION_TEMPLATES;

export function permissionsForRole(role: ClinicRole): Permission[] {
  return [...ROLE_PERMISSION_TEMPLATES[role]];
}

export const TEAM_ROLES = [
  "CLINIC_ADMIN",
  "PSYCHOLOGIST",
  "ASSISTANT",
  "RECEPTIONIST",
  "FINANCIAL",
  "SALES",
  "VIEWER",
  "PATIENT",
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export const ROLE_LABELS: Record<ClinicRole, string> = {
  OWNER: "Proprietário",
  CLINIC_ADMIN: "Administrador",
  SUPER_ADMIN: "Superadministrador",
  PSYCHOLOGIST: "Psicólogo",
  ASSISTANT: "Assistente",
  RECEPTIONIST: "Recepção",
  FINANCIAL: "Financeiro",
  SALES: "Comercial",
  VIEWER: "Consulta básica",
  PATIENT: "Paciente",
};
export const PERMISSION_LABELS: Record<Permission, string> = {
  ALL: "Acesso administrativo total",
  VIEW_PATIENT_BASIC: "Consultar dados básicos",
  VIEW_ADMINISTRATIVE: "Consultar dados administrativos",
  MANAGE_APPOINTMENTS: "Consultar e gerenciar agenda",
  VIEW_CLINICAL_RECORD: "Consultar prontuário",
  EDIT_CLINICAL_RECORD: "Registrar e finalizar prontuário",
  VIEW_RESTRICTED_NOTE: "Consultar notas restritas",
  EDIT_RESTRICTED_NOTE: "Registrar e finalizar notas restritas",
  VIEW_FINANCIAL: "Consultar financeiro",
  MANAGE_FINANCIAL: "Alterar financeiro",
  MANAGE_PUBLIC_SITE: "Gerenciar conteúdo público",
  MANAGE_TEAM: "Gerenciar equipe",
};
export function allowedTeamPermissions(role: TeamRole): Permission[] {
  return role === "PSYCHOLOGIST"
    ? [
        ...permissionsForRole(role),
        "VIEW_RESTRICTED_NOTE",
        "EDIT_RESTRICTED_NOTE",
      ]
    : permissionsForRole(role);
}
