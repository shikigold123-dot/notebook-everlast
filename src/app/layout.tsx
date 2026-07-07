import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-plex-mono",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

export const metadata: Metadata = {
  title: "Everlast",
  description:
    "Quellen hochladen, mit ihnen chatten, Artefakte und Podcasts generieren — die NotebookLM-Alternative im Dossier-Format.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body
        className={`${plexMono.variable} ${plexSans.variable} font-mono antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
