import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConditionalAppLayout } from "@/components/layout/ConditionalAppLayout";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <ConditionalAppLayout>{children}</ConditionalAppLayout>
    </AuthGuard>
  );
}
