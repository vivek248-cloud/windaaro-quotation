/* =========================================================
  SHARED HELPERS
  One copy of the small functions that were repeated across
  App.tsx and settingsStore.ts.
========================================================= */

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Escapes values before they are interpolated into printed HTML. */
export const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

/** Today as YYYY-MM-DD in the user's LOCAL time.
 *  (toISOString() is UTC, which gives yesterday's date in India between
 *  midnight and 5:30 AM.) */
export const todayIso = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

/** Parses API dates. A plain "YYYY-MM-DD" is read as a LOCAL calendar day;
 *  new Date("2026-06-29") would be UTC midnight and can show the wrong day. */
export const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;

  const plainDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = plainDate
    ? new Date(Number(plainDate[1]), Number(plainDate[2]) - 1, Number(plainDate[3]))
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

/** Rounds to 2 decimals, half-up - the same rule the Django backend uses,
 *  so the numbers in a form match what is saved and printed. */
export const round2 = (value: number) =>
  Math.round(Number((value * 100).toPrecision(15))) / 100;

/** Next running number for a prefix, e.g. ("WD26", ["WD2601","WD2603"]) -> "WD2604".
 *  Uses the highest existing number, so deleting a document can never make the
 *  app propose a number that is already taken. */
export const nextDocumentNo = (
  prefix: string,
  existing: (string | null | undefined)[],
  minDigits = 2
) => {
  let highest = 0;

  for (const value of existing) {
    const rest = value?.startsWith(prefix) ? value.slice(prefix.length) : "";
    if (/^\d+$/.test(rest)) highest = Math.max(highest, Number(rest));
  }

  return `${prefix}${String(highest + 1).padStart(minDigits, "0")}`;
};
