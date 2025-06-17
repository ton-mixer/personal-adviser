import { requireAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoutButton } from "@/components/auth/logout-button";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function SettingsPage() {
  const session = await requireAuth();
  const user = session.user;

  return (
    <div className="container mx-auto py-10">
      <div className="flex items-center mb-8">
        <Link href="/dashboard">
          <Button variant="outline" size="sm" className="mr-4">
            ← Back to Dashboard
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              View and manage your account settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium text-sm text-muted-foreground mb-1">
                Name
              </h3>
              <p>{user?.name || "Not provided"}</p>
            </div>
            <div>
              <h3 className="font-medium text-sm text-muted-foreground mb-1">
                Email
              </h3>
              <p>{user?.email || "Not provided"}</p>
            </div>
            <div className="pt-4">
              <LogoutButton />
            </div>
          </CardContent>
        </Card>

        {/* Preferences Section (for future expansion) */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Customize your application experience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p>Preference settings will be added in a future update.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
