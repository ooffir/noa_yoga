import type { Metadata, Viewport } from "next";
import { Varela_Round } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { heIL } from "@clerk/localizations";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const varela = Varela_Round({
  weight: "400",
  subsets: ["latin", "hebrew"],
  variable: "--font-varela",
  display: "swap",
});

// Default site-wide metadata. Individual pages can override via their own
// `export const metadata` or `generateMetadata()`. Next.js merges shallowly,
// so anything here (icons, OG image fallback) becomes the default everywhere.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://noa-yoga.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Noa Yogis | סטודיו יוגה",
    template: "%s | Noa Yogis",
  },
  description:
    "סטודיו יוגה בהנחיית נועה אופיר. הרשמה אונליין לשיעורים, כרטיסיות, סדנאות ותוכן מעולם התרגול.",
  applicationName: "Noa Yogis",
  keywords: ["יוגה", "סטודיו יוגה", "נועה אופיר", "Vinyasa", "שיעורי יוגה", "סדנאות יוגה"],
  authors: [{ name: "Noa Ofir" }],
  icons: {
    // Next.js App Router auto-serves a `favicon.ico` placed at src/app/,
    // but we also declare explicit entries so older browsers + WhatsApp's
    // link preview get a predictable icon URL.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/yoga-pose.png", type: "image/png" },
    ],
    apple: "/yoga-pose.png",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: SITE_URL,
    siteName: "Noa Yogis",
    title: "Noa Yogis | סטודיו יוגה",
    description:
      "סטודיו יוגה בהנחיית נועה אופיר. הרשמה אונליין לשיעורים, כרטיסיות וסדנאות.",
    images: [
      {
        url: "/yoga-pose.png",
        width: 1200,
        height: 630,
        alt: "Noa Yogis — סטודיו יוגה",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Noa Yogis | סטודיו יוגה",
    description:
      "סטודיו יוגה בהנחיית נועה אופיר. הרשמה אונליין לשיעורים, כרטיסיות וסדנאות.",
    images: ["/yoga-pose.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#587b5b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className={varela.variable} suppressHydrationWarning>
      <body className="font-sans min-h-screen bg-sand-50 text-sage-900 antialiased" suppressHydrationWarning>
        <ClerkProvider
          localization={heIL}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
          afterSignOutUrl="/"
        >
          <Toaster
            position="top-center"
            toastOptions={{
              className: "!rounded-2xl !shadow-lg !text-sm !font-sans",
              duration: 4000,
            }}
          />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
