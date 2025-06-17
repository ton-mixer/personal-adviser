import { requireAuth } from "@/lib/auth";
import { MainLayout } from "@/components/layout/main-layout";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Verify authentication for all protected routes
  await requireAuth();

  return <MainLayout>{children}</MainLayout>;
}
