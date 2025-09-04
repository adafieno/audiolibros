import i18n from "../i18n";

export function fmtDate(d: Date | number): string {
  return new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(d);
}
export function fmtNumber(n: number): string {
  return new Intl.NumberFormat(i18n.language).format(n);
}
export function fmtCurrencyPEN(n: number): string {
  return new Intl.NumberFormat(i18n.language, { style: "currency", currency: "PEN" }).format(n);
}
