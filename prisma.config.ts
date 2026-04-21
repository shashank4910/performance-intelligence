// Prisma 7: connection URL read here. Prefer .env.local (Supabase) over .env.
import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "prisma/config";

const root = path.resolve(process.cwd());
// Best-effort local env loading — on Vercel these files don't exist and env
// vars come from the platform, which is fine.
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local"), override: true });

const databaseUrl = process.env["DATABASE_URL"];

// Don't throw here: `prisma generate` doesn't need a DATABASE_URL and runs as
// part of the Vercel build. Commands that DO need the URL (db push, migrate,
// studio) will emit their own clear error from the Prisma CLI.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
