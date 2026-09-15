"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; icon?: string; isActive: (pathname: string) => boolean }[] = [
  { href: "/", label: "פוסטים קודמים", isActive: (p) => p === "/" || (p.startsWith("/posts") && p !== "/posts/new") },
  { href: "/dashboard", label: "דשבורד", isActive: (p) => p.startsWith("/dashboard") },
  { href: "/posts/new", label: "פוסט חדש", isActive: (p) => p === "/posts/new" },
];

/**
 * טאבי הניווט העליונים — קומפוננטת קליינט (בניגוד לשאר ה-layout, שהוא Server
 * Component) כי צריך את הנתיב הנוכחי (usePathname) כדי לסמן איזה טאב פעיל.
 * "הגדרות" מסומן בנפרד באייקון גלגל-שיניים, לא כטאב טקסט רגיל.
 */
export default function NavTabs() {
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/settings");

  return (
    <div className="flex items-center gap-1.5 text-sm font-medium">
      {TABS.map((tab) => {
        const active = tab.isActive(pathname);
        const isCta = tab.href === "/posts/new";
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              isCta
                ? active
                  ? "bg-brand-red-dark text-white"
                  : "bg-brand-red text-white hover:bg-brand-red-dark"
                : active
                  ? "bg-brand-pink/30 text-brand-maroon"
                  : "text-brand-maroon/60 hover:text-brand-maroon hover:bg-brand-pink/10"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
      <Link
        href="/settings"
        title="הגדרות"
        aria-label="הגדרות"
        className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition-colors ${
          settingsActive ? "bg-brand-pink/30 text-brand-maroon" : "text-brand-maroon/60 hover:text-brand-maroon hover:bg-brand-pink/10"
        }`}
      >
        ⚙️
      </Link>
    </div>
  );
}
