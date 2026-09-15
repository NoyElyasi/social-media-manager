import type { Metadata } from "next";
import Link from "next/link";
import { getProfileSettings } from "@/server/settings/profile";
import { buildFileUrlFromPath } from "@/lib/files";
import "./globals.css";

/**
 * הפייביקון (סעיף הטאב בדפדפן) — דינמי, לפי תמונת הפרופיל שהועלתה בהגדרות,
 * כדי שלא יישאר הפייביקון הגנרי של Next ("המשולש השחור") אחרי שהעלינו לוגו
 * אמיתי. אם עדיין לא הועלתה תמונת פרופיל, Next יחזור אוטומטית ל-favicon.ico
 * הסטטי הרגיל.
 */
export async function generateMetadata(): Promise<Metadata> {
  const profile = await getProfileSettings();
  return {
    title: "ניהול פרסום ברשתות חברתיות",
    description: "כלי אישי להכנת תוכן לפייסבוק, אינסטגרם ווואטסאפ",
    icons: profile.profileImagePath ? { icon: buildFileUrlFromPath(profile.profileImagePath) } : undefined,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const profile = await getProfileSettings();
  const logoUrl = profile.profileImagePath ? buildFileUrlFromPath(profile.profileImagePath) : null;

  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-brand-cream text-brand-maroon">
        <header className="border-b border-brand-pink/40 bg-brand-card">
          <nav className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
              ) : (
                <span className="rounded-md bg-brand-pink px-2 py-1 text-xs font-black leading-tight text-white">
                  #אחת
                  <br />
                  ביום
                </span>
              )}
              <span className="font-bold text-lg text-brand-maroon">ניהול פרסום</span>
            </Link>
            <div className="flex gap-4 text-sm font-medium">
              <Link href="/" className="text-brand-maroon/70 hover:text-brand-maroon">
                פוסטים קודמים
              </Link>
              <Link href="/dashboard" className="text-brand-maroon/70 hover:text-brand-maroon">
                דשבורד
              </Link>
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
