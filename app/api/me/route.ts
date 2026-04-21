import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectsByUserId } from "@/lib/project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Current user + projects for account menu (websites list).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id as string;
  const projects = await getProjectsByUserId(userId);

  return NextResponse.json({
    user: {
      id: userId,
      email: session.user.email ?? null,
    },
    projects: projects.map((p) => ({
      id: p.id,
      url: p.url,
      industry: p.industry,
    })),
  });
}
