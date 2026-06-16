type GmailHeader = { name: string; value: string };

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};

type GmailMessageListItem = { id: string; threadId: string };

type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    mimeType?: string;
    headers?: GmailHeader[];
    body?: { data?: string; size?: number };
    parts?: GmailPart[];
  };
};

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const h = headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value?.trim() ?? "";
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function extractBody(payload: GmailMessage["payload"]): { text: string; html?: string } {
  if (!payload) return { text: "" };

  const texts: string[] = [];
  const htmls: string[] = [];

  function walk(part: GmailPart) {
    const mime = part.mimeType ?? "";
    const data = part.body?.data;
    if (data) {
      const decoded = decodeBase64Url(data);
      if (mime === "text/plain") texts.push(decoded);
      if (mime === "text/html") htmls.push(decoded);
    }
    if ("parts" in part && part.parts) {
      for (const child of part.parts) walk(child);
    }
  }

  walk(payload as GmailPart);
  return {
    text: texts.join("\n").trim(),
    html: htmls[0],
  };
}

function parseEmailAddress(raw: string): { email: string; name?: string } {
  const match = raw.match(/^(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?$/);
  if (!match) return { email: raw.trim() };
  return { name: match[1]?.trim() || undefined, email: match[2].trim() };
}

export type ParsedGmailMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string;
  fromName?: string;
  to: string;
  snippet: string;
  bodyText: string;
  bodyHtml?: string;
  sentAt: string;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    gmailAttachmentId?: string;
  }>;
};

export function parseGmailMessage(msg: GmailMessage): ParsedGmailMessage {
  const headers = msg.payload?.headers;
  const fromRaw = headerValue(headers, "From");
  const parsedFrom = parseEmailAddress(fromRaw);
  const { text, html } = extractBody(msg.payload);
  const sentMs = msg.internalDate ? Number(msg.internalDate) : Date.now();

  const attachments: ParsedGmailMessage["attachments"] = [];
  function collectAttachments(parts: GmailPart[] | undefined) {
    if (!parts) return;
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          fileName: part.filename,
          mimeType: part.mimeType ?? "application/octet-stream",
          size: part.body.size ?? 0,
          gmailAttachmentId: part.body.attachmentId,
        });
      }
      if (part.parts) collectAttachments(part.parts);
    }
  }
  collectAttachments(msg.payload?.parts);

  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: headerValue(headers, "Subject") || "(bez predmetu)",
    from: fromRaw,
    fromEmail: parsedFrom.email,
    fromName: parsedFrom.name,
    to: headerValue(headers, "To"),
    snippet: msg.snippet ?? text.slice(0, 200),
    bodyText: text,
    bodyHtml: html,
    sentAt: new Date(sentMs).toISOString(),
    attachments,
  };
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error: ${res.status} ${err}`);
  }
  return res.json() as Promise<T>;
}

export async function listInboxMessages(
  accessToken: string,
  maxResults = 50
): Promise<GmailMessageListItem[]> {
  const inbox = await gmailFetch<{ messages?: GmailMessageListItem[]; resultSizeEstimate?: number }>(
    accessToken,
    `/messages?maxResults=${maxResults}&labelIds=INBOX`
  );
  if (inbox.messages?.length) return inbox.messages;

  // Some mailboxes archive everything or only keep mail outside INBOX label.
  const recent = await gmailFetch<{ messages?: GmailMessageListItem[] }>(
    accessToken,
    `/messages?maxResults=${maxResults}&q=newer_than:365d`
  );
  return recent.messages ?? [];
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<ParsedGmailMessage> {
  const raw = await gmailFetch<GmailMessage>(
    accessToken,
    `/messages/${messageId}?format=full`
  );
  return parseGmailMessage(raw);
}

export async function getThreadMessages(
  accessToken: string,
  threadId: string
): Promise<ParsedGmailMessage[]> {
  const data = await gmailFetch<{ messages?: GmailMessage[] }>(
    accessToken,
    `/threads/${threadId}?format=full`
  );
  const messages = data.messages ?? [];
  return messages
    .map(parseGmailMessage)
    .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
}

export async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Uint8Array> {
  const data = await gmailFetch<{ data?: string }>(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`
  );
  if (!data.data) throw new Error("ATTACHMENT_EMPTY");
  const normalized = data.data.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(normalized, "base64"));
}

function buildRawEmail(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
  ];
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
  lines.push("", opts.body);
  return lines.join("\r\n");
}

export async function sendGmailReply(opts: {
  accessToken: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
  threadId: string;
  inReplyToMessageId?: string;
}): Promise<{ id: string; threadId: string }> {
  const raw = buildRawEmail({
    from: opts.fromEmail,
    to: opts.to,
    subject: opts.subject.startsWith("Re:") ? opts.subject : `Re: ${opts.subject}`,
    body: opts.body,
    inReplyTo: opts.inReplyToMessageId,
    references: opts.inReplyToMessageId,
  });

  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: encoded,
      threadId: opts.threadId,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send failed: ${err}`);
  }

  const data = (await res.json()) as { id: string; threadId: string };
  return data;
}
