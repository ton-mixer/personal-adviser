import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth-options";

export async function requireAuth() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/");
  }

  return session;
}

export { authOptions };
