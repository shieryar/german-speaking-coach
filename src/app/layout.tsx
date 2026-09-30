import type { Metadata } from "next";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/archivo-black/latin-400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "German Speaking Coach",
  description: "No-login German B1/B2 job speaking coach with live conversations and transcripts",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
