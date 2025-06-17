import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { SessionProvider } from "@/components/providers/session-provider";
import { TRPCProvider } from "@/trpc/provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Personal Financial Adviser",
  description: "Automated financial statement processing and categorization",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <SessionProvider>
          <TRPCProvider>
            {children}
            <Toaster position="top-right" />
          </TRPCProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
