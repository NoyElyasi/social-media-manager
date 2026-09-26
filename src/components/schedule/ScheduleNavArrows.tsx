import Link from "next/link";

/** חץ ‹/› כאייקון (לא טקסט) — פשוט, בלי תלות בספריית אייקונים. */
function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

/**
 * חצי ניווט קבועים בצדי המסך (לא כפתורי טקסט) — לחודש/שבוע קודם ובא. "הבא"
 * (קדימה בזמן) יושב בצד שמאל, "קודם" בצד ימין — כמו בכיוון הקריאה RTL, ותואם
 * את הסדר שהיה קודם בטקסט (קודם→ימין, הבא→שמאל). לפי בקשה מפורשת: בצד,
 * ציור של חץ, לא מלל.
 */
export default function ScheduleNavArrows({ prevHref, nextHref, prevLabel, nextLabel }: { prevHref: string; nextHref: string; prevLabel: string; nextLabel: string }) {
  return (
    <>
      <Link
        href={nextHref}
        aria-label={nextLabel}
        title={nextLabel}
        className="fixed left-2 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-brand-pink/40 bg-white text-brand-maroon shadow-md hover:bg-brand-pink/10"
      >
        <ChevronIcon direction="left" />
      </Link>
      <Link
        href={prevHref}
        aria-label={prevLabel}
        title={prevLabel}
        className="fixed right-2 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-brand-pink/40 bg-white text-brand-maroon shadow-md hover:bg-brand-pink/10"
      >
        <ChevronIcon direction="right" />
      </Link>
    </>
  );
}
