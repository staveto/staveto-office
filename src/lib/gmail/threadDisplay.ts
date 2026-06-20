import type { EmailInquiryMessage } from "@/lib/emailInquiryTypes";

const QUOTE_MARKERS: RegExp[] = [
  /^On .+ wrote:$/i,
  /^Am .+ schrieb.*:$/i,
  /^Le .+ a écrit\s*:$/i,
  /^Dňa .+ napísal.*:$/i,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^_{5,}$/,
  /^Von:\s/i,
  /^From:\s/i,
  /^De:\s/i,
  /^Od:\s/i,
  /^Gesendet:\s/i,
  /^Sent:\s/i,
];

/**
 * Splits an email body into the new (visible) content and the quoted history.
 * Quoted history = everything after a reply marker, plus leading ">"-prefixed lines.
 */
export function splitQuotedText(body: string): { visible: string; quoted: string } {
  if (!body) return { visible: "", quoted: "" };
  const lines = body.replace(/\r\n/g, "\n").split("\n");

  let cutIndex = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (QUOTE_MARKERS.some((re) => re.test(line))) {
      cutIndex = i;
      break;
    }
    // A run of ">" quoted lines also starts the quoted block.
    if (line.startsWith(">")) {
      cutIndex = i;
      break;
    }
  }

  const visibleLines = lines.slice(0, cutIndex);
  const quotedLines = lines.slice(cutIndex);

  return {
    visible: visibleLines.join("\n").trim(),
    quoted: quotedLines.join("\n").trim(),
  };
}

export type DisplayMessage = EmailInquiryMessage & {
  visibleBody: string;
  quotedBody: string;
};

export function toDisplayMessage(msg: EmailInquiryMessage): DisplayMessage {
  const { visible, quoted } = splitQuotedText(msg.bodyText || "");
  return { ...msg, visibleBody: visible || (msg.bodyText || "").trim(), quotedBody: quoted };
}

/** Returns the latest inbound (customer) message, or the latest message overall. */
export function findLatestCustomerMessage(
  messages: EmailInquiryMessage[]
): EmailInquiryMessage | undefined {
  const inbound = messages.filter((m) => m.direction === "inbound");
  const pool = inbound.length > 0 ? inbound : messages;
  return [...pool].sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))[0];
}
