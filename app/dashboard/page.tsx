import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { getProjectsByUserId } from "@/lib/project";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const projects = await getProjectsByUserId(session.user.id);

  if (projects.length > 0) {
    redirect(`/dashboard/${projects[0].id}`);
  }

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-xl font-semibold text-white">Dashboard</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        You don&apos;t have any projects yet.
      </p>
      <div className="mt-6 ui-panel p-6">
        <p className="text-sm text-[var(--foreground)]">
          Add your first site to see performance insights and revenue impact.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90"
        >
          Add a project
        </Link>
      </div>
    </div>
  );
}
