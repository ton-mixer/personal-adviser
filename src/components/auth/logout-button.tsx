"use client";

import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";
import { useState } from "react";

export function LogoutButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    await signOut({ callbackUrl: "/" });
  };

  return (
    <Button variant="destructive" onClick={handleLogout} disabled={isLoading}>
      {isLoading ? "Logging out..." : "Log out"}
    </Button>
  );
}
