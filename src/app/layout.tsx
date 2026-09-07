import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ניהול פרסום ברשתות חברתיות",
  description: "כלי אישי להכנת תוכן לפייסבוק, אינסטגרם ווואטסאפ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-brand-cream text-brand-maroon">
        <header className="border-b border-brand-pink/40 bg-brand-card">
          <nav className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="rounded-md bg-brand-pink px-2 py-1 text-xs font-black leading-tight text-white">
                #אחת
                <br />
                ביום
              </span>
              <span className="font-bold text-lg text-brand-maroon">ניהול פרסום</span>
            </Link>
            <div className="flex gap-4 text-sm font-medium">
              <Link href="/posts/new" className="text-brand-red hover:text-brand-red-dark">
                פוסט חדש
              </Link>
              <Link href="/settings" className="text-brand-maroon/70 hover:text-brand-maroon">
                הגדרות
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
