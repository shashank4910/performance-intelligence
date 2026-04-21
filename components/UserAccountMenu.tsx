"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

type MeProjects = {
  user: { id: string; email: string | null };
  projects: { id: string; url: string; industry: string | null }[];
};

type UserAccountMenuProps = {
  /** Visual style: header (home) vs slim top bar on dashboard */
  variant?: "header" | "dashboard";
};

export function UserAccountMenu({ variant = "header" }: UserAccountMenuProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<MeProjects | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isAuthed = status === "authenticated" && !!session?.user;
  const email = session?.user?.email ?? "";
  const initial = email ? email[0]!.toUpperCase() : "?";

  const loadMe = useCallback(async () => {
    setMeError(null);
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (!res.ok) {
        setMe(null);
        if (res.status === 401) return;
        setMeError("Could not load websites.");
        return;
      }
      const data = (await res.json()) as MeProjects;
      setMe(data);
    } catch {
      setMeError("Could not load websites.");
      setMe(null);
    }
  }, []);

  useEffect(() => {
    if (!open || !isAuthed) return;
    void loadMe();
  }, [open, isAuthed, loadMe]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const buttonRing =
    variant === "dashboard"
      ? "border-white/[0.12] bg-white/[0.06] text-[#dae2fd] hover:border-[#39FF14]/35 hover:bg-[#39FF14]/10"
      : "border-white/12 bg-white/5 text-zinc-100 hover:border-[#befe34]/35 hover:bg-[#befe34]/10";

  if (status === "loading") {
    return (
      <div
        className={`h-9 w-9 shrink-0 animate-pulse rounded-full border border-white/10 bg-white/5 ${variant === "dashboard" ? "h-8 w-8" : ""}`}
        aria-hidden
      />
    );
  }

  if (!isAuthed) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className={
            variant === "dashboard"
              ? "rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted)] transition hover:bg-white/[0.06] hover:text-[#dae2fd]"
              : "rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[#befe34]"
          }
        >
          Log in
        </Link>
        <Link
          href="/auth/signup"
          className={
            variant === "dashboard"
              ? "rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-sm font-semibold text-[#dae2fd] transition hover:border-[#39FF14]/35"
              : "rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-[#befe34]/35 hover:bg-[#befe34]/10"
          }
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition ${buttonRing} ${variant === "dashboard" ? "h-8 w-8 text-xs" : ""}`}
      >
        {initial}
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute right-0 z-[100] mt-2 min-w-[min(100vw-2rem,280px)] rounded-xl border border-white/[0.1] bg-[#0d121c] py-2 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
            variant === "dashboard" ? "ring-1 ring-white/[0.04]" : ""
          }`}
        >
          <div className="border-b border-white/[0.06] px-3 pb-3 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Signed in as</p>
            <p className="mt-1 truncate text-sm font-medium text-zinc-100" title={email || undefined}>
              {email || "Account"}
            </p>
            {me?.user?.id ? (
              <p className="mt-1 font-mono text-[10px] text-zinc-500 break-all">
                ID: {me.user.id}
              </p>
            ) : null}
          </div>

          <div className="border-b border-white/[0.06] px-2 py-2">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Your websites
            </p>
            {meError ? <p className="px-2 text-xs text-amber-400/90">{meError}</p> : null}
            {!me && !meError ? (
              <p className="px-2 text-xs text-zinc-500">Loading…</p>
            ) : me && me.projects.length === 0 ? (
              <p className="px-2 text-xs text-zinc-500">No projects yet. Run an analysis from the home page.</p>
            ) : (
              <ul className="max-h-40 overflow-y-auto">
                {me?.projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/dashboard/${p.id}`}
                      role="menuitem"
                      className="block truncate rounded-lg px-2 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-[#dae2fd]"
                      title={p.url}
                    >
                      {p.url}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-2 py-1">
            <Link
              href="/dashboard"
              role="menuitem"
              className="block rounded-lg px-2 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-[#dae2fd]"
            >
              Dashboard
            </Link>
            <Link
              href="/"
              role="menuitem"
              className="block rounded-lg px-2 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-[#dae2fd]"
            >
              Home
            </Link>
          </div>

          <div className="border-t border-white/[0.06] px-2 pt-2">
            <button
              type="button"
              role="menuitem"
              className="w-full rounded-lg px-2 py-2.5 text-left text-sm font-medium text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
