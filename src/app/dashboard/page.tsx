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
  revealMode: "word" | "letter" | null; // רק לריל
  likesCount: number | null;
  commentsCount: number | null;
  viewsCount: number | null;
  avgWatchSeconds: number | null;
  followersReachPercent: number | null;
}

const REEL_LENGTH_THRESHOLD = 25;
const CAROUSEL_PAGE_THRESHOLD = 4;
// הפרש ממוצע יחסי מעל הסף הזה נחשב "משמעותי" לצורך המלצה (לא רק הבדל רעש אקראי).
const MEANINGFUL_DIFF = 0.15;

function avg(nums: (number | null)[]): number | null {
  const values = nums.filter((n): n is number => n !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function fmt(n: number | null, digits = 1): string {
  return n === null ? "—" : n.toFixed(digits).replace(/\.0$/, "");
}

interface DimensionSpec {
  scope: "reel" | "carousel";
  title: string;
  labelA: string;
  predicateA: (r: Row) => boolean;
  labelB: string;
  predicateB: (r: Row) => boolean;
  metric: keyof Row;
  metricLabel: string;
  unit?: string;
  minPerGroup?: number;
  actionIfAWins: string;
  actionIfBWins: string;
}

const DIMENSION_SPECS: DimensionSpec[] = [
  {
    scope: "reel",
    title: `אורך: עד ${REEL_LENGTH_THRESHOLD} שניות לעומת יותר`,
    labelA: `עד ${REEL_LENGTH_THRESHOLD}s`,
    predicateA: (r) => (r.durationSeconds ?? 0) <= REEL_LENGTH_THRESHOLD,
    labelB: `מעל ${REEL_LENGTH_THRESHOLD}s`,
    predicateB: (r) => (r.durationSeconds ?? 0) > REEL_LENGTH_THRESHOLD,
    metric: "likesCount",
    metricLabel: "לייקים",
    actionIfAWins: `להמשיך לעשות רילים קצרים (עד ${REEL_LENGTH_THRESHOLD} שניות)`,
    actionIfBWins: `להמשיך לעשות רילים ארוכים יותר (מעל ${REEL_LENGTH_THRESHOLD} שניות)`,
  },
  {
    scope: "reel",
    title: "אורך הריל וזמן צפייה ממוצע",
    labelA: `עד ${REEL_LENGTH_THRESHOLD}s`,
    predicateA: (r) => (r.durationSeconds ?? 0) <= REEL_LENGTH_THRESHOLD,
    labelB: `מעל ${REEL_LENGTH_THRESHOLD}s`,
    predicateB: (r) => (r.durationSeconds ?? 0) > REEL_LENGTH_THRESHOLD,
    metric: "avgWatchSeconds",
    metricLabel: "שניות צפייה ממוצעות",
    unit: "s",
    actionIfAWins: `להמשיך לעשות רילים קצרים (עד ${REEL_LENGTH_THRESHOLD} שניות) — שומרים על צפייה יותר מלאה`,
    actionIfBWins: "רילים ארוכים יותר לא פוגעים בזמן הצפייה שלך — אפשר להמשיך גם איתם",
  },
  {
    scope: "reel",
    title: "רקע מותאם לעומת בלי תבנית",
    labelA: "עם רקע מותאם",
    predicateA: (r) => r.hasBackground,
    labelB: "בלי תבנית",
    predicateB: (r) => !r.hasBackground,
    metric: "commentsCount",
    metricLabel: "תגובות",
    actionIfAWins: "להמשיך להשתמש בתבנית רקע מותאמת בריל",
    actionIfBWins: "רקע אוטומטי (בלי תבנית) עובד טוב יותר עבורך בריל",
  },
  {
    scope: "reel",
    title: "אחוז עוקבים מהצופים — ריל קצר לעומת ארוך",
    labelA: `עד ${REEL_LENGTH_THRESHOLD}s`,
    predicateA: (r) => (r.durationSeconds ?? 0) <= REEL_LENGTH_THRESHOLD,
    labelB: `מעל ${REEL_LENGTH_THRESHOLD}s`,
    predicateB: (r) => (r.durationSeconds ?? 0) > REEL_LENGTH_THRESHOLD,
    metric: "followersReachPercent",
    metricLabel: "אחוז עוקבים",
    unit: "%",
    actionIfAWins: "רילים קצרים מגיעים ליותר קהל שאינו עוקב עדיין — שווה להמשיך איתם לצמיחה",
    actionIfBWins: "רילים ארוכים מגיעים ליותר קהל שאינו עוקב עדיין — שווה להמשיך איתם לצמיחה",
  },
  {
    scope: "carousel",
    title: `אורך: עד ${CAROUSEL_PAGE_THRESHOLD} עמודים לעומת יותר`,
    labelA: `עד ${CAROUSEL_PAGE_THRESHOLD} עמודים`,
    predicateA: (r) => (r.pageCount ?? 0) <= CAROUSEL_PAGE_THRESHOLD,
    labelB: `מעל ${CAROUSEL_PAGE_THRESHOLD} עמודים`,
    predicateB: (r) => (r.pageCount ?? 0) > CAROUSEL_PAGE_THRESHOLD,
    metric: "likesCount",
    metricLabel: "לייקים",
    actionIfAWins: `להמשיך לעשות קרוסלות קצרות (עד ${CAROUSEL_PAGE_THRESHOLD} עמודים)`,
    actionIfBWins: `להמשיך לעשות קרוסלות ארוכות יותר (מעל ${CAROUSEL_PAGE_THRESHOLD} עמודים)`,
  },
  {
    scope: "carousel",
    title: "עמוד שער לעומת בלי עמוד שער",
    labelA: "עם עמוד שער",
    predicateA: (r) => r.hasCover,
    labelB: "בלי עמוד שער",
    predicateB: (r) => !r.hasCover,
    metric: "commentsCount",
    metricLabel: "תגובות",
    actionIfAWins: "להמשיך להוסיף עמוד שער לקרוסלות",
    actionIfBWins: "עמוד שער לא עוזר עבורך — אפשר לדלג עליו",
  },
  {
    scope: "carousel",
    title: "רקע מותאם לעומת רקע לבן",
    labelA: "עם רקע מותאם",
    predicateA: (r) => r.hasBackground,
    labelB: "רקע לבן",
    predicateB: (r) => !r.hasBackground,
    metric: "likesCount",
    metricLabel: "לייקים",
    actionIfAWins: "להמשיך להשתמש ברקע מותאם בקרוסלה",
    actionIfBWins: "רקע לבן עובד טוב יותר עבורך בקרוסלה",
  },
];

interface ComparisonResult {
  filledA: number;
  filledB: number;
  hasEnoughData: boolean;
  avgA: number | null;
  avgB: number | null;
  relDiff: number | null;
  aWins: boolean | null;
}

function computeComparison(groupA: Row[], groupB: Row[], metric: keyof Row, minPerGroup: number): ComparisonResult {
  const valuesA = groupA.map((r) => r[metric] as number | null);
  const valuesB = groupB.map((r) => r[metric] as number | null);
  const filledA = valuesA.filter((v) => v !== null).length;
  const filledB = valuesB.filter((v) => v !== null).length;
  const avgA = avg(valuesA);
  const avgB = avg(valuesB);
  const maxAbs = avgA !== null && avgB !== null ? Math.max(Math.abs(avgA), Math.abs(avgB)) : null;
  const relDiff = avgA !== null && avgB !== null && maxAbs ? Math.abs(avgA - avgB) / maxAbs : null;
  const aWins = avgA !== null && avgB !== null ? avgA >= avgB : null;
  return { filledA, filledB, hasEnoughData: filledA >= minPerGroup && filledB >= minPerGroup, avgA, avgB, relDiff, aWins };
}

function ComparisonCard({ spec, rows }: { spec: DimensionSpec; rows: Row[] }) {
  const minPerGroup = spec.minPerGroup ?? 2;
  const groupA = rows.filter(spec.predicateA);
  const groupB = rows.filter(spec.predicateB);
  const result = computeComparison(groupA, groupB, spec.metric, minPerGroup);

  if (!result.hasEnoughData) {
    return (
      <div className="rounded-lg border border-brand-pink/30 bg-white p-4 text-sm text-brand-maroon/50">
        <p className="font-medium text-brand-maroon">{spec.title}</p>
        <p className="mt-1">
          אין עדיין מספיק נתונים להשוואה הזו (צריך לפחות {minPerGroup} פוסטים עם &quot;{spec.metricLabel}&quot; מוזן
          בכל קבוצה — יש כרגע {result.filledA} ב&quot;{spec.labelA}&quot; ו-{result.filledB} ב&quot;{spec.labelB}
          &quot;). הזיני נתוני ביצועים בכרטיסי הפוסטים כדי שההשוואה תתמלא.
        </p>
      </div>
    );
  }

  const winnerLabel = result.aWins ? spec.labelA : spec.labelB;

  return (
    <div className="rounded-lg border border-brand-pink/30 bg-white p-4 text-sm">
      <p className="font-medium text-brand-maroon">{spec.title}</p>
      <p className="mt-1 text-brand-maroon/70">
        {spec.labelA}: {fmt(result.avgA)}
        {spec.unit ?? ""} ({result.filledA} פוסטים) לעומת {spec.labelB}: {fmt(result.avgB)}
        {spec.unit ?? ""} ({result.filledB} פוסטים).{" "}
        <span className="font-medium text-brand-red">בממוצע, {winnerLabel} מוביל ב{spec.metricLabel}.</span>
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
      revealMode: pc.type === "instagram_reel" ? (pc.post.revealMode as "word" | "letter") : null,
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

  // המלצות להמשך: רק מבין ההשוואות שיש בהן מספיק נתונים *וגם* הפרש משמעותי
  // (לא רעש אקראי) — כל אחת מלווה במספרים האמיתיים שהובילו אליה.
  const recommendations = DIMENSION_SPECS.map((spec) => {
    const scopedRows = spec.scope === "reel" ? reels : carousels;
    const groupA = scopedRows.filter(spec.predicateA);
    const groupB = scopedRows.filter(spec.predicateB);
    const result = computeComparison(groupA, groupB, spec.metric, spec.minPerGroup ?? 2);
    return { spec, result };
  }).filter(({ result }) => result.hasEnoughData && (result.relDiff ?? 0) >= MEANINGFUL_DIFF);

  // הצעות לטסטים: השוואות שעדיין אין בהן מספיק נתונים (כולל מקרים שבהם קבוצה
  // שלמה עדיין לא נוסתה בכלל — filled=0), פלוס בדיקת "לא ניסית את זה עדיין".
  const untestedComparisons = DIMENSION_SPECS.map((spec) => {
    const scopedRows = spec.scope === "reel" ? reels : carousels;
    const groupA = scopedRows.filter(spec.predicateA);
    const groupB = scopedRows.filter(spec.predicateB);
    const result = computeComparison(groupA, groupB, spec.metric, spec.minPerGroup ?? 2);
    return { spec, result };
  }).filter(({ result }) => !result.hasEnoughData);

  const reelRevealModes = new Set(reels.map((r) => r.revealMode).filter(Boolean));
  const revealModeUntried =
    reels.length >= 2 && reelRevealModes.size === 1
      ? (reelRevealModes.has("word") ? "letter" : "word")
      : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-maroon">דשבורד אנליטיקס</h1>

      <p className="text-sm text-brand-maroon/60">
        כל ההשוואות, ההמלצות והצעות הטסטים כאן מבוססות רק על נתונים שהזנת בעצמך בכרטיסי הפוסטים (בעמוד של כל פוסט)
        — אין חיבור API למטא, אין משיכה אוטומטית מהחשבונות שלך. {totalWithMetrics} מתוך {rows.length} פוסטים כוללים
        נתוני ביצועים כלשהם.
      </p>

      {rows.length === 0 && (
        <p className="rounded-lg border border-brand-pink/30 bg-white p-6 text-center text-brand-maroon/50">
          אין עדיין פוסטי קרוסלה/ריל שנוצרו.
        </p>
      )}

      {/* המלצות להמשך פרסום */}
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">המלצות להמשך</h2>
        {recommendations.length === 0 ? (
          <p className="rounded-lg border border-brand-pink/30 bg-white p-4 text-sm text-brand-maroon/50">
            אין עדיין מספיק נתונים כדי לתת המלצת תוכן מבוססת-נתונים. הזיני נתוני ביצועים (לייקים/תגובות/צפיות) לכמה
            פוסטים בכרטיסים שלהם, ותוך כמה פוסטים אמליץ לך בהתאם למה שבאמת עובד אצלך.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recommendations.map(({ spec, result }) => (
              <div key={spec.title} className="rounded-lg border border-brand-pink/40 bg-brand-pink/10 p-4 text-sm">
                <p className="font-medium text-brand-red">
                  🎯 {result.aWins ? spec.actionIfAWins : spec.actionIfBWins}
                </p>
                <p className="mt-1 text-brand-maroon/70">
                  מבוסס על {result.filledA + result.filledB} פוסטים: {spec.labelA} — {fmt(result.avgA)}
                  {spec.unit ?? ""} {spec.metricLabel} בממוצע, {spec.labelB} — {fmt(result.avgB)}
                  {spec.unit ?? ""} בממוצע.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* הצעות לטסטים */}
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">הצעות לטסטים</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {revealModeUntried && (
            <div className="rounded-lg border border-brand-pink/40 bg-brand-pink/10 p-4 text-sm">
              <p className="font-medium text-brand-red">
                🧪 עוד לא ניסית אנימציית &quot;{revealModeUntried === "letter" ? "אות-אות" : "מילה-מילה"}&quot; בריל
              </p>
              <p className="mt-1 text-brand-maroon/70">
                כל {reels.length} הרילים שלך עד כה השתמשו רק ב&quot;{reelRevealModes.has("word") ? "מילה-מילה" : "אות-אות"}
                &quot; — שווה לנסות את האחר בפוסט הבא ולהשוות זמן צפייה/תגובות.
              </p>
            </div>
          )}
          {untestedComparisons.map(({ spec, result }) => (
            <div key={spec.title} className="rounded-lg border border-brand-pink/40 bg-brand-pink/10 p-4 text-sm">
              <p className="font-medium text-brand-red">🧪 {spec.title}</p>
              <p className="mt-1 text-brand-maroon/70">
                {result.filledA === 0 && result.filledB === 0
                  ? `עדיין לא הוזנו נתוני "${spec.metricLabel}" לאף פוסט מהסוג הזה.`
                  : result.filledA < (spec.minPerGroup ?? 2)
                  ? `יש רק ${result.filledA} פוסטים עם נתונים ב"${spec.labelA}" (צריך לפחות ${spec.minPerGroup ?? 2}).`
                  : `יש רק ${result.filledB} פוסטים עם נתונים ב"${spec.labelB}" (צריך לפחות ${spec.minPerGroup ?? 2}).`}{" "}
                הזיני עוד נתוני &quot;{spec.metricLabel}&quot; כדי לבדוק אם יש כאן דפוס.
              </p>
            </div>
          ))}
          {!revealModeUntried && untestedComparisons.length === 0 && (
            <p className="rounded-lg border border-brand-pink/30 bg-white p-4 text-sm text-brand-maroon/50 sm:col-span-2">
              כרגע אין הצעת טסט חדשה — כל הממדים שאני עוקבת אחריהם כוללים מספיק נתונים.
            </p>
          )}
        </div>
      </div>

      {reels.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">ריל</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {DIMENSION_SPECS.filter((s) => s.scope === "reel").map((spec) => (
              <ComparisonCard key={spec.title} spec={spec} rows={reels} />
            ))}
          </div>
        </div>
      )}

      {carousels.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">קרוסלה</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {DIMENSION_SPECS.filter((s) => s.scope === "carousel").map((spec) => (
              <ComparisonCard key={spec.title} spec={spec} rows={carousels} />
            ))}
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
