import { Inter } from "next/font/google";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import "../globals.css";
import { authOptions } from "@/lib/auth";
import { DashboardNavProvider } from "@/context/DashboardNavContext";
import DashboardSidebar from "@/components/DashboardSidebar";
import { DashboardTopBar } from "@/components/DashboardTopBar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-dashboard",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = null;
  try {
    session = await getServerSession(authOptions);
  } catch (e) {
    // JWT decryption failed (e.g. NEXTAUTH_SECRET missing or changed) — force re-login
    redirect("/login");
  }
  if (!session) redirect("/login");

  return (
    <DashboardNavProvider>
      <div
        className={`${inter.variable} home-premium home-apm home-apm-bg relative min-h-screen text-[var(--foreground)]`}
        style={{
          fontFamily: "var(--font-dashboard), system-ui, sans-serif",
        }}
      >
        <div
          className="pointer-events-none fixed left-0 top-0 z-10 h-[320px] w-[320px] rounded-full opacity-[0.18]"
          style={{
            background: "radial-gradient(circle at 0% 0%, rgba(190, 254, 52, 0.1) 0%, transparent 62%)",
          }}
        />
        <div className="relative z-10 flex min-h-screen">
          <aside
            className="fixed left-0 top-0 z-20 h-full w-[240px] shrink-0 border-r border-white/[0.06]"
            style={{
              background: "rgba(10, 10, 10, 0.72)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              boxShadow: "4px 0 24px rgba(0,0,0,0.25)",
            }}
          >
            <div
              className="pointer-events-none absolute left-0 top-0 h-32 w-32 rounded-full opacity-50"
              style={{
                background: "radial-gradient(circle at 0% 0%, rgba(190, 254, 52, 0.08) 0%, transparent 70%)",
              }}
            />
            <div className="relative z-10 flex h-full flex-col px-4 py-6">
              <DashboardSidebar />
            </div>
          </aside>

          <main className="relative z-10 min-h-screen flex-1 pl-[240px] scroll-smooth">
            <DashboardTopBar />
            {children}
          </main>
        </div>
      </div>
    </DashboardNavProvider>
  );
}
