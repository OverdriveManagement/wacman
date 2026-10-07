import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toasts } from "@/components/ui";

export const metadata: Metadata = {
  title: "WiBridge",
  description: "WiBridge : questions et demandes d'éléments entre Wifirst et ses clients",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "WiBridge", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#031820",
};

const themeScript = `try{var t=localStorage.getItem('wibridge-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Hind+Madurai:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Toasts />
      </body>
    </html>
  );
}
