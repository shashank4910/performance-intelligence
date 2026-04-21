/**
 * Resolves Stitch screen HTML + screenshot URLs via the Stitch MCP API,
 * then downloads them with curl -L (follow redirects).
 *
 * Usage:
 *   node scripts/fetch-stitch-screen.mjs --project <id> --screen <id> [--out <dir>]
 *
 * API key: STITCH_API_KEY env, or reads X-Goog-Api-Key from .cursor/mcp.json
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Stitch, StitchToolClient } from "@google/stitch-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function parseArgs(argv) {
  const out = { project: "", screen: "", outDir: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") out.project = argv[++i] || "";
    else if (a === "--screen") out.screen = argv[++i] || "";
    else if (a === "--out") out.outDir = argv[++i] || "";
  }
  return out;
}

function loadApiKey() {
  if (process.env.STITCH_API_KEY?.trim()) return process.env.STITCH_API_KEY.trim();
  const mcpPath = join(repoRoot, ".cursor", "mcp.json");
  const raw = readFileSync(mcpPath, "utf8");
  const j = JSON.parse(raw);
  const k = j?.mcpServers?.stitch?.headers?.["X-Goog-Api-Key"];
  if (!k || typeof k !== "string") throw new Error("No API key: set STITCH_API_KEY or configure .cursor/mcp.json");
  return k.trim();
}

function curlDownload(url, destPath) {
  const r = spawnSync("curl", ["-L", "--fail", "--silent", "--show-error", "-o", destPath, url], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) throw new Error(`curl failed (${r.status}) for ${url}`);
}

const { project: projectId, screen: screenId, outDir } = parseArgs(process.argv);
if (!projectId || !screenId) {
  console.error("Usage: node scripts/fetch-stitch-screen.mjs --project <id> --screen <id> [--out <dir>]");
  process.exit(1);
}

const defaultOut = join(repoRoot, "stitch-export", "hynex-healthcare-dashboard", "revenue-impact-dashboard");
const out = outDir || defaultOut;
mkdirSync(out, { recursive: true });

const apiKey = loadApiKey();
const client = new StitchToolClient({ apiKey });
const stitch = new Stitch(client);

try {
  const project = stitch.project(projectId);
  const screen = await project.getScreen(screenId);
  const htmlUrl = await screen.getHtml();
  const imageUrl = await screen.getImage();
  if (!htmlUrl) throw new Error("Empty HTML download URL from Stitch");
  if (!imageUrl) throw new Error("Empty image download URL from Stitch");

  const meta = {
    projectId,
    screenId,
    title: "Revenue Impact Dashboard",
    htmlUrl,
    imageUrl,
    fetchedAt: new Date().toISOString(),
  };
  writeFileSync(join(out, "urls.json"), JSON.stringify(meta, null, 2), "utf8");
  console.log("Resolved URLs (also saved to urls.json):");
  console.log("  html: ", htmlUrl);
  console.log("  image:", imageUrl);

  const htmlPath = join(out, "screen.html");
  const imgPath = join(out, "screen.png");
  console.log("\nDownloading with curl -L …");
  curlDownload(htmlUrl, htmlPath);
  curlDownload(imageUrl, imgPath);
  console.log("Wrote:", htmlPath);
  console.log("Wrote:", imgPath);
} finally {
  await client.close();
}
