/**
 * Utility functions for the Gantt chart coordinate system.
 *
 * Time unit: "month index" = number of whole months from simulation start (0-based).
 * Display unit for values: thousands (1 000 000 → "1.000", Danish dot separator).
 */

/** Parse a "YYYY-MM" or "YYYY-MM-DD" string → [year, month0] (month0 is 0-based). */
export function parseYM(s: string): [number, number] {
  const p = s.split("-");
  return [parseInt(p[0]), parseInt(p[1]) - 1];
}

/** Compute month index of a date string relative to simStart. */
export function toMonthIndex(dateStr: string, simStart: string): number {
  const [sy, sm] = parseYM(simStart);
  const [dy, dm] = parseYM(dateStr);
  return (dy - sy) * 12 + (dm - sm);
}

/** Convert a month index back to a "YYYY-MM-01" date string. */
export function fromMonthIndex(idx: number, simStart: string): string {
  const [sy, sm] = parseYM(simStart);
  const total = sy * 12 + sm + idx;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Danish number format: divide by 1000, round, then toLocaleString. */
export function fmtVal(value: number): string {
  return Math.round(value / 1000).toLocaleString("da-DK");
}

/**
 * Format a "YYYY-MM" month label.
 * Short: "2026" (year only). Long: "mar 2026" (month + year).
 */
const DA_MONTHS = [
  "jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec",
];
export function fmtMonthLong(ym: string): string {
  const [y, m] = parseYM(ym);
  return `${DA_MONTHS[m]} ${y}`;
}
export function fmtYear(ym: string): string {
  return ym.split("-")[0];
}

/** Total number of months in a simulation (inclusive of both endpoints). */
export function simTotalMonths(startDate: string, endDate: string): number {
  return toMonthIndex(endDate, startDate) + 1;
}

/** Given a pixel x within a gantt container, return the month index within the visible window. */
export function pxToMonthFrac(
  px: number,
  containerWidth: number,
  visibleMonths: number
): number {
  return (px / containerWidth) * visibleMonths;
}

/**
 * Compute average annual rate for a property asset with variable rates.
 * activeYears is the set of calendar years the asset is active.
 */
export function avgVariableRate(
  variableRates: Record<string, number>,
  startDate: string,
  endDate: string
): number {
  const [sy] = parseYM(startDate);
  const [ey] = parseYM(endDate);
  const defaultRate = variableRates["default"] ?? 0.02;
  let sum = 0;
  let count = 0;
  for (let y = sy; y <= ey; y++) {
    sum += variableRates[String(y)] ?? defaultRate;
    count++;
  }
  return count > 0 ? sum / count : defaultRate;
}
