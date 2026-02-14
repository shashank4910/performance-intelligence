import { NextRequest, NextResponse } from "next/server";

let lastRequestTime = 0;

export async function GET(request: NextRequest) {
  const now = Date.now();

  if (now - lastRequestTime < 10000) {
    return NextResponse.json(
      { error: "Please wait before making another request." },
      { status: 429 }
    );
  }

  lastRequestTime = now;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL is required" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://hook.us2.make.com/rzm6lhgit29f5zgtqtkm0vgloxms1iyh?url=${encodeURIComponent(url)}`
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: text },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
