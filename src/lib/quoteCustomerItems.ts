/** Heuristic: hide typical internal tooling from customer-facing quote lines. */
const INTERNAL_NAME_PATTERNS: RegExp[] = [
  /\bwerkzeug\b/i,
  /\bbohr(?:er|maschine|krone)?\b/i,
  /\bkernbohr/i,
  /\blecksuch/i,
  /\bmessgerät\b/i,
  /\btestgerät\b/i,
  /\b(tool|drill)\b/i,
  /\b(intern|internal)\b/i,
];

export function isCustomerVisibleItemName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return !INTERNAL_NAME_PATTERNS.some((pattern) => pattern.test(trimmed));
}
