import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sky Explorer",
  description: "Point your phone at the real sky. Discover and explore the universe.",
  applicationName: "Sky Explorer",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05070d",
  colorScheme: "dark"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
