import { NextResponse } from "next/server";
import { hash } from "bcrypt";
import { prisma } from "@/lib/prisma";
import {
  deepNodeErrorCode,
  getDatabaseUrlForDiagnostics,
  safeParseDbHost,
} from "@/lib/dbDiagnostics";

// bcrypt + prisma = Node runtime required.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      return NextResponse.json(
        { error: "Invalid email" },
        { status: 400 }
      );
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const hashedPassword = await hash(password, 12);
    await prisma.user.create({
      data: {
        email: trimmedEmail,
        password: hashedPassword,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Signup error:", e);
    const isDev = process.env.NODE_ENV === "development";
    const err = e as { code?: string; message?: string };
    const systemCode = deepNodeErrorCode(e) ?? err.code;
    const dbUrl = getDatabaseUrlForDiagnostics();
    const dbHost = safeParseDbHost(dbUrl);
    const isLocalhostHost = dbHost === "localhost" || dbHost === "127.0.0.1";
    let message = "Something went wrong";
    const supabaseHint =
      "Cannot connect to database. Set DATABASE_URL in .env.local to your Supabase Postgres URI (Project Settings → Database). URL-encode special characters in the password (e.g. @ → %40) and append ?sslmode=require if the URI does not already include ssl.";
    const localhostRefused =
      "DATABASE_URL points to localhost, but nothing is accepting Postgres connections there (ECONNREFUSED). For Supabase, replace it with the connection string from the dashboard (host like db.<project-ref>.supabase.co or the pooler host), not localhost—unless you intentionally run Postgres on this machine.";
    if (
      systemCode === "ECONNREFUSED" ||
      systemCode === "ETIMEDOUT" ||
      systemCode === "ENOTFOUND" ||
      systemCode === "ENETUNREACH" ||
      systemCode === "EHOSTUNREACH"
    ) {
      message =
        systemCode === "ECONNREFUSED" && isLocalhostHost ? localhostRefused : supabaseHint;
    } else if (err.message?.includes("does not exist") || err.message?.includes("relation")) {
      message = "Database tables missing. Run: npx prisma db push";
    } else if (isDev && err.message) {
      message = err.message;
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
