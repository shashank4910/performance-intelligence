import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcrypt";
import { prisma } from "./prisma";
import { getEnv } from "./env";

// Read lazily so `next build` does not fail when env vars aren't yet set on a
// preview. NextAuth itself throws at request time if `secret` is missing,
// which surfaces a clearer error than crashing at module load.
const secret = getEnv("NEXTAUTH_SECRET");
if (!secret && process.env.NODE_ENV !== "production") {
  console.warn(
    "[auth] NEXTAUTH_SECRET is not set. Add it to .env.local " +
      "(run: openssl rand -base64 32) before signing in."
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user) return null;
        const valid = await compare(credentials.password, user.password);
        if (!valid) return null;
        return { id: user.id, email: user.email };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  secret,
};
