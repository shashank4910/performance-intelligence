import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { getImpactNarrativeFallback, getImpactNarrativePrompt, type ImpactNarrativeInput } from "@/lib/impactEngine/cortexNarrative";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });

export async function POST(request: NextRequest) {
  let body: ImpactNarrativeInput;
  try {
    body = (await request.json()) as ImpactNarrativeInput;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body?.stage == null || typeof body.resourceLeak !== "number") {
    return NextResponse.json({ error: "stage and resourceLeak required." }, { status: 400 });
  }

  const fallback = getImpactNarrativeFallback(body);

  if (!getEnv("OPENAI_API_KEY")) {
    return NextResponse.json({ narrative: fallback });
  }

  try {
    const prompt = getImpactNarrativePrompt(body);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a performance economics analyst. Reply with one concise paragraph only. No markdown." },
        { role: "user", content: prompt },
      ],
    });
    const content = completion.choices[0]?.message?.content?.trim();
    const narrative = content && content.length > 0 ? content : fallback;
    return NextResponse.json({ narrative });
  } catch (error) {
    console.error("[cortex-narrative] OpenAI error:", error);
    return NextResponse.json({ narrative: fallback });
  }
}
