/**
 * Shared theme tokens for the Geräte & Fuhrpark board.
 * No pure-white cards in dark mode — slate/navy surfaces only.
 */
export const eq = {
  card:
    "rounded-2xl border border-[#D8E1EA] bg-white dark:border-[#334155] dark:bg-[#1E293B]",
  cardElevated:
    "rounded-xl border border-[#D8E1EA] bg-[#F8FAFC] dark:border-[#334155] dark:bg-[#243247]",
  textPrimary: "text-[#0F172A] dark:text-[#F8FAFC]",
  textSecondary: "text-[#334155] dark:text-[#CBD5E1]",
  textMuted: "text-[#64748B] dark:text-[#94A3B8]",
  borderClass: "border-[#D8E1EA] dark:border-[#334155]",
  primaryBtn: "bg-[#C9481D] text-white hover:bg-[#B8431D]",
  secondaryBtn:
    "border border-[#D8E1EA] bg-white text-[#0F172A] hover:bg-[#F1F5F9] dark:border-[#334155] dark:bg-[#243247] dark:text-[#F8FAFC] dark:hover:bg-[#2C3D55]",
} as const;
