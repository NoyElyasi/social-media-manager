import { prisma } from "@/server/db";
import { ALWAYS_FIRST_HASHTAG } from "@/lib/labels";

/**
 * מדרגת ימים/שעות לפי הגעה ממוצעת (InstagramMedia.reachCount) — לשימוש
 * בתכנון השבועי (/schedule), כדי לסמן ימים/שעות "חזקים". בכוונה לא משותף
 * בקוד עם /dashboard (שיש לו חישוב דומה) — /dashboard כבר עובד ונבדק, ולא
 * רוצים לקחת סיכון ברפקטור שלו רק בשביל שיתוף קוד; שני המקומות מסתמכים על
 * אותה לוגיקה מהותית (הגעה ממוצעת לפי דלי), רק לא על אותה פונקציה בפועל.
 */

export const WEEKDAY_FULL_LABELS = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];
const MIN_PER_GROUP = 2;
const HOUR_BUCKET_STARTS = [0, 4, 8, 12, 16, 20];

export function israelDayAndHour(date: Date): { dayOfWeek: number; hour: number } {
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

export interface BucketStrength {
  name: string;
  avgReach: number | null;
  count: number;
  /** בין ה-topN המובילים, ויש להם מספיק נתונים (MIN_PER_GROUP) — לא רק "המספר הכי גבוה" בלי משמעות. */
  isStrong: boolean;
}

export interface DayStrength extends BucketStrength {
  dayOfWeek: number; // 0=ראשון..6=שבת
}

export interface HourBucketStrength extends BucketStrength {
  startHour: number; // 0,4,8,12,16,20
}

export interface HourlyStrength {
  hour: number; // 0-23
  avgReach: number | null;
  count: number;
}

function markStrong<T extends { avgReach: number | null; count: number; isStrong: boolean }>(buckets: T[], topN: number): void {
  const eligible = buckets.filter((b) => b.avgReach !== null && b.count >= MIN_PER_GROUP);
  const sorted = [...eligible].sort((a, b) => (b.avgReach as number) - (a.avgReach as number));
  const strong = new Set(sorted.slice(0, topN));
  for (const b of buckets) {
    if (strong.has(b)) b.isStrong = true;
  }
}

/**
 * מחזירה את דירוג הימים/שעות לפי הגעה ממוצעת, עם דגל isStrong ל-topN
 * המובילים בכל קבוצה — וגם פילוח לפי שעה בודדת (hourly, לא רק בלוקים של 4
 * שעות), כדי לבחור שעה ספציפית וריאלית בתוך בלוק חזק (ראו bestHourInBucket) —
 * בלי זה כל הצעה בבלוק "04-08" הייתה יוצאת ל-05:00 בקירוב שרירותי.
 */
export async function getDayHourStrength(topN = 3): Promise<{ days: DayStrength[]; hourBuckets: HourBucketStrength[]; hourly: HourlyStrength[] }> {
  const media = await prisma.instagramMedia.findMany({ select: { timestamp: true, reachCount: true } });

  const dayValues: (number | null)[][] = Array.from({ length: 7 }, () => []);
  const hourBucketOf = (h: number) => HOUR_BUCKET_STARTS.filter((s) => h >= s).pop() ?? 0;
  const hourValues = new Map<number, (number | null)[]>(HOUR_BUCKET_STARTS.map((s) => [s, []]));
  const hourlyValues: (number | null)[][] = Array.from({ length: 24 }, () => []);

  for (const m of media) {
    const { dayOfWeek, hour } = israelDayAndHour(m.timestamp);
    dayValues[dayOfWeek].push(m.reachCount);
    hourValues.get(hourBucketOf(hour))!.push(m.reachCount);
    hourlyValues[hour].push(m.reachCount);
  }

  const days: DayStrength[] = dayValues.map((values, dayOfWeek) => ({
    dayOfWeek,
    name: WEEKDAY_FULL_LABELS[dayOfWeek],
    avgReach: avg(values),
    count: values.filter((v) => v !== null).length,
    isStrong: false,
  }));

  const hourBuckets: HourBucketStrength[] = HOUR_BUCKET_STARTS.map((startHour) => {
    const values = hourValues.get(startHour) ?? [];
    return {
      startHour,
      name: `${String(startHour).padStart(2, "0")}-${String((startHour + 4) % 24).padStart(2, "0")}`,
      avgReach: avg(values),
      count: values.filter((v) => v !== null).length,
      isStrong: false,
    };
  });

  const hourly: HourlyStrength[] = hourlyValues.map((values, hour) => ({
    hour,
    avgReach: avg(values),
    count: values.filter((v) => v !== null).length,
  }));

  markStrong(days, topN);
  markStrong(hourBuckets, topN);

  return { days, hourBuckets, hourly };
}

/**
 * השעה הספציפית (0-23) עם ההגעה הממוצעת הגבוהה ביותר בתוך בלוק 4 השעות
 * שמתחיל ב-bucketStart, מבין שעות עם מספיק נתונים (MIN_PER_GROUP) — ואם אין
 * כזו, אמצע הבלוק (bucketStart+2) כברירת מחדל "נורמלית" יותר מקצה הבלוק.
 */
export function bestHourInBucket(hourly: HourlyStrength[], bucketStart: number): number {
  let best = bucketStart + 2;
  let bestAvg = -Infinity;
  for (let h = bucketStart; h < bucketStart + 4; h++) {
    const entry = hourly[h % 24];
    if (entry && entry.avgReach !== null && entry.count >= MIN_PER_GROUP && entry.avgReach > bestAvg) {
      bestAvg = entry.avgReach;
      best = entry.hour;
    }
  }
  return best;
}

export interface FormatPerformance {
  reel: { avgReach: number | null; count: number };
  carousel: { avgReach: number | null; count: number };
  /** הפורמט עם ההגעה הממוצעת הגבוהה יותר, לפי הנתונים בפועל — ריל כברירת מחדל אם אין מספיק נתונים להשוואה אמיתית. */
  betterFormat: "instagram_reel" | "instagram_carousel";
}

/**
 * הגעה ממוצעת בפועל: ריל לעומת קרוסלה (InstagramMedia.reachCount, לפי
 * mediaType/mediaProductType — אותה הבחנה כמו בדשבורד). משמש לקבוע איזה
 * פורמט מומלץ בסלוט ריק בתכנון השבועי, ראו getMonthlyFormatPace לשימוש דומה.
 */
export async function getFormatPerformance(): Promise<FormatPerformance> {
  const media = await prisma.instagramMedia.findMany({ select: { mediaType: true, mediaProductType: true, reachCount: true } });

  const reelValues: (number | null)[] = [];
  const carouselValues: (number | null)[] = [];
  for (const m of media) {
    const isReel = m.mediaType === "VIDEO" || m.mediaProductType === "REELS";
    if (isReel) reelValues.push(m.reachCount);
    else if (m.mediaType === "CAROUSEL_ALBUM") carouselValues.push(m.reachCount);
  }

  const reel = { avgReach: avg(reelValues), count: reelValues.filter((v) => v !== null).length };
  const carousel = { avgReach: avg(carouselValues), count: carouselValues.filter((v) => v !== null).length };

  const bothEligible = reel.avgReach !== null && carousel.avgReach !== null && reel.count >= MIN_PER_GROUP && carousel.count >= MIN_PER_GROUP;
  const betterFormat: FormatPerformance["betterFormat"] = bothEligible && carousel.avgReach! > reel.avgReach! ? "instagram_carousel" : "instagram_reel";

  return { reel, carousel, betterFormat };
}

// אותו שיקלול בדיוק כמו "המלצות לרילים הבאים" בדשבורד (views.6/likes.2/comments.2) —
// כדי שההצעה בתכנון תהיה *אותה* הצעה, לא חישוב מקביל שיכול להסתיים בתשובה אחרת.
const NEXT_REEL_WEIGHTS = { views: 0.6, likes: 0.2, comments: 0.2 };

function extractHashtags(caption: string | null): Set<string> {
  if (!caption) return new Set();
  const matches = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return new Set(matches.filter((h) => h !== ALWAYS_FIRST_HASHTAG));
}

function percentileRanks(values: (number | null)[]): number[] {
  const withIndex = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
  const sorted = [...withIndex].sort((a, b) => a.v - b.v);
  const rankByIndex = new Map<number, number>();
  sorted.forEach(({ i }, rank) => {
    rankByIndex.set(i, sorted.length > 1 ? rank / (sorted.length - 1) : 1);
  });
  return values.map((_, i) => rankByIndex.get(i) ?? 0);
}

export interface NextReelCandidate {
  mediaId: string;
  caption: string | null;
  permalink: string;
  thumbnailUrl: string | null;
  viewsCount: number | null;
  likesCount: number | null;
  commentsCount: number | null;
  score: number; // 0-1, שיקלול פרצנטילים — ראו NEXT_REEL_WEIGHTS
  postId: string | null; // אם הקרוסלה הזו קושרה לפוסט בכלי (instagramMediaId) — אפשר לקשר ישירות ל"הוסיפי ריל"
}

/**
 * *אותה* הצעה בדיוק כמו "🎬 המלצות לרילים הבאים" בדשבורד (dashboard/page.tsx)
 * — קרוסלות שפורסמו ואין להן עדיין ריל תואם (לפי חפיפת תגיות), מדורגות לפי
 * צפיות+לייקים+תגובות. לא מפוצל לפונקציה משותפת עם הדשבורד באותה סיבה שכל
 * שאר הפונקציות בקובץ הזה לא — לא לוקחים סיכון ברפקטור קוד שכבר עובד.
 */
export async function getNextReelCandidates(topN = 5, excludeMediaIds: Set<string> = new Set()): Promise<NextReelCandidate[]> {
  const media = await prisma.instagramMedia.findMany({
    select: {
      id: true,
      mediaType: true,
      mediaProductType: true,
      caption: true,
      permalink: true,
      thumbnailUrl: true,
      viewsCount: true,
      likesCount: true,
      commentsCount: true,
      excludedFromReelSuggestions: true,
    },
  });

  const reels = media.filter((m) => m.mediaType === "VIDEO" || m.mediaProductType === "REELS");
  const carousels = media.filter((m) => m.mediaType === "CAROUSEL_ALBUM");
  const reelHashtagSets = reels.map((r) => extractHashtags(r.caption));

  // שני סימנים ל"כבר מטופל" מעבר לרילים שכבר *פורסמו* לאינסטגרם — כדי שההצעה
  // לא תמשיך להציע את אותה קרוסלה שוב בשבוע הבא בפרק הזמן שבין שיבוץ הריל
  // בכלי לבין פרסומו בפועל וסנכרון InstagramMedia:
  // 1) ריל שהוכן בכלי עם תגית תואמת (גם אם עוד לא פורסם).
  // 2) ריל כלשהו שהוכן בכלי לאותו פוסט בדיוק כמו הקרוסלה (גם בלי תגית תואמת —
  //    זה קורה כשמוסיפים ריל לפוסט קיים ולא ממלאים לו תגיות בנפרד).
  const draftReels = await prisma.platformContent.findMany({
    where: { type: "instagram_reel" },
    select: { postId: true, hashtags: true },
  });
  const draftReelHashtagSets = draftReels.map((r) => {
    try {
      return new Set((JSON.parse(r.hashtags || "[]") as string[]).filter((h) => h !== ALWAYS_FIRST_HASHTAG));
    } catch {
      return new Set<string>();
    }
  });
  const allReelHashtagSets = [...reelHashtagSets, ...draftReelHashtagSets];
  const postIdsWithReel = new Set(draftReels.map((r) => r.postId));

  const linkedPosts = await prisma.platformContent.findMany({
    where: { instagramMediaId: { in: carousels.map((c) => c.id) } },
    select: { instagramMediaId: true, postId: true },
  });
  const postIdByMediaId = new Map(linkedPosts.map((c) => [c.instagramMediaId as string, c.postId]));

  const carouselsWithoutReel = carousels.filter((c) => {
    if (c.excludedFromReelSuggestions) return false;
    if (excludeMediaIds.has(c.id)) return false; // כבר "נתפס" בסלוט מתוכנן בשבוע אחר, ראו weeklySchedule.ts
    const linkedPostId = postIdByMediaId.get(c.id);
    if (linkedPostId && postIdsWithReel.has(linkedPostId)) return false;
    const tags = extractHashtags(c.caption);
    if (tags.size === 0) return true;
    return !allReelHashtagSets.some((reelTags) => [...tags].some((t) => reelTags.has(t)));
  });

  const viewsRanks = percentileRanks(carouselsWithoutReel.map((c) => c.viewsCount));
  const likesRanks = percentileRanks(carouselsWithoutReel.map((c) => c.likesCount));
  const commentsRanks = percentileRanks(carouselsWithoutReel.map((c) => c.commentsCount));

  const ranked = carouselsWithoutReel
    .map((row, i) => ({
      row,
      score: viewsRanks[i] * NEXT_REEL_WEIGHTS.views + likesRanks[i] * NEXT_REEL_WEIGHTS.likes + commentsRanks[i] * NEXT_REEL_WEIGHTS.comments,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return ranked.map(({ row, score }) => ({
    mediaId: row.id,
    caption: row.caption,
    permalink: row.permalink,
    thumbnailUrl: row.thumbnailUrl,
    viewsCount: row.viewsCount,
    likesCount: row.likesCount,
    commentsCount: row.commentsCount,
    score,
    postId: postIdByMediaId.get(row.id) ?? null,
  }));
}

/**
 * שולפת בחזרה קרוסלה ספציפית לפי InstagramMedia.id — לא לצורך דירוג/הצעה
 * חדשה, אלא ל"הזכיר" הצעה שכבר נתפסה בעבר בסלוט מתוכנן (plannedReelCandidateMediaId,
 * ראו weeklySchedule.ts) — לכן לא מסננת לפי excludedFromReelSuggestions/תגית תואמת.
 */
export async function getReelCandidatesByMediaIds(mediaIds: string[]): Promise<NextReelCandidate[]> {
  if (mediaIds.length === 0) return [];

  const [media, linkedPosts] = await Promise.all([
    prisma.instagramMedia.findMany({
      where: { id: { in: mediaIds } },
      select: { id: true, caption: true, permalink: true, thumbnailUrl: true, viewsCount: true, likesCount: true, commentsCount: true },
    }),
    prisma.platformContent.findMany({ where: { instagramMediaId: { in: mediaIds } }, select: { instagramMediaId: true, postId: true } }),
  ]);
  const postIdByMediaId = new Map(linkedPosts.map((c) => [c.instagramMediaId as string, c.postId]));

  return media.map((row) => ({
    mediaId: row.id,
    caption: row.caption,
    permalink: row.permalink,
    thumbnailUrl: row.thumbnailUrl,
    viewsCount: row.viewsCount,
    likesCount: row.likesCount,
    commentsCount: row.commentsCount,
    score: 0,
    postId: postIdByMediaId.get(row.id) ?? null,
  }));
}

export interface ContentAngle {
  theme: string;
  format: string; // "letter" | "tip" | "regular" (null מנורמל ל"regular")
  avgReach: number | null;
  count: number;
}

/** מדרגת שילובי נושא+פורמט (InstagramMedia.aiTheme/aiFormat) לפי הגעה ממוצעת — "מה כרגע מוביל" להתמקד בו. */
export async function getTopContentAngles(topN = 3): Promise<ContentAngle[]> {
  const media = await prisma.instagramMedia.findMany({
    where: { aiTheme: { not: null } },
    select: { aiTheme: true, aiFormat: true, reachCount: true },
  });

  const buckets = new Map<string, { theme: string; format: string; values: (number | null)[] }>();
  for (const m of media) {
    const theme = m.aiTheme as string;
    const format = m.aiFormat ?? "regular";
    const key = `${theme}::${format}`;
    if (!buckets.has(key)) buckets.set(key, { theme, format, values: [] });
    buckets.get(key)!.values.push(m.reachCount);
  }

  const angles: ContentAngle[] = [...buckets.values()].map((b) => ({
    theme: b.theme,
    format: b.format,
    avgReach: avg(b.values),
    count: b.values.filter((v) => v !== null).length,
  }));

  return angles
    .filter((a) => a.avgReach !== null && a.count >= MIN_PER_GROUP)
    .sort((a, b) => (b.avgReach as number) - (a.avgReach as number))
    .slice(0, topN);
}

export const MONTHLY_FORMAT_TARGET = 2;

export interface FormatGap {
  format: "letter" | "tip";
  monthCount: number; // כמה פורסמו בפועל בחודש הנבדק (aiFormat על InstagramMedia)
  target: number; // MONTHLY_FORMAT_TARGET
  // מאחורי הקצב הצפוי לשלב הזה בחודש — לא סתם "פחות מ-2 בסה״כ" (זה תמיד
  // נכון בתחילת חודש) אלא יחסית לכמה מהחודש כבר עבר, ראו expectedByNow.
  isBehind: boolean;
}

/**
 * קצב פרסום פורמטים (מכתב/טיפ, ראו InstagramMediaLabelEditor) בחודש נתון,
 * מול מטרה של MONTHLY_FORMAT_TARGET לחודש — מבוסס על InstagramMedia.aiFormat
 * +timestamp (תיוג ידני על תוכן שכבר פורסם בפועל באינסטגרם), לא על תוכן
 * שרק הוכן בכלי ולא פורסם עדיין. monthEnd לא כלול (exclusive).
 */
export async function getMonthlyFormatPace(monthStart: Date, monthEnd: Date): Promise<FormatGap[]> {
  const formats: FormatGap["format"][] = ["letter", "tip"];
  const now = Date.now();

  const elapsedFraction =
    monthEnd.getTime() <= now
      ? 1 // חודש שהסתיים כבר — הציפייה היא המטרה המלאה
      : monthStart.getTime() > now
        ? 0 // חודש עתידי — עדיין לא מצופה כלום
        : (now - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime());
  const expectedByNow = Math.floor(MONTHLY_FORMAT_TARGET * elapsedFraction);

  const alerts: FormatGap[] = [];
  for (const format of formats) {
    const monthCount = await prisma.instagramMedia.count({
      where: { aiFormat: format, timestamp: { gte: monthStart, lt: monthEnd } },
    });
    alerts.push({ format, monthCount, target: MONTHLY_FORMAT_TARGET, isBehind: monthCount < expectedByNow });
  }

  return alerts;
}
