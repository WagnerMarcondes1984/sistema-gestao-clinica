import { describe, expect, it } from "vitest";
import { permissionsForRole } from "../shared/permissions";
import { hasMindosPermission } from "./db";

describe("matriz de permissões", () => {
  it.each([
    "RECEPTIONIST",
    "ASSISTANT",
    "FINANCIAL",
    "SALES",
    "VIEWER",
    "PATIENT",
  ] as const)("%s não recebe acesso clínico pelo modelo de papel", role => {
    const membership = {
      role,
      permissionsJson: JSON.stringify(permissionsForRole(role)),
    };
    expect(hasMindosPermission(membership, "VIEW_CLINICAL_RECORD")).toBe(false);
    expect(hasMindosPermission(membership, "VIEW_RESTRICTED_NOTE")).toBe(false);
    expect(hasMindosPermission(membership, "EDIT_RESTRICTED_NOTE")).toBe(false);
  });
  it("exige concessão adicional para notas restritas do psicólogo", () => {
    const membership = {
      role: "PSYCHOLOGIST",
      permissionsJson: JSON.stringify(permissionsForRole("PSYCHOLOGIST")),
    };
    expect(hasMindosPermission(membership, "VIEW_CLINICAL_RECORD")).toBe(true);
    expect(hasMindosPermission(membership, "VIEW_RESTRICTED_NOTE")).toBe(false);
  });
  it.each(["{}", "null", "123", '"ALL"', "[1]"])(
    "recusa estrutura inválida de permissões: %s",
    permissionsJson => {
      expect(
        hasMindosPermission(
          { role: "VIEWER", permissionsJson },
          "VIEW_FINANCIAL"
        )
      ).toBe(false);
    }
  );
});
