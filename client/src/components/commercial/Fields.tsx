import type { ComponentProps, ReactNode } from "react";
import { fieldClass } from "../patients/PatientSelector";
export function Field({
  label,
  id,
  ...props
}: ComponentProps<"input"> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium space-y-1">
      <span>{label}</span>
      <input id={id} className={fieldClass} {...props} />
    </label>
  );
}
export function Select({
  label,
  id,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium space-y-1">
      <span>{label}</span>
      <select id={id} className={fieldClass} {...props}>
        {children}
      </select>
    </label>
  );
}
export function Textarea({
  label,
  id,
  ...props
}: ComponentProps<"textarea"> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium space-y-1">
      <span>{label}</span>
      <textarea id={id} className={fieldClass} rows={3} {...props} />
    </label>
  );
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4 text-slate-900">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </section>
  );
}
export const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100
  );
export const moneyInput = (cents: number) =>
  (cents / 100).toFixed(2).replace(".", ",");
export const proposalLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  PRESENTED: "Apresentada",
  ACCEPTED: "Aceita",
  DECLINED: "Recusada",
  CANCELLED: "Cancelada",
};
