import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@xyflow/react/dist/style.css";
import { StartupIntro } from "@/components/ui/StartupIntro";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Everlast NotebookLM Alternative by Matin",
  description:
    "Everlast NotebookLM Alternative by Matin: Quellen hochladen, chatten, Artefakte und Podcasts generieren.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="de"
      data-theme="dark"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="font-sans antialiased">
        <script
          // Verhindert Theme-Flash: Standard ist Dark, nur ein explizit
          // gespeichertes "light" wird vor dem ersten Paint übernommen.
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("everlast_theme")==="light"){document.documentElement.dataset.theme="light"}}catch(e){}',
          }}
        />
        <StartupIntro />
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
