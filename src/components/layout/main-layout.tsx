import { MainHeader } from "./main-header";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="relative min-h-screen flex flex-col">
      <MainHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
