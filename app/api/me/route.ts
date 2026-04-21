import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getProjectsByUserId } from "@/lib/project";
import { safeGetServerSession } from "@/lib/safeSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Current user + projects for account menu (websites list).
 */
export async function GET() {
  const session = await safeGetServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id as string;
  const projects = await getProjectsByUserId(userId);

  type ProjectLite = { id: string; url: string; industry: string | null };

  return NextResponse.json({
    user: {
      id: userId,
      email: session.user.email ?? null,
    },
    projects: (projects as ProjectLite[]).map((p: ProjectLite) => ({
      id: p.id,
      url: p.url,
      industry: p.industry,
    })),
  });
}
