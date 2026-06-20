/**
 * Isomorphic (client + server) extraction of structured job data from a customer
 * email thread, plus checklist + smart reply-draft helpers.
 *
 * The whole thread is analysed (not just the first message), greetings / quoted
 * history / signatures are stripped, and the latest customer reply has priority so
 * that information the customer already provided is recognised and NOT re-asked.
 */

import type { ExtractedJobData } from "@/lib/emailInquiryTypes";

export type { ExtractedJobData };

export type RequestLocale = "sk" | "de" | "en";

export type JobFieldId =
  | "name"
  | "email"
  | "phone"
  | "address"
  | "city"
  | "systemType"
  | "systemYear"
  | "issue"
  | "desiredTimeframe"
  | "urgency"
  | "repairOrReplacement"
  | "roomCount"
  | "photos"
  | "outdoorAccess"
  | "modelCapacity";

export type FieldState = "detected" | "missing" | "uncertain";

export type CompletedField = { id: JobFieldId; label: string; value: string };
export type MissingField = { id: JobFieldId; label: string; required: boolean; reason?: string };

const FIELD_LABELS: Record<JobFieldId, Record<RequestLocale, string>> = {
  name: { de: "Name", sk: "Meno", en: "Name" },
  email: { de: "E-Mail", sk: "E-mail", en: "Email" },
  phone: { de: "Telefon", sk: "Telefón", en: "Phone" },
  address: { de: "Adresse", sk: "Adresa", en: "Address" },
  city: { de: "Ort", sk: "Mesto", en: "City" },
  systemType: { de: "Anlagentyp", sk: "Typ zariadenia", en: "System type" },
  systemYear: { de: "Baujahr", sk: "Rok výroby", en: "Year" },
  issue: { de: "Problem", sk: "Problém", en: "Issue" },
  desiredTimeframe: { de: "Zeitraum", sk: "Termín", en: "Timeframe" },
  urgency: { de: "Dringlichkeit", sk: "Naliehavosť", en: "Urgency" },
  repairOrReplacement: {
    de: "Reparatur oder Ersatz",
    sk: "Oprava alebo výmena",
    en: "Repair or replacement",
  },
  roomCount: {
    de: "Anzahl / Größe der Räume",
    sk: "Počet / veľkosť miestností",
    en: "Room count / size",
  },
  photos: {
    de: "Fotos der Innen- und Außeneinheit",
    sk: "Fotky vnútornej a vonkajšej jednotky",
    en: "Photos of indoor & outdoor units",
  },
  outdoorAccess: {
    de: "Zugang zur Außeneinheit",
    sk: "Prístup k vonkajšej jednotke",
    en: "Access to the outdoor unit",
  },
  modelCapacity: {
    de: "Modell / Leistung der Anlage",
    sk: "Model / výkon zariadenia",
    en: "Model / capacity",
  },
};

// Some fields read better as a question when listed under "still missing".
const MISSING_LABEL_OVERRIDES: Partial<Record<JobFieldId, Record<RequestLocale, string>>> = {
  repairOrReplacement: {
    de: "Reparatur oder Ersatz gewünscht?",
    sk: "Želá si zákazník opravu alebo výmenu?",
    en: "Repair or replacement preferred?",
  },
};

// Polished phrasings used inside the reply draft ("…senden Sie uns bitte noch:").
const ASK_PHRASES: Partial<Record<JobFieldId, Record<RequestLocale, string>>> = {
  address: {
    de: "die genaue Adresse des Einsatzortes",
    sk: "presnú adresu miesta realizácie",
    en: "the exact site address",
  },
  phone: {
    de: "eine Telefonnummer für Rückfragen",
    sk: "telefónne číslo pre spätné otázky",
    en: "a phone number for follow-up",
  },
  desiredTimeframe: {
    de: "Ihren gewünschten Zeitraum",
    sk: "Váš preferovaný termín",
    en: "your preferred timeframe",
  },
  issue: {
    de: "eine kurze Beschreibung des Problems",
    sk: "krátky opis problému",
    en: "a short description of the problem",
  },
  roomCount: {
    de: "die ungefähre Anzahl oder Größe der betroffenen Räume",
    sk: "približný počet alebo veľkosť dotknutých miestností",
    en: "the approximate number or size of the affected rooms",
  },
  photos: {
    de: "ein Foto der Innen- und Außeneinheit",
    sk: "fotku vnútornej a vonkajšej jednotky",
    en: "a photo of the indoor and outdoor unit",
  },
  outdoorAccess: {
    de: "die Information, ob die Außeneinheit gut zugänglich ist",
    sk: "informáciu, či je vonkajšia jednotka dobre prístupná",
    en: "whether the outdoor unit is easily accessible",
  },
  modelCapacity: {
    de: "falls bekannt: Modell / Leistung der Anlage",
    sk: "ak je známy: model / výkon zariadenia",
    en: "if known: the model / capacity of the unit",
  },
};

const OPEN_MARKER: Record<RequestLocale, string> = { de: "offen", sk: "otvorené", en: "open" };

export function fieldLabel(id: JobFieldId, locale: RequestLocale): string {
  return FIELD_LABELS[id][locale];
}

export function detectLocale(text: string): RequestLocale {
  const t = text.toLowerCase();
  if (/[äöüß]|möchte|vielen dank|guten tag|wohnung|montage|angebot|anlage|bitte/.test(t)) return "de";
  if (/ďakuj|dobrý deň|ponuk|montáž|potrebujem|žiadosť|prosím|chcem/.test(t)) return "sk";
  return "en";
}

/** Title-cases a customer name: "aneta skora" → "Aneta Skora". */
export function formatName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const cleaned = name.replace(/["']/g, "").trim();
  if (!cleaned) return undefined;
  // Leave already-mixed-case names that look intentional (e.g. "McDonald") mostly alone,
  // but always fix all-lowercase / all-uppercase.
  return cleaned
    .split(/\s+/)
    .map((part) =>
      part
        .split("-")
        .map((seg) => (seg ? seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase() : seg))
        .join("-")
    )
    .join(" ");
}

const GREETING_RE =
  /^\s*(guten\s+(tag|morgen|abend)|hallo|hi|servus|grüezi|grüss\s+gott|sehr\s+geehrte[r]?(\s+(damen\s+und\s+)?herren)?|liebe[r]?|dobrý\s+deň|ahoj|dobré\s+ráno|dear\b[^,]*|hello|hi there)[\s,!:.-]+/i;

const SIGNATURE_RE =
  /^(mit\s+freundlichen\s+grüßen|freundliche\s+grüße|beste\s+grüße|viele\s+grüße|mfg|lg|liebe\s+grüße|s\s+pozdravom|s\s+úctou|best\s+regards|kind\s+regards|regards|cheers|danke\s+und\s+grüße)\b/i;

// Header lines that introduce quoted history — everything after them is ignored.
const QUOTE_HEADER_RE =
  /^(am\s.+schrieb|on\s.+wrote:|dňa\s.+napísal|von:\s|from:\s|gesendet:|sent:|betreff:|subject:|-{2,}\s*original|________)/i;

/** Removes greeting prefixes, signature/closing blocks, quoted history and collapses noise. */
export function cleanCustomerText(text: string): string {
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(">")) continue; // quoted history
    if (QUOTE_HEADER_RE.test(line)) break; // stop at quoted thread
    if (SIGNATURE_RE.test(line)) break; // stop at sign-off
    kept.push(line.replace(GREETING_RE, "").trim());
  }
  return kept
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const KNOWN_CITIES = [
  "Luzern",
  "Zürich",
  "Zurich",
  "Bern",
  "Basel",
  "Genf",
  "Genève",
  "Lausanne",
  "Winterthur",
  "St. Gallen",
  "Lugano",
  "Biel",
  "Thun",
  "Zug",
  "Chur",
  "Bratislava",
  "Košice",
  "Žilina",
  "Nitra",
  "Trnava",
  "Trenčín",
  "Banská Bystrica",
  "Prešov",
];

function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
}

function extractPhone(text: string): string | undefined {
  const candidates = text.match(/(\+?\d[\d\s()./-]{7,}\d)/g);
  if (!candidates) return undefined;
  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) {
      return cleanLine(raw);
    }
  }
  return undefined;
}

function extractAddress(text: string): string | undefined {
  const re =
    /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]+(?:stra(?:ß|ss)e|str\.?|gasse|weg|platz|ring|allee|cesta|ulica|nábr\w*|námest\w*)\s+\d+[a-zA-Z]?)/;
  const m = text.match(re);
  if (m) return cleanLine(m[1]!);
  return undefined;
}

function extractCity(text: string, address?: string): string | undefined {
  if (address) {
    const idx = text.indexOf(address);
    if (idx >= 0) {
      const after = text.slice(idx + address.length, idx + address.length + 40);
      const inMatch = after.match(/^[\s,]*(?:in|,)\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]{2,})/);
      if (inMatch) return cleanLine(inMatch[1]!);
    }
  }
  const plz = text.match(/\b(\d{4,5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]{2,})/);
  if (plz) return cleanLine(plz[2]!);
  for (const city of KNOWN_CITIES) {
    if (new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) {
      return city;
    }
  }
  return undefined;
}

function extractTimeframe(text: string): string | undefined {
  const patterns: RegExp[] = [
    /\bbis\s+(?:ende\s+|anfang\s+|mitte\s+)?[A-Za-zÄÖÜäöü]+(?:\s+\d{4})?/i,
    /\buntil\s+(?:the\s+)?(?:end\s+of\s+)?[A-Za-z]+(?:\s+\d{4})?/i,
    /\bdo\s+konca\s+\w+/i,
    /\b(?:so schnell wie möglich|sobald wie möglich|asap|as soon as possible|čo najskôr|so bald wie möglich)\b/i,
    /\b(?:diese woche|nächste woche|this week|next week|tento týždeň|budúci týždeň)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return cleanLine(m[0]).slice(0, 60);
  }
  return undefined;
}

function extractSystemType(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/split[\s-]?klima|split[\s-]?system|split[\s-]?anlage|samsung split|split\b/.test(t))
    return "Split-Klimaanlage";
  if (/wärmepumpe|warmepumpe|heat pump|tepelné čerpadlo/.test(t)) return "Wärmepumpe";
  if (/klimaanlage|klimatiz|air condition|air-condition|klíma|aircon/.test(t)) return "Klimaanlage";
  if (/lüftung|ventilation|vetranie|vzduchotechnika/.test(t)) return "Lüftung";
  if (/heizung|heating|kúrenie|vykurovanie/.test(t)) return "Heizung";
  return undefined;
}

function extractSystemYear(text: string): string | undefined {
  const matches = text.match(/\b(19|20)\d{2}\b/g);
  if (!matches) return undefined;
  const now = new Date().getFullYear();
  for (const y of matches) {
    const year = Number(y);
    if (year >= 1990 && year <= now + 1) return String(year);
  }
  return undefined;
}

// Map common symptom phrases to a clean, canonical issue per locale.
const ISSUE_CANONICAL: Array<{ re: RegExp; label: Record<RequestLocale, string> }> = [
  {
    re: /kühlt nicht(?:\s+mehr)?|keine kalte luft|nicht mehr kalt|kühlt schlecht|does not cool|doesn'?t cool|not cooling|nechladí|nekúri chladom/i,
    label: { de: "Anlage kühlt nicht mehr", sk: "zariadenie nechladí", en: "system no longer cools" },
  },
  {
    re: /heizt nicht|wird nicht warm|no heat|not heating|nehreje|nekúri/i,
    label: { de: "Anlage heizt nicht mehr", sk: "zariadenie nehreje", en: "system no longer heats" },
  },
  {
    re: /undicht|leckt|tropft|wasser läuft|leaking|leak|tečie|kvapká/i,
    label: { de: "Anlage ist undicht", sk: "zariadenie tečie", en: "system is leaking" },
  },
  {
    re: /geräusch|macht lärm|laut|rattert|noise|loud|hluk|hlučn/i,
    label: { de: "Anlage macht Geräusche", sk: "zariadenie je hlučné", en: "system is making noise" },
  },
  {
    re: /riecht|geruch|smell|odou?r|zápach/i,
    label: { de: "Anlage riecht unangenehm", sk: "zariadenie zapácha", en: "system has an odour" },
  },
];

function extractIssue(cleanBody: string, subject: string, locale: RequestLocale): string | undefined {
  // 1) Prefer a specific canonical symptom found in the cleaned body.
  for (const entry of ISSUE_CANONICAL) {
    if (entry.re.test(cleanBody)) return entry.label[locale];
  }
  // 2) Generic "broken" signals (also from subject) → canonical.
  const broken = /funktioniert nicht|defekt|kaputt|störung|porucha|nefunguje|broken|not working|out of order/i;
  if (broken.test(cleanBody) || broken.test(subject)) {
    return locale === "de"
      ? "Anlage funktioniert nicht"
      : locale === "sk"
        ? "zariadenie nefunguje"
        : "system is not working";
  }
  // 3) Fallback: a short clean clause from the body containing a problem hint.
  const hint = /(problem|funktion|kühl|heiz|wasser|geräusch|service|wartung|porucha|oprav|repair)/i;
  const clauses = cleanBody.split(/(?<=[.!?])\s+|;\s+/);
  for (const c of clauses) {
    if (hint.test(c)) {
      return cleanLine(c.replace(/^\s*(und|aber|weil|da|dass|also|a|ale|že)\b\s*/i, "")).slice(0, 90);
    }
  }
  return undefined;
}

function extractRepairOrReplacement(text: string, locale: RequestLocale): string | undefined {
  const t = text.toLowerCase();
  const repair = /reparat|reparier|oprav|repair|instand/.test(t);
  const replace = /ersatz|ersetz|austausch|vymen|výmen|replace|neue anlage|new unit/.test(t);
  if (repair && replace) return OPEN_MARKER[locale];
  if (repair) return locale === "de" ? "Reparatur" : locale === "sk" ? "Oprava" : "Repair";
  if (replace) return locale === "de" ? "Ersatz" : locale === "sk" ? "Výmena" : "Replacement";
  return undefined;
}

function deriveUrgency(text: string, locale: RequestLocale): string | undefined {
  const high = /dringend|urgent|asap|so schnell wie möglich|sobald wie möglich|súrne|čo najskôr|notfall|emergency/i.test(
    text
  );
  if (high) return locale === "de" ? "Hoch" : locale === "sk" ? "Vysoká" : "High";
  return undefined;
}

function deriveRequestType(issue: string | undefined, text: string, locale: RequestLocale): string | undefined {
  const t = text.toLowerCase();
  const isInstall = /montage|installation|montáž|inštal|einbau|neue anlage|install/.test(t);
  const isRepair = Boolean(issue) || /reparat|oprav|defekt|service|wartung|údržba/.test(t);
  if (isInstall) {
    return locale === "de" ? "Montage / Installation" : locale === "sk" ? "Montáž / inštalácia" : "Installation";
  }
  if (isRepair) {
    return locale === "de" ? "Reparatur / Service" : locale === "sk" ? "Oprava / servis" : "Repair / service";
  }
  return locale === "de" ? "Anfrage" : locale === "sk" ? "Dopyt" : "Inquiry";
}

export function extractJobData(opts: {
  subject: string;
  /** All inbound customer text, oldest → newest (or newest first). */
  threadText: string;
  customerName?: string;
  customerEmail?: string;
  locale?: RequestLocale;
}): ExtractedJobData {
  const cleanBody = cleanCustomerText(opts.threadText);
  const subject = (opts.subject || "").trim();
  const text = `${subject}. ${cleanBody}`;
  const locale = opts.locale ?? detectLocale(text);

  const address = extractAddress(text);
  const city = extractCity(text, address);
  const phone = extractPhone(text);
  const desiredTimeframe = extractTimeframe(text);
  const systemType = extractSystemType(text);
  const systemYear = extractSystemYear(text);
  const issue = extractIssue(cleanBody, subject, locale);
  const repairOrReplacement = extractRepairOrReplacement(text, locale);
  const urgency = deriveUrgency(text, locale);
  const requestType = deriveRequestType(issue, text, locale);

  return {
    customerName: formatName(opts.customerName),
    email: opts.customerEmail,
    phone,
    address,
    city,
    requestType,
    systemType,
    systemYear,
    issue,
    desiredTimeframe,
    urgency,
    repairOrReplacement,
  };
}

/** Resolves the display state of a single extracted field. */
export function fieldStateOf(id: JobFieldId, extracted: ExtractedJobData, locale: RequestLocale): FieldState {
  if (id === "repairOrReplacement") {
    const v = extracted.repairOrReplacement;
    if (!v) return "missing";
    return v === OPEN_MARKER[locale] ? "uncertain" : "detected";
  }
  const value = (extracted as Record<string, string | undefined>)[id];
  return value && value.trim() ? "detected" : "missing";
}

const REQUIRED_FIELDS: JobFieldId[] = ["address", "phone", "desiredTimeframe", "issue"];
const FOLLOW_UP_FIELDS: JobFieldId[] = ["roomCount", "photos", "outdoorAccess", "modelCapacity"];

function missingLabel(id: JobFieldId, locale: RequestLocale): string {
  return MISSING_LABEL_OVERRIDES[id]?.[locale] ?? FIELD_LABELS[id][locale];
}

export function buildChecklist(
  extracted: ExtractedJobData,
  locale: RequestLocale
): { completed: CompletedField[]; missing: MissingField[] } {
  const completed: CompletedField[] = [];
  const missing: MissingField[] = [];

  const detectedFields: JobFieldId[] = [
    "address",
    "city",
    "phone",
    "systemType",
    "systemYear",
    "issue",
    "desiredTimeframe",
    "urgency",
  ];
  for (const id of detectedFields) {
    const value = (extracted as Record<string, string | undefined>)[id];
    if (value && value.trim()) {
      completed.push({ id, label: fieldLabel(id, locale), value: value.trim() });
    } else if (REQUIRED_FIELDS.includes(id)) {
      missing.push({ id, label: missingLabel(id, locale), required: true });
    }
  }

  // Repair vs replacement: definite choice = completed, ambiguous/absent = soft preference.
  const rr = extracted.repairOrReplacement;
  if (rr && rr !== OPEN_MARKER[locale]) {
    completed.push({ id: "repairOrReplacement", label: fieldLabel("repairOrReplacement", locale), value: rr });
  }

  // Always-ask follow-up details for an accurate quote.
  for (const id of FOLLOW_UP_FIELDS) {
    missing.push({ id, label: missingLabel(id, locale), required: false });
  }
  // Soft preference question (not a hard requirement).
  if (!rr || rr === OPEN_MARKER[locale]) {
    missing.push({ id: "repairOrReplacement", label: missingLabel("repairOrReplacement", locale), required: false });
  }

  return { completed, missing };
}

/** Short, natural-reading summary of the whole request from the extracted fields. */
export function buildRequestSummary(
  extracted: ExtractedJobData,
  locale: RequestLocale,
  fallback = ""
): string {
  const labels = {
    de: { site: "Einsatzort", time: "Gewünschter Zeitraum", year: "Baujahr" },
    sk: { site: "Miesto realizácie", time: "Želaný termín", year: "Rok výroby" },
    en: { site: "Location", time: "Preferred timeframe", year: "Year" },
  }[locale];

  const sentences: string[] = [];
  if (extracted.systemType) {
    sentences.push(
      extracted.systemYear
        ? `${extracted.systemType} (${labels.year} ${extracted.systemYear})`
        : extracted.systemType
    );
  }
  if (extracted.issue) sentences.push(extracted.issue.charAt(0).toUpperCase() + extracted.issue.slice(1));
  const site = [extracted.address, extracted.city].filter(Boolean).join(", ");
  if (site) sentences.push(`${labels.site}: ${site}`);
  if (extracted.desiredTimeframe) sentences.push(`${labels.time}: ${extracted.desiredTimeframe}`);

  if (sentences.length === 0) return cleanCustomerText(fallback).slice(0, 200);
  return sentences.join(". ") + ".";
}

function salutation(name: string | undefined, locale: RequestLocale): string {
  const formatted = formatName(name);
  if (locale === "de") return formatted ? `Guten Tag ${formatted}` : "Guten Tag";
  if (locale === "en") return formatted ? `Hello ${formatted}` : "Hello";
  return formatted ? `Dobrý deň ${formatted}` : "Dobrý deň";
}

type ReplyCopy = {
  thanks: string;
  thanksFollowUp: string;
  receivedIntro: string;
  receivedLabels: Record<string, string>;
  askIntro: string;
  noMissing: string;
  closing: string;
  signOff: string;
};

const REPLY_COPY: Record<RequestLocale, ReplyCopy> = {
  de: {
    thanks: "vielen Dank für Ihre Anfrage.",
    thanksFollowUp: "vielen Dank für die zusätzlichen Angaben.",
    receivedIntro: "Wir haben folgende Informationen erhalten:",
    receivedLabels: {
      site: "Einsatzort",
      timeframe: "Zeitraum",
      system: "Anlage",
      issue: "Problem",
      phone: "Telefonnummer",
    },
    askIntro: "Damit wir den Aufwand besser einschätzen können, senden Sie uns bitte noch:",
    noMissing: "Wir haben alle nötigen Angaben und melden uns in Kürze mit den nächsten Schritten.",
    closing: "Danach können wir die nächsten Schritte mit Ihnen abstimmen.",
    signOff: "Mit freundlichen Grüßen",
  },
  sk: {
    thanks: "ďakujeme za Váš dopyt.",
    thanksFollowUp: "ďakujeme za doplňujúce informácie.",
    receivedIntro: "Zaznamenali sme tieto informácie:",
    receivedLabels: {
      site: "Miesto realizácie",
      timeframe: "Termín",
      system: "Zariadenie",
      issue: "Problém",
      phone: "Telefónne číslo",
    },
    askIntro: "Aby sme vedeli lepšie posúdiť rozsah, pošlite nám prosím ešte:",
    noMissing: "Máme všetky potrebné údaje a čoskoro sa Vám ozveme s ďalšími krokmi.",
    closing: "Následne s Vami dohodneme ďalšie kroky.",
    signOff: "S pozdravom",
  },
  en: {
    thanks: "thank you for your inquiry.",
    thanksFollowUp: "thank you for the additional details.",
    receivedIntro: "We have recorded the following information:",
    receivedLabels: {
      site: "Location",
      timeframe: "Timeframe",
      system: "System",
      issue: "Issue",
      phone: "Phone",
    },
    askIntro: "To estimate the effort accurately, please also send us:",
    noMissing: "We have all the details we need and will get back to you shortly with next steps.",
    closing: "After that we can agree on the next steps with you.",
    signOff: "Best regards",
  },
};

/**
 * Smart reply draft: confirms what the customer already provided and asks ONLY for
 * fields that are still missing. Never re-asks known address / phone / timeframe.
 */
export function buildSmartReplyDraft(opts: {
  companyName: string;
  customerName?: string;
  extracted: ExtractedJobData;
  missing: MissingField[];
  locale: RequestLocale;
  followUp?: boolean;
}): { draft: string; missingInfo: string[] } {
  const { extracted, locale } = opts;
  const copy = REPLY_COPY[locale];
  const company = opts.companyName.trim() || "Staveto";

  const received: string[] = [];
  const site = [extracted.address, extracted.city].filter(Boolean).join(", ");
  if (site) received.push(`- ${copy.receivedLabels.site}: ${site}`);
  if (extracted.desiredTimeframe) received.push(`- ${copy.receivedLabels.timeframe}: ${extracted.desiredTimeframe}`);
  if (extracted.systemType) {
    const sys = extracted.systemYear
      ? `${extracted.systemType}, ${FIELD_LABELS.systemYear[locale]} ${extracted.systemYear}`
      : extracted.systemType;
    received.push(`- ${copy.receivedLabels.system}: ${sys}`);
  }
  if (extracted.issue) received.push(`- ${copy.receivedLabels.issue}: ${extracted.issue}`);
  if (extracted.phone) received.push(`- ${copy.receivedLabels.phone}: ${extracted.phone}`);

  // Ask only for askable missing fields (skip the soft repair/replace preference).
  const askable = opts.missing.filter((m) => ASK_PHRASES[m.id]);
  const askItems = askable.map((m) => `- ${ASK_PHRASES[m.id]![locale]}`);
  const missingInfo = opts.missing.map((m) => m.label);

  const thanks = opts.followUp && received.length > 0 ? copy.thanksFollowUp : copy.thanks;
  const parts: string[] = [`${salutation(opts.customerName, locale)},`, "", thanks];

  if (received.length > 0) parts.push("", copy.receivedIntro, ...received);
  if (askItems.length > 0) parts.push("", copy.askIntro, ...askItems, "", copy.closing);
  else parts.push("", copy.noMissing);

  parts.push("", copy.signOff, company);

  return { draft: parts.join("\n"), missingInfo };
}
