import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";

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
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
