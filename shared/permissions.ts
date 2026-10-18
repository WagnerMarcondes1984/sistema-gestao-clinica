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
