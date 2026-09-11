import Link from "next/link";
import { prisma } from "@/server/db";
import { getProfileSettings } from "@/server/settings/profile";
import { BarComparisonCard, ChartScrollRow, GroupedBarCard, LineTrendCard, PieBreakdownCard, type BarDatum } from "@/components/dashboard/ChartCard";
import RecommendationCard, { type RecommendationBreakdownRow } from "@/components/dashboard/RecommendationCard";
import InstagramMediaLabelEditor from "@/components/InstagramMediaLabelEditor";

export const dynamic = "force-dynamic";

// כל הנתונים כאן מגיעים מה-cache המקומי של Instagram Graph API (InstagramMedia)
// — שנסונכרן ידנית מההגדרות ("סנכרון הדשבורד"). אין תלות בתוכן שנוצר בכלי
// הזה, מלבד אורך הריל (durationSeconds) — שדה אופציונלי שממולא רק אם הפוסט
// קושר לתוכן שנוצר בכלי, כי ה-API לא חושף אורך וידאו בעצמו.
interface Row {
  id: string;
  mediaType: string; // IMAGE / VIDEO / CAROUSEL_ALBUM
  isReel: boolean;
  timestamp: Date;
  dayOfWeek: number; // 0=ראשון..6=שבת, לפי שעון ישראל
  hour: number; // 0-23, לפי שעון ישראל
  hashtagCount: number;
  likesCount: number | null;
  commentsCount: number | null;
  viewsCount: number | null; // סך צפיות (יכול לכלול צפיות חוזרות)
  reachCount: number | null; // חשבונות ייחודיים שנחשפו
  savedCount: number | null;
  sharesCount: number | null;
  // "שמירות"+"שיתופים" — סימני חיבוב אלגוריתם, לפי מטא, חזקים משמעותית
  // מלייקים. null אם לא הצלחנו לשלוף אף אחד מהשניים (לא 0 מזויף).
  algorithmSignal: number | null;
  engagementRate: number | null; // לייקים ל-100 חשבונות שנחשפו — "יעילות המרה", לא מוטה ע"י הגעה
  avgWatchSeconds: number | null;
  durationSeconds: number | null;
  aiTheme: string | null; // תיוג AI — אופציונלי, רק לפוסטים שנוצרו בכלי וסווגו
  aiFormat: string | null; // "letter" | "regular"
  aiTone: string | null; // "realistic" | "absurd"
  caption: string | null;
  permalink: string;
  thumbnailUrl: string | null;
}

const REEL_LENGTH_THRESHOLD = 25;
const MEANINGFUL_DIFF = 0.15;
const MIN_PER_GROUP = 2;
const FREQUENT_GAP_DAYS = 2; // פער בין פוסטים עד כמה ימים נחשב "פרסום תדיר"
const WEEKDAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const WEEKDAY_FULL_LABELS = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];

function israelDayAndHour(date: Date): { dayOfWeek: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  return { dayOfWeek: weekdayMap[weekdayPart] ?? 0, hour: Number(hourPart) % 24 };
}

function avg(nums: (number | null)[]): number | null {
  const values = nums.filter((n): n is number => n !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function fmt(n: number | null, digits = 1): string {
  return n === null ? "—" : n.toFixed(digits).replace(/\.0$/, "");
}

/** בונה לינק לגלריה שמשמר את הפילטרים/מיון הקיימים, עם עדכון של אלה שמועברים ב-overrides. */
function buildGalleryHref(params: { theme?: string; format?: string; sort?: string }): string {
  const qs = new URLSearchParams();
  if (params.theme) qs.set("theme", params.theme);
  if (params.format) qs.set("format", params.format);
  if (params.sort) qs.set("sort", params.sort);
  const query = qs.toString();
  return `/dashboard${query ? `?${query}` : ""}#gallery`;
}

/** משווה שתי קבוצות במדד נתון; מחזירה null אם אין מספיק נתונים בכל קבוצה. */
function twoGroupBarData(
  groupA: Row[],
  labelA: string,
  groupB: Row[],
  labelB: string,
  metric: keyof Row,
  minPerGroup = MIN_PER_GROUP
): BarDatum[] | null {
  const valuesA = groupA.map((r) => r[metric] as number | null);
  const valuesB = groupB.map((r) => r[metric] as number | null);
  const filledA = valuesA.filter((v) => v !== null).length;
  const filledB = valuesB.filter((v) => v !== null).length;
  if (filledA < minPerGroup || filledB < minPerGroup) return null;
  return [
    { name: labelA, value: avg(valuesA) ?? 0, count: filledA },
    { name: labelB, value: avg(valuesB) ?? 0, count: filledB },
  ];
}

/** בונה נתוני בר-צ׳ארט לפי דלי (bucket) — מדלג על דליים ריקים, ומחזירה null אם אין מספיק פילוח כולל. */
function bucketBarData(
  buckets: { name: string; rows: Row[] }[],
  metric: keyof Row,
  minBucketsWithData = 2,
  minPerGroup = MIN_PER_GROUP
): BarDatum[] | null {
  const data = buckets
    .map((b) => {
      const values = b.rows.map((r) => r[metric] as number | null);
      const filled = values.filter((v) => v !== null).length;
      return { name: b.name, value: avg(values) ?? 0, count: filled };
    })
    .filter((b) => b.count > 0);
  const enoughBuckets = data.filter((b) => b.count >= minPerGroup).length;
  return data.length >= minBucketsWithData && enoughBuckets >= 2 ? data : null;
}

interface Recommendation {
  title: string;
  action: string;
  detail: string;
  breakdown: RecommendationBreakdownRow[];
  unit?: string;
  priority?: boolean; // המלצות "הכי חשובות" (יום/שעה/תדירות) — מוצגות ראשונות
}

function buildRecommendation(
  title: string,
  groupA: Row[],
  labelA: string,
  actionIfA: string,
  groupB: Row[],
  labelB: string,
  actionIfB: string,
  metric: keyof Row,
  metricLabel: string,
  unit = "",
  priority = false
): Recommendation | null {
  const valuesA = groupA.map((r) => r[metric] as number | null);
  const valuesB = groupB.map((r) => r[metric] as number | null);
  const filledA = valuesA.filter((v) => v !== null).length;
  const filledB = valuesB.filter((v) => v !== null).length;
  if (filledA < MIN_PER_GROUP || filledB < MIN_PER_GROUP) return null;
  const avgA = avg(valuesA);
  const avgB = avg(valuesB);
  if (avgA === null || avgB === null) return null;
  const maxAbs = Math.max(Math.abs(avgA), Math.abs(avgB));
  const relDiff = maxAbs ? Math.abs(avgA - avgB) / maxAbs : 0;
  if (relDiff < MEANINGFUL_DIFF) return null;
  const aWins = avgA >= avgB;
  return {
    title,
    action: aWins ? actionIfA : actionIfB,
    detail: `${labelA}: ${fmt(avgA)}${unit} ${metricLabel} בממוצע (${filledA} פוסטים) · ${labelB}: ${fmt(avgB)}${unit} (${filledB} פוסטים)`,
    breakdown: [
      { label: labelA, value: avgA, count: filledA },
      { label: labelB, value: avgB, count: filledB },
    ],
    unit,
    priority,
  };
}

/** מוצאת את הדלי (יום/שעה) המוביל מבין כמה דליים, אם ההבדל משמעותי מספיק לעומת השאר. */
function buildBestBucketRecommendation(
  title: string,
  buckets: { name: string; rows: Row[] }[],
  metric: keyof Row,
  metricLabel: string,
  actionTemplate: (bestLabel: string) => string,
  unit = ""
): Recommendation | null {
  const stats = buckets
    .map((b) => {
      const values = b.rows.map((r) => r[metric] as number | null);
      const filled = values.filter((v) => v !== null).length;
      return { label: b.name, value: avg(values), count: filled };
    })
    .filter((s): s is { label: string; value: number; count: number } => s.value !== null && s.count >= MIN_PER_GROUP);

  if (stats.length < 2) return null;

  const sorted = [...stats].sort((a, b) => b.value - a.value);
  const best = sorted[0];
  const others = stats.filter((s) => s.label !== best.label);
  const othersAvg = avg(others.map((o) => o.value));
  if (othersAvg === null) return null;
  const maxAbs = Math.max(Math.abs(best.value), Math.abs(othersAvg));
  const relDiff = maxAbs ? Math.abs(best.value - othersAvg) / maxAbs : 0;
  if (relDiff < MEANINGFUL_DIFF) return null;

  return {
    title,
    action: actionTemplate(best.label),
    detail: `${fmt(best.value)}${unit} ${metricLabel} בממוצע ב${best.label} (${best.count} פוסטים) לעומת ${fmt(othersAvg)}${unit} בממוצע בשאר`,
    breakdown: stats.map((s) => ({ label: s.label, value: s.value, count: s.count })),
    unit,
    priority: true,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; format?: string; sort?: string }>;
}) {
  const { theme: filterTheme, format: filterFormat, sort: sortBy } = await searchParams;
  const media = await prisma.instagramMedia.findMany({ orderBy: { timestamp: "asc" } });
  const profile = await getProfileSettings();
  const aiThemeOptions: string[] = JSON.parse(profile.aiThemeOptions || "[]");

  // דמוגרפיית עוקבים — תמונת מצב עדכנית (לא היסטוריה), נשלפת עם סנכרון הדשבורד.
  const GENDER_LABELS: Record<string, string> = { F: "נשים", M: "גברים", U: "לא ידוע" };
  const genderData = profile.audienceGenderJson
    ? (JSON.parse(profile.audienceGenderJson) as { label: string; value: number }[]).map((d) => ({
        label: GENDER_LABELS[d.label] ?? d.label,
        value: d.value,
      }))
    : null;
  const ageData = profile.audienceAgeJson ? (JSON.parse(profile.audienceAgeJson) as { label: string; value: number }[]) : null;
  const countryDataRaw = profile.audienceCountryJson
    ? (JSON.parse(profile.audienceCountryJson) as { label: string; value: number }[])
    : null;
  const countryData = countryDataRaw
    ? (() => {
        const top = countryDataRaw.slice(0, 5);
        const restTotal = countryDataRaw.slice(5).reduce((sum, d) => sum + d.value, 0);
        return restTotal > 0 ? [...top, { label: "אחר", value: restTotal }] : top;
      })()
    : null;
  const reachByFollowType = profile.audienceReachByFollowJson
    ? (JSON.parse(profile.audienceReachByFollowJson) as {
        reel: { follower: number; nonFollower: number };
        post: { follower: number; nonFollower: number };
      })
    : null;
  const reachByFollowTypeData = reachByFollowType
    ? [
        { name: "ריל", nonFollower: reachByFollowType.reel.nonFollower, follower: reachByFollowType.reel.follower },
        { name: "פוסט/קרוסלה", nonFollower: reachByFollowType.post.nonFollower, follower: reachByFollowType.post.follower },
      ]
    : null;

  const rows: Row[] = media.map((m) => {
    const { dayOfWeek, hour } = israelDayAndHour(m.timestamp);
    return {
      id: m.id,
      mediaType: m.mediaType,
      isReel: m.mediaType === "VIDEO" || m.mediaProductType === "REELS",
      timestamp: m.timestamp,
      dayOfWeek,
      hour,
      hashtagCount: m.hashtagCount,
      likesCount: m.likesCount,
      commentsCount: m.commentsCount,
      viewsCount: m.viewsCount,
      reachCount: m.reachCount,
      savedCount: m.savedCount,
      sharesCount: m.sharesCount,
      algorithmSignal: m.savedCount !== null || m.sharesCount !== null ? (m.savedCount ?? 0) + (m.sharesCount ?? 0) : null,
      engagementRate: m.likesCount !== null && m.reachCount ? (m.likesCount / m.reachCount) * 100 : null,
      avgWatchSeconds: m.avgWatchSeconds,
      durationSeconds: m.durationSeconds,
      aiTheme: m.aiTheme,
      aiFormat: m.aiFormat,
      aiTone: m.aiTone,
      caption: m.caption,
      permalink: m.permalink,
      thumbnailUrl: m.thumbnailUrl,
    };
  });

  const reels = rows.filter((r) => r.isReel);
  const carousels = rows.filter((r) => r.mediaType === "CAROUSEL_ALBUM");
  const oneTag = rows.filter((r) => r.hashtagCount <= 1);
  const manyTags = rows.filter((r) => r.hashtagCount >= 2);
  const shortReels = reels.filter((r) => r.durationSeconds !== null && r.durationSeconds <= REEL_LENGTH_THRESHOLD);
  const longReels = reels.filter((r) => r.durationSeconds !== null && r.durationSeconds > REEL_LENGTH_THRESHOLD);

  const weekdayBuckets = WEEKDAY_LABELS.map((label, day) => ({ name: label, rows: rows.filter((r) => r.dayOfWeek === day) }));
  const weekdayBucketsFull = WEEKDAY_FULL_LABELS.map((label, day) => ({ name: label, rows: rows.filter((r) => r.dayOfWeek === day) }));
  // מקטעי שעות מפורשים (טווח שעות אמיתי בשם, לא "לילה" סתמי) — 4 שעות כל אחד.
  const HOUR_BUCKET_STARTS = [0, 4, 8, 12, 16, 20];
  const hourBucketLabel = (start: number) => `${String(start).padStart(2, "0")}-${String((start + 4) % 24).padStart(2, "0")}`;
  const hourBucketOf = (h: number) => hourBucketLabel(HOUR_BUCKET_STARTS.filter((s) => h >= s).pop() ?? 0);
  const hourBuckets = HOUR_BUCKET_STARTS.map((start) => {
    const name = hourBucketLabel(start);
    return { name, rows: rows.filter((r) => hourBucketOf(r.hour) === name) };
  });

  // תדירות פרסום: פער בימים בין פוסט לקודמו — משפיע על הגעה?
  const frequentRows: Row[] = [];
  const infrequentRows: Row[] = [];
  for (let i = 1; i < rows.length; i++) {
    const gapDays = (rows[i].timestamp.getTime() - rows[i - 1].timestamp.getTime()) / (1000 * 60 * 60 * 24);
    (gapDays <= FREQUENT_GAP_DAYS ? frequentRows : infrequentRows).push(rows[i]);
  }

  // שמירות+שיתופים — הסימנים שלפי מטא משפיעים על חשיפה אלגוריתמית משמעותית
  // יותר מלייקים. אלה, ולא הלייקים, מקבלים כאן קדימות.
  const formatAlgorithmData =
    reels.filter((r) => r.algorithmSignal !== null).length >= MIN_PER_GROUP &&
    carousels.filter((r) => r.algorithmSignal !== null).length >= MIN_PER_GROUP
      ? [
          { name: "ריל", saved: avg(reels.map((r) => r.savedCount)) ?? 0, shares: avg(reels.map((r) => r.sharesCount)) ?? 0 },
          {
            name: "קרוסלה",
            saved: avg(carousels.map((r) => r.savedCount)) ?? 0,
            shares: avg(carousels.map((r) => r.sharesCount)) ?? 0,
          },
        ]
      : null;
  const weekdayAlgorithmData = bucketBarData(weekdayBuckets, "algorithmSignal", 3);
  const hourAlgorithmData = bucketBarData(hourBuckets, "algorithmSignal", 2);

  const formatLikesCommentsData =
    reels.length >= MIN_PER_GROUP && carousels.length >= MIN_PER_GROUP
      ? [
          { name: "ריל", likes: avg(reels.map((r) => r.likesCount)) ?? 0, comments: avg(reels.map((r) => r.commentsCount)) ?? 0 },
          {
            name: "קרוסלה",
            likes: avg(carousels.map((r) => r.likesCount)) ?? 0,
            comments: avg(carousels.map((r) => r.commentsCount)) ?? 0,
          },
        ]
      : null;

  const formatViewsReachData =
    reels.filter((r) => r.reachCount !== null).length >= MIN_PER_GROUP &&
    carousels.filter((r) => r.reachCount !== null).length >= MIN_PER_GROUP
      ? [
          { name: "ריל", views: avg(reels.map((r) => r.viewsCount)) ?? 0, reach: avg(reels.map((r) => r.reachCount)) ?? 0 },
          {
            name: "קרוסלה",
            views: avg(carousels.map((r) => r.viewsCount)) ?? 0,
            reach: avg(carousels.map((r) => r.reachCount)) ?? 0,
          },
        ]
      : null;

  const formatEngagementData =
    reels.filter((r) => r.engagementRate !== null).length >= MIN_PER_GROUP &&
    carousels.filter((r) => r.engagementRate !== null).length >= MIN_PER_GROUP
      ? [
          { name: "ריל", rate: avg(reels.map((r) => r.engagementRate)) ?? 0 },
          { name: "קרוסלה", rate: avg(carousels.map((r) => r.engagementRate)) ?? 0 },
        ]
      : null;

  const hashtagLikesData = twoGroupBarData(oneTag, "תגית אחת", manyTags, "כמה תגיות", "likesCount");

  // כמות תגיות מדויקת (0,1,2,3,4+) אל מול הגעה (צופים ייחודיים) — פירוט מלא, לא רק בינארי.
  const maxHashtagCount = rows.reduce((max, r) => Math.max(max, r.hashtagCount), 0);
  const hashtagCountBuckets = Array.from({ length: Math.min(maxHashtagCount, 4) + 1 }, (_, i) => {
    const isLast = i === 4 && maxHashtagCount > 4;
    const name = isLast ? "4+" : String(i);
    return { name, rows: rows.filter((r) => (isLast ? r.hashtagCount >= 4 : r.hashtagCount === i)) };
  });
  const hashtagReachData = bucketBarData(hashtagCountBuckets, "reachCount", 2);
  const hashtagAlgorithmData = bucketBarData(hashtagCountBuckets, "algorithmSignal", 2);
  const weekdayLikesData = bucketBarData(weekdayBuckets, "likesCount", 3);
  const weekdayReachData = bucketBarData(weekdayBuckets, "reachCount", 3);
  const hourLikesData = bucketBarData(hourBuckets, "likesCount", 2);
  const hourReachData = bucketBarData(hourBuckets, "reachCount", 2);
  const durationWatchData = twoGroupBarData(shortReels, `עד ${REEL_LENGTH_THRESHOLD}s`, longReels, `מעל ${REEL_LENGTH_THRESHOLD}s`, "avgWatchSeconds");

  // תיוג AI (אופציונלי — רק לפוסטים שנוצרו בכלי, קושרו, וסווגו)
  const themes = [...new Set(rows.map((r) => r.aiTheme).filter((t): t is string => !!t))];
  const hasLetterPosts = rows.some((r) => r.aiFormat === "letter");
  const themeBuckets = themes.map((theme) => ({ name: theme, rows: rows.filter((r) => r.aiTheme === theme) }));
  const themeLikesData = bucketBarData(themeBuckets, "likesCount", 2);
  // "מכתב" הוא תיוג ידני יזום (הצ'קבוקס) — כל פוסט שלא סומן ככה נחשב "רגיל"
  // מעצם ההיעדר, בלי צורך לסמן כל פוסט בנפרד כ"לא מכתב".
  const letterRows = rows.filter((r) => r.aiFormat === "letter");
  const regularRows = rows.filter((r) => r.aiFormat !== "letter");
  const formatStyleLikesData = twoGroupBarData(letterRows, "מכתב", regularRows, "פוסט רגיל", "likesCount");
  const formatStyleViewsReachData =
    letterRows.filter((r) => r.reachCount !== null).length >= MIN_PER_GROUP &&
    regularRows.filter((r) => r.reachCount !== null).length >= MIN_PER_GROUP
      ? [
          { name: "מכתב", views: avg(letterRows.map((r) => r.viewsCount)) ?? 0, reach: avg(letterRows.map((r) => r.reachCount)) ?? 0 },
          {
            name: "פוסט רגיל",
            views: avg(regularRows.map((r) => r.viewsCount)) ?? 0,
            reach: avg(regularRows.map((r) => r.reachCount)) ?? 0,
          },
        ]
      : null;
  const realisticRows = rows.filter((r) => r.aiTone === "realistic");
  const absurdRows = rows.filter((r) => r.aiTone === "absurd");
  const toneLikesData = twoGroupBarData(realisticRows, "ריאליסטי", absurdRows, "אבסורדי", "likesCount");

  const trendData = rows
    .filter((r) => r.likesCount !== null)
    .map((r) => ({ date: r.timestamp.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }), value: r.likesCount as number }));

  const recommendations = [
    // הכי חשובות: יום/שעה/תדירות פרסום — מגיעות ראשונות (priority: true)
    buildBestBucketRecommendation(
      "יום פרסום הכי משתלם",
      weekdayBucketsFull,
      "reachCount",
      "חשבונות שנחשפו",
      (bestLabel) => `הכי משתלם לפרסם ב${bestLabel}`
    ),
    buildBestBucketRecommendation(
      "שעת פרסום הכי משתלמת",
      hourBuckets,
      "reachCount",
      "חשבונות שנחשפו",
      (bestLabel) => `הכי משתלם לפרסם ב${bestLabel}`
    ),
    buildRecommendation(
      "תדירות פרסום",
      frequentRows,
      `כל עד ${FREQUENT_GAP_DAYS} ימים`,
      `פרסום כל עד ${FREQUENT_GAP_DAYS} ימים מביא יותר חשיפה — להמשיך בקצב הזה`,
      infrequentRows,
      `פערים גדולים יותר`,
      `דווקא פערים גדולים יותר בין פרסומים מביאים יותר חשיפה`,
      "reachCount",
      "חשבונות שנחשפו",
      "",
      true
    ),
    // המלצות לפי סימני "חיבוב אלגוריתם" (שמירות+שיתופים) — לפי מטא, סימנים
    // חזקים משמעותית מלייקים לחשיפה. מקבלות עדיפות על פני המלצות מבוססות-לייקים.
    buildRecommendation(
      "ריל לעומת קרוסלה — שמירות ושיתופים",
      reels,
      "ריל",
      "רילים מקבלים יותר שמירות/שיתופים — האלגוריתם צפוי להעדיף אותם על קרוסלות",
      carousels,
      "קרוסלה",
      "קרוסלות מקבלות יותר שמירות/שיתופים — האלגוריתם צפוי להעדיף אותן על רילים",
      "algorithmSignal",
      "שמירות+שיתופים",
      "",
      true
    ),
    buildRecommendation(
      "כמות תגיות — שמירות ושיתופים",
      oneTag,
      "תגית אחת",
      "תגית אחת מספיקה — היא לא פוגעת בשמירות/שיתופים",
      manyTags,
      "כמה תגיות",
      "כמה תגיות מביאות יותר שמירות/שיתופים — שווה להמשיך להוסיף",
      "algorithmSignal",
      "שמירות+שיתופים"
    ),
    buildRecommendation(
      "אורך הריל",
      shortReels,
      `עד ${REEL_LENGTH_THRESHOLD}s`,
      "רילים קצרים נצפים יותר זמן בממוצע — להמשיך איתם",
      longReels,
      `מעל ${REEL_LENGTH_THRESHOLD}s`,
      "רילים ארוכים לא פוגעים בזמן הצפייה — אפשר להמשיך גם איתם",
      "avgWatchSeconds",
      "שניות צפייה",
      "s"
    ),
    // המלצות מבוססות-לייקים — פחות אמינות לחשיפה אלגוריתמית, מוצגות אחרונות בכוונה.
    buildRecommendation(
      "ריל לעומת קרוסלה — לייקים",
      reels,
      "ריל",
      "להמשיך להתמקד ברילים — הם מובילים בלייקים (אבל זה לא בהכרח מה שמניע את האלגוריתם)",
      carousels,
      "קרוסלה",
      "להמשיך להתמקד בקרוסלות — הן מובילות בלייקים (אבל זה לא בהכרח מה שמניע את האלגוריתם)",
      "likesCount",
      "לייקים"
    ),
  ]
    .filter((r): r is Recommendation => r !== null)
    .sort((a, b) => Number(b.priority ?? false) - Number(a.priority ?? false));

  // הצעות לטסטים: ימים/שעות שעדיין לא (או כמעט לא) פורסמו — מחושב מחדש כל
  // פעם לפי הנתונים בפועל, כך שברגע שמצטברים מספיק פוסטים בדלי מסוים (>=
  // MIN_PER_GROUP) הוא "מסיים" את הטסט ונעלם מכאן מעצמו (ומופיע בגרפים מעלה).
  // הקשר כללי להסבר "למה שווה לנסות" — ממוצע כללי + הדלי הטוב ביותר שכבר נוסה בפועל.
  const overallReachValues = rows.map((r) => r.reachCount);
  const overallReachAvg = avg(overallReachValues);
  const overallReachFilled = overallReachValues.filter((v) => v !== null).length;
  // כל הדליים (יום/שעה) שכן נוסו בפועל, עם הממוצע האמיתי והכמות האמיתית שלהם
  // — לצורך הצגה מלאה בכפתור האינפו (לא רק "הטוב ביותר" מבודד משאר ההקשר).
  const testedBucketsForContext = [
    ...weekdayBucketsFull.map((b) => ({ scope: "יום", ...b })),
    ...hourBuckets.map((b) => ({ scope: "שעות", ...b })),
  ]
    .filter((b) => b.rows.length >= MIN_PER_GROUP)
    .map((b) => ({ scope: b.scope, label: b.name, count: b.rows.length, value: avg(b.rows.map((r) => r.reachCount)) }))
    .filter((b): b is { scope: string; label: string; count: number; value: number } => b.value !== null)
    .sort((a, b) => b.value - a.value);
  const bestTestedBucket = testedBucketsForContext[0] ?? null;

  const testSuggestions = [
    ...weekdayBucketsFull.map((b) => ({ scope: "יום", label: b.name, count: b.rows.length })),
    ...hourBuckets.map((b) => ({ scope: "שעות", label: b.name, count: b.rows.length })),
  ]
    .filter((b) => b.count < MIN_PER_GROUP)
    .map((b) => {
      const slotLabel = `${b.scope === "יום" ? "" : "שעות "}${b.label}`;
      const bestLabel = bestTestedBucket ? `${bestTestedBucket.scope === "יום" ? "" : "שעות "}${bestTestedBucket.label}` : "";
      const note =
        b.count === 0
          ? `עוד לא פרסמת אף פעם ב${slotLabel} — שווה לנסות ולבדוק אם זה משפר חשיפה`
          : `פרסמת רק פעם אחת ב${slotLabel} — עוד מוקדם להסיק, שווה לנסות עוד`;
      const detail =
        overallReachAvg !== null
          ? `בממוצע הכללי על פני ${overallReachFilled} פוסטים את מקבלת כ-${fmt(overallReachAvg)} הגעה (חשבונות ייחודיים). ${
              bestTestedBucket ? `הטוב ביותר שכן נבדק בפועל הוא ${bestLabel}, עם ${fmt(bestTestedBucket.value)} בממוצע. ` : ""
            }מכיוון שאין (או כמעט אין) נתון עדיין ל-${slotLabel}, אין דרך לדעת אם הוא יעלה על ${bestLabel || "הממוצע"} או יפגר אחריו — לכן זה מועמד טוב לניסוי.`
          : `עדיין אין מספיק נתונים כלליים כדי להשוות — כל פוסט נוסף עוזר לבנות תמונה.`;
      const breakdown = [
        ...(overallReachAvg !== null ? [{ label: "ממוצע כללי (כל הפוסטים)", value: overallReachAvg, count: overallReachFilled }] : []),
        // רק ה-5 המובילים (מדורגים כבר לפי value) — כדי שהכרטיס יישאר קריא, לא רשימה של כל דלי שנבדק.
        ...testedBucketsForContext.slice(0, 5).map((tb) => ({
          label: `${tb.scope === "יום" ? "" : "שעות "}${tb.label}`,
          value: tb.value,
          count: tb.count,
        })),
      ];
      return { ...b, note, detail, breakdown };
    });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-maroon">דשבורד אנליטיקס</h1>

      <p className="text-sm text-brand-maroon/60">
        כל הנתונים כאן מבוססים על מה שסונכרן בפועל מהאינסטגרם שלך — לא על תוכן מהכלי (מלבד אורך ריל, שמגיע מהכלי רק
        אם קושר). {rows.length} פוסטים מסונכרנים כרגע. לסנכרון עדכני, יש כפתור בעמוד ההגדרות.
      </p>

      {rows.length === 0 && (
        <p className="rounded-lg border border-brand-pink/30 bg-white p-6 text-center text-brand-maroon/50">
          עוד לא סונכרן אף פוסט מהאינסטגרם. עברי להגדרות ולחצי על &quot;סנכרן את הדשבורד&quot;.
        </p>
      )}

      {recommendations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">המלצות להמשך</h2>
          <ChartScrollRow>
            {recommendations.map((rec) => (
              <RecommendationCard
                key={rec.title}
                action={rec.action}
                detail={rec.detail}
                breakdown={rec.breakdown}
                unit={rec.unit}
                highlighted={rec.priority}
              />
            ))}
          </ChartScrollRow>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">
          שמירות ושיתופים — הסימנים שהאלגוריתם באמת אוהב
        </h2>
        <p className="text-xs text-brand-maroon/50">
          לפי מטא, שמירות ושיתופים משפיעים על חשיפה אלגוריתמית משמעותית יותר מלייקים — הגרפים כאן מקבלים עדיפות.
        </p>
        <ChartScrollRow>
          <GroupedBarCard
            title="ריל לעומת קרוסלה — שמירות ושיתופים"
            data={formatAlgorithmData}
            bars={[
              { key: "saved", label: "שמירות", color: "#c41e3a" },
              { key: "shares", label: "שיתופים", color: "#e7a9b8" },
            ]}
          />
          <BarComparisonCard title="יום בשבוע → שמירות+שיתופים" data={weekdayAlgorithmData} note="דרושים פוסטים ב-3 ימים שונים לפחות" />
          <BarComparisonCard title="שעת פרסום → שמירות+שיתופים" data={hourAlgorithmData} note="דרושים פוסטים בכמה שעות שונות" />
          <BarComparisonCard title="כמות תגיות → שמירות+שיתופים" data={hashtagAlgorithmData} />
        </ChartScrollRow>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">
          חשיפה וצפיות — מתי ובאיזה פורמט להגיע ליותר אנשים
        </h2>
        <ChartScrollRow>
          <GroupedBarCard
            title="ריל לעומת קרוסלה — צפיות והגעה"
            data={formatViewsReachData}
            bars={[
              { key: "views", label: "צפיות", color: "#c41e3a" },
              { key: "reach", label: "הגעה (ייחודי)", color: "#e7a9b8" },
            ]}
            note="הגעה = כמות חשבונות ייחודיים; צפיות יכולות לכלול צפייה חוזרת של אותו חשבון"
          />
          <BarComparisonCard title="יום בשבוע → הגעה" data={weekdayReachData} note="דרושים פוסטים ב-3 ימים שונים לפחות" />
          <BarComparisonCard title="שעת פרסום → הגעה" data={hourReachData} note="דרושים פוסטים בכמה שעות שונות" />
          <BarComparisonCard
            title="כמות תגיות → הגעה (צופים ייחודיים)"
            data={hashtagReachData}
            note="דרושות לפחות 2 קבוצות תגיות (0,1,2,3,4+) עם 2 פוסטים לפחות"
          />
          <GroupedBarCard
            title="יעילות המרה: לייקים ל-100 חשבונות שנחשפו"
            data={formatEngagementData}
            bars={[{ key: "rate", label: "% המרה", color: "#c41e3a" }]}
            note="מנרמל את הלייקים לפי כמות החשיפה — כדי לבודד את איכות התוכן מהאלגוריתם"
          />
          <BarComparisonCard
            title="אורך ריל → זמן צפייה"
            data={durationWatchData}
            unit="s"
            note="רק לרילים שנוצרו בכלי וקושרו (יש להם אורך ידוע)"
          />
          <GroupedBarCard
            title="מכתב לעומת פוסט רגיל — צפיות והגעה"
            data={formatStyleViewsReachData}
            bars={[
              { key: "views", label: "צפיות", color: "#c41e3a" },
              { key: "reach", label: "הגעה (ייחודי)", color: "#e7a9b8" },
            ]}
            note="סמני 'פוסט מסוג מכתב' בגלריה למטה — כל פוסט אחר נחשב אוטומטית 'רגיל'"
          />
        </ChartScrollRow>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">
          לייקים ותגובות — פחות משפיעים על האלגוריתם, אבל עדיין מידע שימושי
        </h2>
        <ChartScrollRow>
          <GroupedBarCard
            title="ריל לעומת קרוסלה — לייקים ותגובות"
            data={formatLikesCommentsData}
            bars={[
              { key: "likes", label: "לייקים", color: "#c41e3a" },
              { key: "comments", label: "תגובות", color: "#e7a9b8" },
            ]}
          />
          <BarComparisonCard title="כמות תגיות → לייקים" data={hashtagLikesData} />
          <BarComparisonCard title="יום בשבוע → לייקים" data={weekdayLikesData} note="דרושים פוסטים ב-3 ימים שונים לפחות" />
          <BarComparisonCard title="שעת פרסום → לייקים" data={hourLikesData} note="דרושים פוסטים בכמה שעות שונות" />
          <BarComparisonCard
            title="נושא → לייקים"
            data={themeLikesData}
            note="דרושים לפחות 2 פוסטים מאותו נושא, בשני נושאים שונים — סווגי בגלריה למטה"
          />
          <BarComparisonCard
            title="מכתב לעומת פוסט רגיל → לייקים"
            data={formatStyleLikesData}
            note="סמני 'פוסט מסוג מכתב' בגלריה למטה — כל פוסט אחר נחשב אוטומטית 'רגיל'"
          />
          <BarComparisonCard
            title="ריאליסטי לעומת אבסורדי → לייקים"
            data={toneLikesData}
            note="רק לפוסטים שנוצרו בכלי, קושרו, וסווגו ב-AI"
          />
        </ChartScrollRow>
      </div>

      <LineTrendCard title="מגמת לייקים לאורך זמן" data={trendData} />

      {testSuggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">הצעות לטסטים</h2>
          <p className="text-xs text-brand-maroon/50">
            נעלם מכאן ועובר לגרפים מעלה אוטומטית ברגע שיצטברו מספיק פוסטים באותו דלי.
          </p>
          <ChartScrollRow>
            {testSuggestions.map((s) => (
              <RecommendationCard
                key={`${s.scope}-${s.label}`}
                icon="🧪"
                action={s.note}
                detail={s.detail}
                breakdown={s.breakdown}
              />
            ))}
          </ChartScrollRow>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">קהל העוקבים</h2>
        <p className="text-xs text-brand-maroon/50">תמונת מצב עדכנית (לא היסטוריה) — מתעדכנת עם סנכרון הדשבורד.</p>
        <ChartScrollRow>
          <PieBreakdownCard title="מין" data={genderData} />
          <PieBreakdownCard title="גיל" data={ageData} />
          <PieBreakdownCard title="מדינה" data={countryData} note="דרוש סנכרון" />
          <GroupedBarCard
            title="חשיפה: עוקבים לעומת לא-עוקבים"
            data={reachByFollowTypeData}
            bars={[
              { key: "nonFollower", label: "לא עוקבים", color: "#c41e3a" },
              { key: "follower", label: "עוקבים", color: "#e7a9b8" },
            ]}
            note="דרוש סנכרון — מדד ברמת החשבון (לא לכל פוסט), מצטבר מתאריך הסנכרון"
          />
        </ChartScrollRow>
      </div>

      <div id="gallery" className="flex flex-col gap-3">
        <h2 className="font-semibold text-brand-maroon border-b border-brand-pink/30 pb-2">כל הפוסטים המסונכרנים</h2>
        {(themes.length > 0 || hasLetterPosts) && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Link
              href={buildGalleryHref({ format: filterFormat, sort: sortBy })}
              className={`rounded-full px-3 py-1 ${!filterTheme ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"}`}
            >
              הכל
            </Link>
            {themes.map((theme) => (
              <Link
                key={theme}
                href={buildGalleryHref({ theme, format: filterFormat, sort: sortBy })}
                className={`rounded-full px-3 py-1 ${filterTheme === theme ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"}`}
              >
                {theme}
              </Link>
            ))}
            {hasLetterPosts && (
              <Link
                href={buildGalleryHref({
                  theme: filterTheme,
                  format: filterFormat === "letter" ? undefined : "letter",
                  sort: sortBy,
                })}
                className={`rounded-full px-3 py-1 ${filterFormat === "letter" ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"}`}
              >
                ✉️ מכתב
              </Link>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-brand-maroon/50">מיון:</span>
          <Link
            href={buildGalleryHref({ theme: filterTheme, format: filterFormat })}
            className={`rounded-full px-3 py-1 ${sortBy !== "views" ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"}`}
          >
            תאריך (חדש לישן)
          </Link>
          <Link
            href={buildGalleryHref({ theme: filterTheme, format: filterFormat, sort: "views" })}
            className={`rounded-full px-3 py-1 ${sortBy === "views" ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"}`}
          >
            👁 הכי הרבה צפיות
          </Link>
        </div>
        <ChartScrollRow>
          {(sortBy === "views"
            ? [...rows].sort((a, b) => (b.viewsCount ?? -1) - (a.viewsCount ?? -1))
            : [...rows].reverse()
          )
            .filter((row) => !filterTheme || row.aiTheme === filterTheme)
            .filter((row) => !filterFormat || row.aiFormat === filterFormat)
            .map((row) => (
            <div
              key={row.id}
              className="min-w-[170px] shrink-0 snap-start rounded-lg border border-brand-pink/30 bg-white p-2 text-xs flex flex-col gap-1"
            >
              <a href={row.permalink} target="_blank" rel="noreferrer" className="flex flex-col gap-1 hover:opacity-80">
                {row.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.thumbnailUrl} alt="" className="w-full h-28 rounded-md object-cover" />
                ) : (
                  <div className="w-full h-28 rounded-md bg-brand-pink/10" />
                )}
                <p className="font-medium text-brand-maroon truncate">
                  {row.isReel ? "ריל" : row.mediaType === "CAROUSEL_ALBUM" ? "קרוסלה" : "תמונה"} ·{" "}
                  {row.timestamp.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                </p>
                <p className="truncate text-brand-maroon/60">{row.caption ?? "—"}</p>
                <p className="text-brand-maroon/70" dir="ltr">
                  ❤️ {row.likesCount ?? "—"} · 💬 {row.commentsCount ?? "—"} · 👁 {row.viewsCount ?? "—"} · 👤{" "}
                  {row.reachCount ?? "—"}
                  {row.durationSeconds !== null ? ` · ⏱ ${fmt(row.durationSeconds)}s` : ""}
                </p>
              </a>
              <InstagramMediaLabelEditor
                mediaId={row.id}
                initialTheme={row.aiTheme}
                initialFormat={row.aiFormat}
                availableThemes={aiThemeOptions}
              />
            </div>
          ))}
        </ChartScrollRow>
      </div>
    </div>
  );
}
