import { requireAuth } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UploadForm } from "@/app/(protected)/upload/upload-form";

export default async function UploadPage() {
  await requireAuth();

  return (
    <div className="container mx-auto py-10 max-w-3xl">
      <div className="flex items-center mb-8">
        <Link href="/dashboard">
          <Button variant="outline" size="sm" className="mr-4">
            ← Back to Dashboard
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Upload Statement</h1>
      </div>

      <UploadForm />
    </div>
  );
}
