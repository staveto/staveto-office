import { cn } from "@/lib/utils";

/** Shared high-contrast field styles (inputs, textareas, selects). */
const njFieldFocus = cn(
  "focus-visible:outline-none",
  "focus-visible:border-[#E95F2A]",
  "focus-visible:shadow-[0_0_0_3px_rgba(233,95,42,0.22)]"
);

const njFieldBase = cn(
  "w-full !bg-white text-[#0F172A] text-[15px]",
  "border-2 border-[#94A3B8] rounded-[14px]",
  "shadow-[0_1px_3px_rgba(15,42,77,0.08)]",
  "placeholder:text-[#64748B]",
  "transition-[border-color,box-shadow,background-color]",
  "hover:border-[#64748B] hover:shadow-[0_2px_6px_rgba(15,42,77,0.1)]",
  njFieldFocus,
  "disabled:opacity-60 disabled:cursor-not-allowed",
  "aria-invalid:border-red-600 aria-invalid:shadow-[0_0_0_3px_rgba(220,38,38,0.2)]"
);

/** Premium craft-business tokens for Neuer Auftrag */
export const nj = {
  pageWrap: "min-h-[calc(100vh-3.5rem)] bg-[#F4F7FA]",
  title: "text-[#0F2A4D] font-bold tracking-tight text-[34px] sm:text-[38px] leading-tight",
  subtitle: "text-[#475569] text-[17px] sm:text-[18px] leading-[1.5] max-w-2xl",
  sectionHeading: "text-[#0F2A4D] text-[22px] sm:text-2xl font-bold tracking-tight",
  sectionLead: "text-[#64748B] text-[15px] sm:text-base mt-2 leading-relaxed max-w-xl",
  body: "text-[#1F2937]",
  bodyMuted: "text-[#64748B]",
  label: "block text-[#0F2A4D] font-bold text-[15px] mb-2",
  required: "text-[#E95F2A] font-bold ml-0.5",
  error: "text-red-600 font-medium text-sm mt-1.5",
  helper: "text-[#64748B] text-sm mt-2 leading-relaxed",
  formGroup:
    "rounded-[22px] bg-[#F8FAFC] border-2 border-[#CBD5E1] p-6 sm:p-7 space-y-5 shadow-[0_4px_18px_rgba(15,42,77,0.06)]",
  fieldStack: "space-y-5",
  mainCard:
    "bg-white rounded-[28px] shadow-[0_12px_32px_rgba(15,42,77,0.06)] border-0 overflow-hidden",
  mainCardInner: "p-8 sm:p-10",
  sectionGap: "space-y-7",
  sectionSplit: "pt-10 mt-10",
  input: cn(njFieldBase, "min-h-[52px] h-[52px] px-4 py-3"),
  inputWithIcon: cn(njFieldBase, "min-h-[52px] h-[52px] pl-12 pr-4 py-3"),
  textarea: cn(njFieldBase, "min-h-[120px] px-4 py-3 resize-y"),
  textareaAi: cn(njFieldBase, "min-h-[150px] px-4 py-3 resize-y"),
  selectTrigger: cn(
    njFieldBase,
    "min-h-[52px] h-[52px] px-4 py-3 flex items-center justify-between gap-2"
  ),
  segmentedWrap: "flex w-full p-1 rounded-xl bg-[#E2E8F0] border border-[#CBD5E1]",
  previewPanel:
    "rounded-[28px] shadow-[0_20px_50px_rgba(15,42,77,0.10)] overflow-hidden bg-[#0F2A4D] text-white",
  previewMeta: "space-y-4 text-[15px]",
  primaryCta: cn(
    "w-full min-h-[52px] h-[52px] px-7 rounded-[14px] font-bold text-base text-white",
    "bg-[#E95F2A] hover:bg-[#D94F1F] shadow-[0_8px_24px_rgba(233,95,42,0.35)] hover:shadow-[0_12px_28px_rgba(233,95,42,0.4)] transition-all",
    "focus-visible:ring-4 focus-visible:ring-[#E95F2A]/35 focus-visible:outline-none"
  ),
  secondaryLink: cn(
    "w-full min-h-11 inline-flex items-center justify-center rounded-xl text-sm font-semibold",
    "text-white/70 hover:text-white hover:bg-white/10",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
  ),
  optionalToggle: cn(
    "text-sm font-semibold text-[#334155]",
    "inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2.5",
    "rounded-xl border-2 border-[#94A3B8] bg-white",
    "shadow-[0_1px_3px_rgba(15,42,77,0.06)]",
    "hover:border-[#64748B] hover:text-[#0F2A4D] hover:shadow-[0_2px_6px_rgba(15,42,77,0.1)]",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(233,95,42,0.2)]",
    "cursor-pointer transition-all"
  ),
  searchDropdown:
    "absolute z-20 mt-2 w-full max-h-56 overflow-y-auto rounded-[14px] bg-white border-2 border-[#94A3B8] shadow-[0_18px_42px_rgba(15,42,77,0.14)] py-1",
} as const;

export function njSegment(selected: boolean) {
  return cn(
    "flex-1 min-h-[44px] rounded-[10px] px-4 py-2.5 text-[15px] font-semibold transition-all",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E95F2A]/50 focus-visible:ring-offset-2",
    selected
      ? "bg-white text-[#0F2A4D] shadow-sm"
      : "text-[#64748B] hover:text-[#334155]"
  );
}

export function njChoicePill(selected: boolean) {
  return cn(
    "inline-flex items-center gap-2 min-h-[48px] rounded-[14px] px-5 py-2.5 text-sm font-semibold transition-all cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(233,95,42,0.22)]",
    selected
      ? "bg-[#FFF3EC] text-[#0F2A4D] border-2 border-[#E95F2A] shadow-[0_2px_8px_rgba(233,95,42,0.15)]"
      : "bg-white text-[#334155] border-2 border-[#94A3B8] shadow-[0_1px_3px_rgba(15,42,77,0.06)] hover:border-[#64748B] hover:text-[#0F2A4D] hover:shadow-[0_4px_12px_rgba(15,42,77,0.1)]"
  );
}

export function njJobTypeCard(selected: boolean) {
  return cn(
    "group relative flex flex-col gap-4 rounded-[22px] p-6 sm:p-7 text-left min-h-[168px] transition-all duration-200 cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(233,95,42,0.25)]",
    selected
      ? "bg-[#FFF3EC] border-2 border-[#E95F2A] shadow-[0_12px_32px_rgba(15,42,77,0.08)]"
      : "bg-white border-2 border-[#94A3B8] shadow-[0_8px_24px_rgba(15,42,77,0.07)] hover:shadow-[0_18px_42px_rgba(15,42,77,0.12)] hover:border-[#64748B]"
  );
}

export function njIconCircle(selected: boolean) {
  return cn(
    "flex size-14 shrink-0 items-center justify-center rounded-2xl transition-colors",
    selected ? "bg-[#E95F2A] text-white" : "bg-[#F1F5F9] text-[#475569] group-hover:bg-[#E2E8F0]"
  );
}

export function njJobTypeCheck() {
  return cn(
    "absolute top-5 right-5 flex size-7 items-center justify-center rounded-full bg-[#E95F2A] text-white shadow-sm"
  );
}

/** Full-width workflow choice (contact / creation method). */
export function njLargeChoice(selected: boolean) {
  return cn(
    "relative w-full flex items-start gap-5 rounded-[22px] p-6 text-left transition-all duration-200 min-h-[96px] cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(233,95,42,0.25)]",
    selected
      ? "bg-[#FFF3EC] border-2 border-[#E95F2A] shadow-[0_12px_32px_rgba(15,42,77,0.08)]"
      : "bg-[#FAFBFC] border-2 border-[#94A3B8] shadow-[0_8px_24px_rgba(15,42,77,0.07)] hover:bg-white hover:shadow-[0_18px_42px_rgba(15,42,77,0.12)] hover:border-[#64748B]"
  );
}

export function njNavPrimary() {
  return cn(
    "min-h-[52px] h-[52px] px-7 rounded-[14px] font-bold text-base text-white",
    "bg-[#E95F2A] hover:bg-[#D94F1F] shadow-[0_8px_24px_rgba(233,95,42,0.35)] hover:shadow-[0_12px_28px_rgba(233,95,42,0.4)] transition-all",
    "focus-visible:ring-4 focus-visible:ring-[#E95F2A]/35 focus-visible:outline-none",
    "disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none"
  );
}

export function njNavSecondary() {
  return cn(
    "min-h-[52px] h-[52px] px-6 rounded-[14px] font-semibold text-base text-[#334155]",
    "border-2 border-[#94A3B8] bg-white shadow-[0_1px_3px_rgba(15,42,77,0.06)]",
    "hover:text-[#0F2A4D] hover:border-[#64748B] hover:bg-[#F8FAFC]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E95F2A]/40",
    "cursor-pointer transition-all"
  );
}
