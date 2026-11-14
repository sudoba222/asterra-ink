import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/app";
import "@/app/styles/globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ASTERRA — Agriculture intelligence from NASA Earth data", template: "%s · ASTERRA" },
  description:
    "Explore any country on a 3D Earth, see NASA climate and satellite indicators, and get transparent crop-rotation guidance.",
};

export const viewport: Viewport = {
  themeColor: "#10251E",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
