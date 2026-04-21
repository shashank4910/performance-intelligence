// Prisma 7: connection URL read here. Prefer .env.local (Supabase) over .env.
import dotenv from "dotenv";
import path from "path";

const root = path.resolve(process.cwd());
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local"), override: true });

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is not set. Add it to .env or .env.local");

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: databaseUrl },
});
