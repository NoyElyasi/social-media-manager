"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** מחלקות אחידות למחוון "טאב פעיל" — אותו טיפול בדיוק לכל פריט ניווט (טאבים ואייקונים), כדי שלא תהיה אי-עקביות בין חלק שמסומן וחלק שרק "כהה קצת". */
function navItemClass(active: boolean): string {
  return active
    ? "bg-brand-pink/30 text-brand-maroon"
    : "text-brand-maroon/60 hover:text-brand-maroon hover:bg-brand-pink/10";
}

const MAIN_TABS: { href: string; label: string; isActive: (pathname: string) => boolean }[] = [
  { href: "/", label: "פוסטים קודמים", isActive: (p) => p === "/" || (p.startsWith("/posts") && p !== "/posts/new") },
  { href: "/dashboard", label: "דשבורד", isActive: (p) => p.startsWith("/dashboard") },
  { href: "/schedule", label: "תכנון חודשי", isActive: (p) => p.startsWith("/schedule") },
];

/** הטאבים הראשיים — ליד הלוגו, לא ממורכזים בנפרד (בהתאם לסגנון ניווט רגיל של אתרים/כלים). */
export function MainNavTabs() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium">
      {MAIN_TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={`rounded-full px-3 py-1.5 transition-colors ${navItemClass(tab.isActive(pathname))}`}>
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

/** אייקוני הפעולה/כלים בקצה השני של הסרגל — פוסט חדש (+) והגדרות (⚙), עם אותו מחוון "פעיל" בדיוק כמו הטאבים הראשיים. */
export function NavActionIcons() {
  const pathname = usePathname();
  const newPostActive = pathname === "/posts/new";
  const settingsActive = pathname.startsWith("/settings");

  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/posts/new"
        title="פוסט חדש"
        aria-label="פוסט חדש"
        className={`flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none transition-colors ${navItemClass(newPostActive)}`}
      >
        +
      </Link>
      <Link
        href="/settings"
        title="הגדרות"
        aria-label="הגדרות"
        className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition-colors ${navItemClass(settingsActive)}`}
      >
        ⚙️
      </Link>
    </div>
  );
}
