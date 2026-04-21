import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { rateLimit } from "@/lib/rateLimit";
import { getEnv } from "@/lib/env";
import type { WhatThisMeansSignals } from "@/lib/whatThisMeansSignals";
import { sanitizeWhatThisMeansText } from "@/lib/whatThisMeansSignals";
import { buildWhatThisMeansFallback } from "@/lib/whatThisMeansFallback";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: getEnv("OPENAI_API_KEY"),
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function isValidSignals(x: unknown): x is WhatThisMeansSignals {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const fi = ["fast", "slow", "comparable"];
  const inter = ["smooth", "delayed", "comparable"];
  const lay = ["stable", "unstable", "comparable"];
  const pos = ["advantage", "behind", "neutral"];
  const conf = ["high", "medium", "low"];
  return (
    fi.includes(o.first_impression as string) &&
    inter.includes(o.interaction as string) &&
    lay.includes(o.layout as string) &&
    pos.includes(o.position as string) &&
    conf.includes(o.confidence as string)
  );
}

function parseBody(body: unknown): { signals: WhatThisMeansSignals; phraseSeed: string } | null {
  if (!body || typeof body !== "object") return null;
  const o = { ...(body as Record<string, unknown>) };
  const phraseSeed = typeof o.phrase_seed === "string" ? o.phrase_seed : "";
  delete o.phrase_seed;
  if (!isValidSignals(o)) return null;
  return { signals: o, phraseSeed };
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(`what-this-means:${ip}`)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid signals payload." }, { status: 400 });
  }

  const { signals, phraseSeed } = parsed;

  if (!getEnv("OPENAI_API_KEY")) {
    return NextResponse.json({ text: buildWhatThisMeansFallback(signals, phraseSeed) });
  }

  const userPayload = JSON.stringify(signals);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You turn a small JSON object into calm, simple English for non-native readers. Use only what the fields imply. Do not add metrics, tools, or invented causes. Do not contradict the position field.

Writing rules:
- Plain text only, no markdown.
- Exactly three numbered lines (1. 2. 3.). Each line: exactly two short sentences (what happens, then how it feels). Keep each sentence easy to read in one pass.
- Line 1 = first_impression only. Line 2 = interaction (taps and scrolls). Line 3 = layout (page movement).
- Write from the reader or visitor point of view only. Do not use: "we compared", "we looked at", "this run", "this set", or other audit voice.
- Avoid repeating the words "same" and "similar" across lines; use varied simple words (even, tied, balanced, matched pace, little gap, etc.) when meaning is tied.
- Avoid: "comes in at", "roughly", "stands out", "benchmark", "lags behind", "trails", "outperforms".
- No business jargon. No technical terms (no LCP, INP, CLS, FCP, TTFB, thread). No em dashes or arrow symbols.
- Do not give generic product advice (no "good copy", "checkout", "pricing", "funnel", "marketing"). Closing must stay about page speed and what to do next on performance only, except for the neutral case below.
- Ignore confidence for wording; do not mention confidence or reruns.

Closing block (after a blank line):
- If position is "neutral", output this closing verbatim (three sentences): Overall, both sites perform at a similar level. Speed is not the problem here. Focus on conversion or product experience instead.
- If position is "advantage" or "behind": write two or three short sentences in plain English—clear verdict, why waiting or speed matters for the visit, one performance-only next step (no technical stack detail).

Output format exactly:

WHAT THIS MEANS

1. ...

2. ...

3. ...

{closing block}`,
        },
        {
          role: "user",
          content: `phrase_seed (for stable wording across runs, do not echo): ${phraseSeed || "unknown"}\nSignals (only interpret these):\n${userPayload}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json({ text: buildWhatThisMeansFallback(signals, phraseSeed) });
    }

    return NextResponse.json({ text: sanitizeWhatThisMeansText(raw) });
  } catch (e) {
    console.error("[competitor-what-this-means]", e);
    return NextResponse.json({ text: buildWhatThisMeansFallback(signals, phraseSeed) });
  }
}
