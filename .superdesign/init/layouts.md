# Layouts — full source

## Root layout — `app/layout.tsx`

Wraps all pages: Geist + Geist Mono + Inter CSS variables, `scroll-smooth` on `<html>`, `Providers` for session.

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Performance Intelligence Engine",
  description: "Analyze UI performance metrics and get actionable insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## Dashboard layout — `app/dashboard/layout.tsx`

Auth-gated shell: fixed **240px** glass sidebar (`DashboardSidebar`), grid background, radial glow. Main content `pl-[240px]`. Uses Inter as `--font-dashboard`.

See repository file for full source (session check, redirect, `DashboardNavProvider`).
