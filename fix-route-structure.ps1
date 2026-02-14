# Fix app/api/analyze/route.ts structure for Next.js
# Run with: .\fix-route-structure.ps1
#
# IMPORTANT: Stop the dev server (Ctrl+C) and close any editor tabs under app\api
# before running, or the folder cannot be removed.

$analyzeDir = Join-Path $PSScriptRoot "app\api\analyze"
$wrongPath = Join-Path $analyzeDir "route.ts"   # currently a directory (wrong)
$routeContent = @'
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
      `https://hook.us2.make.com/rzm6lhgit29f5zgtqtkm0vgloxms1iyh?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(60000) }
    );

    const text = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: text || `Request failed (${response.status})` },
        { status: response.status }
      );
    }

    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { error: "Invalid response from analysis service." },
        { status: 502 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Server error";
    const isTimeout =
      error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: isTimeout
          ? "Analysis timed out. Try again or use a simpler URL."
          : `Server error: ${message}`,
      },
      { status: 500 }
    );
  }
}
'@

if (-not (Test-Path $analyzeDir)) {
  Write-Host "Creating app\api\analyze"
  New-Item -ItemType Directory -Path $analyzeDir -Force | Out-Null
}

$item = Get-Item -LiteralPath $wrongPath -ErrorAction SilentlyContinue
if ($item -and $item.PSIsContainer) {
  Write-Host "Removing incorrect folder: app\api\analyze\route.ts"
  Remove-Item -LiteralPath $wrongPath -Recurse -Force
  if (-not $?) {
    Write-Host "ERROR: Could not remove the folder. Close the dev server (npm run dev) and any editor tabs, then run this script again."
    exit 1
  }
}

Write-Host "Creating app\api\analyze\route.ts"
Set-Content -Path $wrongPath -Value $routeContent.TrimEnd() -Encoding UTF8
Write-Host "Done. Correct structure: app\api\analyze\route.ts (file)"
Write-Host "Start the dev server: npm run dev"
Write-Host "Optional: In app\page.tsx change the fetch URL back to /api/analyze and you can remove app\api\analyze-performance if you prefer one route."
exit 0
