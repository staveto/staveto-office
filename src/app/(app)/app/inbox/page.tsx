import { Suspense } from "react";
import { EmailInboxPage } from "@/components/inbox/EmailInboxPage";
import { Loader2 } from "lucide-react";

function InboxFallback() {
  return (
    <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}

export default function InboxRoutePage() {
  return (
    <Suspense fallback={<InboxFallback />}>
      <EmailInboxPage />
    </Suspense>
  );
}
