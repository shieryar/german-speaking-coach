import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "German Speaking Coach",
  description: "No-login German B1/B2 job speaking coach with corrections and voice replies",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
