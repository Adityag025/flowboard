import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // "%s" is filled in by each page's own `title`, so /issues renders as
  // "Issues · FlowBoard" without any page repeating the suffix.
  title: {
    default: "FlowBoard",
    template: "%s · FlowBoard",
  },
  description: "Issue tracking and project management for small teams.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/*
          Mounted at the root, not per-page. A toast has to outlive the
          navigation that triggered it -- "Issue moved" fired during a route
          change would unmount with the page that raised it before it was read.
        */}
        <Toaster />
      </body>
    </html>
  );
}
