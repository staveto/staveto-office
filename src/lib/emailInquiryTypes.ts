export type EmailInquiryStatus =
  | "new"
  | "negotiating"
  | "agreed"
  | "converted"
  | "ignored";

export type EmailIntent =
  | "new_project"
  | "follow_up"
  | "invoice"
  | "other";

export type ExtractedJobData = {
  customerName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  requestType?: string;
  systemType?: string;
  systemYear?: string;
  issue?: string;
  desiredTimeframe?: string;
  urgency?: string;
  repairOrReplacement?: string;
};

export type EmailAiClassification = {
  intent: EmailIntent;
  confidence: number;
  suggestedTitle?: string;
  customerName?: string;
  customerEmail?: string;
  scopeBullets?: string[];
  missingInfo?: string[];
  suggestedReply?: string;
  summary?: string;
  extracted?: ExtractedJobData;
  classifiedAt?: string;
};

export type EmailAttachmentMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  gmailAttachmentId?: string;
  storagePath?: string;
  importedToProjectId?: string;
  selected?: boolean;
};

export type EmailInquiryMessage = {
  id: string;
  gmailMessageId: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  sentAt: string;
  attachments: EmailAttachmentMeta[];
};

export type EmailInquiry = {
  id: string;
  orgId: string;
  gmailThreadId: string;
  subject: string;
  fromEmail: string;
  fromName?: string;
  snippet: string;
  status: EmailInquiryStatus;
  ai?: EmailAiClassification;
  projectId?: string;
  connectedByUid?: string;
  lastMessageAt: string;
  unread: boolean;
  messageCount: number;
  createdAt?: string;
  updatedAt?: string;
};
