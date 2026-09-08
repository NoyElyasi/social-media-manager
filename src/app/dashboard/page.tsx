import { prisma } from "@/server/db";
import { PLATFORM_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  postId: string;
  type: "instagram_carousel" | "instagram_reel";
  createdAt: Date;
  wordCount: number;
  pageCount: number | null; // רק לקרוסלה — לא כולל עמוד שער
  durationSeconds: number | null; // רק לריל
  hasCover: boolean;
  hasBackground: boolean;
  likesCount: number | null;
  commentsCount: number | null;
  viewsCount: number | null;
  avgWatchSeconds: number | null;
  followersReachPercent: number | null;
}

function avg(nums: (number | null)[]): number | null {
  const values = nums.filter((n): n is number => n !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function fmt(n: number | null, digits = 1): string {
  return n === null ? "—" : n.toFixed(digits).replace(/\.0$/, "");
}

/** משווה שני קבוצות לפי מדד — לא מציג כלום אם אין מספיק נתונים בשתי הקבוצות. */
function Comparison({
  title,
  labelA,
  groupA,
  labelB,
  groupB,
  metric,
  metricLabel,
  unit,
  minPerGroup = 2,
}: {
  title: string;
  labelA: string;
  groupA: Row[];
  labelB: string;
  groupB: Row[];
  metric: keyof Row;
  metricLabel: string;
  unit?: string;
  minPerGroup?: number;
}) {
  const valuesA = groupA.map((r) => r[metric] as number | null);
  const valuesB = groupB.map((r) => r[metric] as number | null);
  const filledA = valuesA.filter((v) => v !== null).length;
  const filledB = valuesB.filter((v) => v !== null).length;

  if (filledA < minPerGroup || filledB < minPerGroup) {
    return (
      <div className="rounded-lg border border-brand-pink/30 bg-white p-4 text-sm text-brand-maroon/50">
        <p className="font-medium text-brand-maroon">{title}</p>
        <p className="mt-1">
          אין עדיין מספיק נתונים להשוואה הזו (צריך לפחות {minPerGroup} פוסטים עם &quot;{metricLabel}&quot; מוזן בכל
          קבוצה — יש כרגע {filledA} ב&quot;{labelA}&quot; ו-{filledB} ב&quot;{labelB}&quot;). הזיני נתוני ביצועים
          בכרטיסי הפוסטים כדי שההשוואה תתמלא.
        </p>
      </div>
    );
  }

  const avgA = avg(valuesA);
  const avgB = avg(valuesB);
  const winner = avgA !== null && avgB !== null ? (avgA >= avgB ? labelA : labelB) : null;

  return (
    <div className="rounded-lg border border-brand-pink/30 bg-white p-4 text-sm">
      <p className="font-medium text-brand-maroon">{title}</p>
      <p className="mt-1 text-brand-maroon/70">
        {labelA}: {fmt(avgA)}
        {unit} ({filledA} פוסטים) לעומת {labelB}: {fmt(avgB)}
        {unit} ({filledB} פוסטים).
        {winner && (
          <>
            {" "}
            <span className="font-medium text-brand-red">בממוצע, {winner} מוביל ב{metricLabel}.</span>
          </>
        )}
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  const contents = await prisma.platformContent.findMany({
    where: { type: { in: ["instagram_carousel", "instagram_reel"] } },
    include: { post: true },
    orderBy: { createdAt: "desc" },
  });

  const rows: Row[] = contents.map((pc) => {
    const files: string[] = JSON.parse(pc.files || "[]");
    const wordCount = pc.post.rawText.split(/\s+/).filter(Boolean).length;
    const hasCover = !!pc.coverImagePath;
    const pageCount = pc.type === "instagram_carousel" ? files.length - (hasCover ? 1 : 0) : null;

    return {
      id: pc.id,
      postId: pc.postId,
      type: pc.type as "instagram_carousel" | "instagram_reel",
      createdAt: pc.createdAt,
      wordCount,
      pageCount,
      durationSeconds: pc.durationSeconds,
      hasCover,
      hasBackground: !!pc.backgroundImagePath,
      likesCount: pc.likesCount,
      commentsCount: pc.commentsCount,
      viewsCount: pc.viewsCount,
      avgWatchSeconds: pc.avgWatchSeconds,
      followersReachPercent: pc.followersReachPercent,
    };
  });

  const reels = rows.filter((r) => r.type === "instagram_reel");
  const carousels = rows.filter((r) => r.type === "instagram_carousel");

  const withAnyMetric = (r: Row) => r.likesCount !== null || r.commentsCount !== null || r.viewsCount !== null;
  const totalWithMetrics = rows.filter(withAnyMetric).length;

  const REEL_LENGTH_THRESHOLD = 25;
  const CAROUSEL_PAGE_THRESHOLD = 4;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-maroon">דשבורד אנליטיקס</h1>

      <p className="text-sm text-brand-maroon/60">
        כל ההשוואות וההמלצות כאן מבוססות רק על נתונים שהזנת בעצמך בכרטיסי הפוסטים (בעמוד של כל פוסט) — אין חיבור
        API למטא. {totalWithMetrics} מתוך {rows.length} פוסטים כוללים נתוני ביצועים כלשהם.
      </p>

      {rows.length === 0 && (
        <p className="rounded-lg border border-brand-pink/30 bg-white p-6 text-center text-brand-maroon/50">
          אין עדיין פוסטי קרוסלה/ריל שנוצרו.
        </p>
      )}

      {reels.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">ריל</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Comparison
              title={`אורך: עד ${REEL_LENGTH_THRESHOLD} שניות לעומת יותר`}
              labelA={`עד ${REEL_LENGTH_THRESHOLD}s`}
              groupA={reels.filter((r) => (r.durationSeconds ?? 0) <= REEL_LENGTH_THRESHOLD)}
              labelB={`מעל ${REEL_LENGTH_THRESHOLD}s`}
              groupB={reels.filter((r) => (r.durationSeconds ?? 0) > REEL_LENGTH_THRESHOLD)}
              metric="likesCount"
              metricLabel="לייקים"
            />
            <Comparison
              title={`אורך הריל וזמן צפייה ממוצע`}
              labelA={`עד ${REEL_LENGTH_THRESHOLD}s`}
              groupA={reels.filter((r) => (r.durationSeconds ?? 0) <= REEL_LENGTH_THRESHOLD)}
              labelB={`מעל ${REEL_LENGTH_THRESHOLD}s`}
              groupB={reels.filter((r) => (r.durationSeconds ?? 0) > REEL_LENGTH_THRESHOLD)}
              metric="avgWatchSeconds"
              metricLabel="שניות צפייה ממוצעות"
              unit="s"
            />
            <Comparison
              title="רקע מותאם לעומת בלי תבנית"
              labelA="עם רקע מותאם"
              groupA={reels.filter((r) => r.hasBackground)}
              labelB="בלי תבנית"
              groupB={reels.filter((r) => !r.hasBackground)}
              metric="commentsCount"
              metricLabel="תגובות"
            />
            <Comparison
              title="אחוז עוקבים מהצופים — ריל קצר לעומת ארוך"
              labelA={`עד ${REEL_LENGTH_THRESHOLD}s`}
              groupA={reels.filter((r) => (r.durationSeconds ?? 0) <= REEL_LENGTH_THRESHOLD)}
              labelB={`מעל ${REEL_LENGTH_THRESHOLD}s`}
              groupB={reels.filter((r) => (r.durationSeconds ?? 0) > REEL_LENGTH_THRESHOLD)}
              metric="followersReachPercent"
              metricLabel="אחוז עוקבים"
              unit="%"
            />
          </div>
        </div>
      )}

      {carousels.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">קרוסלה</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Comparison
              title={`אורך: עד ${CAROUSEL_PAGE_THRESHOLD} עמודים לעומת יותר`}
              labelA={`עד ${CAROUSEL_PAGE_THRESHOLD} עמודים`}
              groupA={carousels.filter((r) => (r.pageCount ?? 0) <= CAROUSEL_PAGE_THRESHOLD)}
              labelB={`מעל ${CAROUSEL_PAGE_THRESHOLD} עמודים`}
              groupB={carousels.filter((r) => (r.pageCount ?? 0) > CAROUSEL_PAGE_THRESHOLD)}
              metric="likesCount"
              metricLabel="לייקים"
            />
            <Comparison
              title="עמוד שער לעומת בלי עמוד שער"
              labelA="עם עמוד שער"
              groupA={carousels.filter((r) => r.hasCover)}
              labelB="בלי עמוד שער"
              groupB={carousels.filter((r) => !r.hasCover)}
              metric="commentsCount"
              metricLabel="תגובות"
            />
            <Comparison
              title="רקע מותאם לעומת רקע לבן"
              labelA="עם רקע מותאם"
              groupA={carousels.filter((r) => r.hasBackground)}
              labelB="רקע לבן"
              groupB={carousels.filter((r) => !r.hasBackground)}
              metric="likesCount"
              metricLabel="לייקים"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">כל הפוסטים</h2>
        <div className="overflow-x-auto rounded-lg border border-brand-pink/30 bg-white">
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="border-b border-brand-pink/30 bg-brand-pink/10">
                <th className="p-2">תאריך</th>
                <th className="p-2">סוג</th>
                <th className="p-2">אורך</th>
                <th className="p-2">לייקים</th>
                <th className="p-2">תגובות</th>
                <th className="p-2">צפיות/הגעה</th>
                <th className="p-2">זמן צפייה</th>
                <th className="p-2">% עוקבים</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-brand-pink/10">
                  <td className="p-2 whitespace-nowrap">{row.createdAt.toLocaleDateString("he-IL")}</td>
                  <td className="p-2 whitespace-nowrap">{PLATFORM_LABELS[row.type]}</td>
                  <td className="p-2">
                    {row.type === "instagram_reel"
                      ? row.durationSeconds !== null
                        ? `${fmt(row.durationSeconds)}s`
                        : "—"
                      : `${row.pageCount} עמ׳`}
                  </td>
                  <td className="p-2">{row.likesCount ?? "—"}</td>
                  <td className="p-2">{row.commentsCount ?? "—"}</td>
                  <td className="p-2">{row.viewsCount ?? "—"}</td>
                  <td className="p-2">{row.type === "instagram_reel" ? fmt(row.avgWatchSeconds) : "—"}</td>
                  <td className="p-2">{row.followersReachPercent !== null ? `${fmt(row.followersReachPercent)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
