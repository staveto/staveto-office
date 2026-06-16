import { Suspense } from "react";
import { GmailOAuthSuccessPage } from "@/components/oauth/GmailOAuthSuccessPage";
import { Loader2 } from "lucide-react";

function Fallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function GmailOAuthSuccessRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <GmailOAuthSuccessPage />
    </Suspense>
  );
}
