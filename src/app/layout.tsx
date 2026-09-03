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
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <header className="border-b bg-white">
          <nav className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
            <Link href="/" className="font-bold text-lg">
              ניהול פרסום 📱
            </Link>
            <div className="flex gap-4 text-sm">
              <Link href="/posts/new" className="text-blue-600 hover:underline">
                פוסט חדש
              </Link>
              <Link href="/settings" className="text-neutral-600 hover:underline">
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
