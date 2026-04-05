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

export const metadata: Metadata = {
  title: "Noa Yogis",
  description: "סטודיו יוגה – צפייה בשיעורים והרשמה אונליין",
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
