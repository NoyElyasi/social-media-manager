import { prisma } from "@/server/db";
import { PlatformType } from "@/generated/prisma/client";
import {
  bestHourInBucket,
  getDayHourEngagement,
  getDayHourStrength,
  getFormatPerformance,
  getMonthlyFormatPace,
  getNextReelCandidates,
  getReelCandidatesByMediaIds,
  getTopContentAngles,
  WEEKDAY_FULL_LABELS,
  type ContentAngle,
  type DayStrength,
  type EngagementDayStrength,
  type EngagementHourBucketStrength,
  type FormatGap,
  type FormatPerformance,
  type HourBucketStrength,
  type HourlyStrength,
  type NextReelCandidate,
} from "@/lib/reachInsights";
import { getSpecialDays, type SpecialDay } from "@/lib/holidays";
import { ALWAYS_FIRST_HASHTAG } from "@/lib/labels";
import { getShortPreview, listReadySegments, type NotionReadyRow } from "@/server/notion";

/** התגית הראשונה שאינה #אחתביום — כמו postTitle בעמוד הבית, ראו src/app/page.tsx. */
function firstRealHashtag(hashtagsJson: string): string | null {
  try {
    const tags: string[] = JSON.parse(hashtagsJson || "[]");
    return tags.find((t) => t !== ALWAYS_FIRST_HASHTAG) ?? null;
  } catch {
    return null;
  }
}

type StrengthData = { days: DayStrength[]; hourBuckets: HourBucketStrength[]; hourly: HourlyStrength[] };
// מעורבות (לייקים+תגובות) — נפרד מ-StrengthData (הגעה) בכוונה, ראו getDayHourEngagement.
// כרגע רק תצוגה (⚡ לעומת ❤️💬 בלוח) — לא משפיע על אף החלטה בתכנון עדיין.
type EngagementData = { days: EngagementDayStrength[]; hourBuckets: EngagementHourBucketStrength[] };

/**
 * תכנון שבועי — ראו הערות על ScheduledSlot/BlockedDay ב-prisma/schema.prisma.
 * תאריכים כאן הם "תאריך לוח" בלבד (חצות UTC, בלי משמעות לאזור זמן) —
 * לא נגזרים מ-timestamp של פרסום בפועל, אז אין צורך בהמרת Asia/Jerusalem
 * כמו ב-reachInsights (זה קובע איזה יום *מוצג* בלוח, לא מתי מדיה פורסמה).
 */

const READY_TYPES: PlatformType[] = [PlatformType.instagram_reel, PlatformType.instagram_carousel];
// שלושה סלוטים "ליבה" בשבוע: שני "חדשים" ואחד "ישן" (ראו NEW_ROLE_COUNT
// ולוגיקת התפקידים ב-generateWeeklySchedule) — לפי בקשתה. סלוט הבדיקה
// (exploration) הוא תוסף רביעי, לא חלק מהשלושה האלה.
const MAX_SUGGESTED_SLOTS = 3;
const NEW_ROLE_COUNT = 2;
// לכל היותר שני רילים בשבוע (כולל סלוט הבדיקה, שהוא תמיד ריל) — לפי בקשתה "ריל גג שניים".
const REEL_WEEKLY_CAP = 2;
// הזיהוי היחיד ל"פוסט ישן" — ערך עמודת ה-Type בנושיין. ראו applyNotionTypeValue
// ב-posts/new/page.tsx (אותו כלל בדיוק, ליצירת פוסט בודד).
const NOTION_OLD_TYPE_VALUE = "ישן";

export function parseCalendarDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function formatCalendarDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** מתחילת השבוע (יום ראשון) של השבוע שמכיל את התאריך הנתון. */
export function getWeekStart(d: Date): Date {
  const normalized = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  normalized.setUTCDate(normalized.getUTCDate() - normalized.getUTCDay());
  return normalized;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** תחילת/סוף החודש הקלנדרי (UTC) שמכיל את התאריך הנתון — monthEnd לא כלול. */
function monthRangeOf(d: Date): { monthStart: Date; monthEnd: Date } {
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { monthStart, monthEnd };
}

// כמה ימים אחורה בודקים "דילוג" על מכתב/טיפ (ראו getSkippedFormatDebt) —
// חלון גלגלי, לא "מהחודש" הקלנדרי, כי דילוג בשבוע שעבר צריך למשוך תשומת
// לב מיידית לשבוע הבא, לא להמתין לחודש הבא.
const SKIP_DEBT_LOOKBACK_DAYS = 30;

/**
 * פורמטים (מכתב/טיפ) שסומנו actualStatus="skipped" על סלוט שתוכנן להיות
 * באותו פורמט (plannedFormat), בחלון הזמן האחרון — "חוב" שדוחף את ההמלצה
 * הבאה לאותו פורמט בלי להמתין לסנכרון מאינסטגרם שיגלה בעצמו שהוא חסר.
 */
async function getSkippedFormatDebt(before: Date): Promise<Set<"letter" | "tip">> {
  const since = addDays(before, -SKIP_DEBT_LOOKBACK_DAYS);
  const skipped = await prisma.scheduledSlot.findMany({
    where: { actualStatus: "skipped", plannedFormat: { not: null }, date: { gte: since, lt: before } },
    select: { plannedFormat: true },
  });
  return new Set(skipped.map((s) => s.plannedFormat as "letter" | "tip"));
}

/**
 * מסביר במילים על סמך מה נבחרו הימים/שעות/פורמט — כדי שהיא תוכל להבין (ולא
 * רק לראות) את ההמלצה, ולשנות אם היא לא מסכימה. מבוסס על *כל* הנתונים
 * שקיימים בכלי בזמן החישוב (לא מפולח לפי חודש — ראו monthlySchedule.ts).
 */
export function buildMethodologyLines(
  strength: StrengthData,
  formatPerf: FormatPerformance,
  totalSamples: number
): string[] {
  const lines: string[] = [];

  const strongDays = strength.days.filter((d) => d.isStrong);
  lines.push(
    strongDays.length > 0
      ? `ימים חזקים: ${strongDays.map((d) => `${d.name} (הגעה ממוצעת ${Math.round(d.avgReach ?? 0)}, ${d.count} פוסטים)`).join(", ")} — לפי הגעה ממוצעת גבוהה יותר מבין ${totalSamples} הפוסטים המסונכרנים (דרושים לפחות 2 פוסטים ביום כדי להיחשב).`
      : `אין עדיין יום עם מספיק פוסטים (2+) כדי לסמן אותו "חזק" — מבין ${totalSamples} פוסטים מסונכרנים.`
  );

  const strongHours = strength.hourBuckets.filter((h) => h.isStrong);
  lines.push(
    strongHours.length > 0
      ? `שעות חזקות: ${strongHours.map((h) => `${h.name} (הגעה ממוצעת ${Math.round(h.avgReach ?? 0)}, ${h.count} פוסטים)`).join(", ")} — אותו חישוב, לפי בלוק של 4 שעות. השעה המדויקת שנבחרת בפועל היא זו עם ההגעה הגבוהה ביותר בתוך הבלוק, לא סתם השעה הראשונה בו.`
      : `אין עדיין בלוק שעות עם מספיק פוסטים כדי לסמן אותו "חזק".`
  );

  lines.push(
    `יום לבדיקה: בכל שבוע נוסף בכוונה עוד סלוט אחד ביום עם הכי פחות פוסטים היסטוריים מבין המועמדים — לא כי הוא "חלש", אלא כדי לבדוק אם ההיעדרות שלו מההצעה נובעת מביצועים אמיתיים או סתם מזה שלא פורסם בו הרבה, ולתת סיכוי לחשיפה לקהל חדש. אם יש מועמד ריל פנוי הוא מוצע כריל, אחרת כקרוסלה (ראו למטה).`
  );

  const { reel, carousel } = formatPerf;
  const reelText = reel.avgReach !== null ? `${Math.round(reel.avgReach)} (${reel.count} פוסטים)` : "אין עדיין נתונים";
  const carouselText = carousel.avgReach !== null ? `${Math.round(carousel.avgReach)} (${carousel.count} פוסטים)` : "אין עדיין נתונים";
  lines.push(
    `פורמט: הגעה ממוצעת בריל ${reelText} לעומת קרוסלה ${carouselText} (מידע כללי בלבד). פוסט "ישן" תמיד מתפרסם כפוסט/קרוסלה, לא כריל. ריל מוצע רק אם יש מועמד אמיתי מ"המלצות לרילים הבאים" בדשבורד (תוכן שכבר הוכיח את עצמו) — לא ריל בלי תוכן ספציפי מאחוריו; בלי מועמד, קרוסלה כברירת מחדל.`
  );

  lines.push(`החישוב מתעדכן אוטומטית לפי כל הנתונים שסונכרנו מאינסטגרם עד כה — ככל שיצטבר עוד מידע, ההמלצה תשתנה ותתדייק.`);

  lines.push(
    `הרכב השבוע: שני סלוטים "חדשים" ואחד "ישן" (לפי הטייפ בנושיין) — לכל אחד מנסים למצוא קטע מוכן (סטטוס Ready בנושיין, או תוכן שכבר קיים בכלי), ואם אין, כותבים רק מה סוג הפוסט הדרוש בלי לפרט מה תוכנו. קטע שנבחר לא יוצע שוב בשבוע אחר. לכל היותר שני רילים בשבוע בסך הכל (כולל יום הבדיקה).`
  );

  return lines;
}

export interface SlotContentPreview {
  postId: string;
  type: string;
  text: string | null;
  // התגית הראשונה שאינה #אחתביום — לכותרת בחלונית הפרטים, ראו firstRealHashtag.
  titleTag: string | null;
  notionUrl: string | null;
}

export interface RecommendedNotionSegment {
  tag: string;
  preview: string;
  pageUrl: string;
}

export interface WeekSlot {
  slotId: string | null;
  date: string;
  hour: number;
  isManual: boolean;
  note: string | null;
  dayIsStrong: boolean;
  hourIsStrong: boolean;
  // מעורבות (לייקים+תגובות) — נפרד מ-dayIsStrong/hourIsStrong (הגעה), ראו EngagementData.
  dayIsEngaging: boolean;
  hourIsEngaging: boolean;
  // ריל/קרוסלה, מכתב/טיפ, והקרוסלה הספציפית שכדאי להפוך לריל (אם רלוונטי) —
  // כולם תמונת מצב קבועה מזמן היצירה (plannedType/plannedFormat/
  // plannedReelCandidateMediaId ב-DB), לא מחושבים מחדש בכל טעינה. ראו
  // getSkippedFormatDebt (מכתב/טיפ) ו-getNextReelCandidates (ריל הבא בתור).
  recommendedType: "instagram_reel" | "instagram_carousel" | null;
  recommendedFormat: "letter" | "tip" | null;
  recommendedReelCandidate: NextReelCandidate | null;
  // קטע "מוכן" מנושיין שהוצע לסלוט הריק הזה בזמן היצירה — תמונת מצב קבועה
  // (plannedNotionTag/Preview/PageUrl ב-DB), ראו getUsedNotionTags לדדופ בין שבועות.
  recommendedNotionSegment: RecommendedNotionSegment | null;
  // מה קרה בפועל עם הסלוט — מסומן ידנית, ראו PATCH /api/schedule/slots/[id].
  actualStatus: "pending" | "done" | "skipped";
  actualAt: string | null;
  content: SlotContentPreview | null;
}

export interface WeekPlan {
  weekStart: string;
  days: { date: string; label: string; specialDays: SpecialDay[]; blockedNote: string | null; blockedDayId: string | null }[];
  slots: WeekSlot[];
  strength: StrengthData;
  engagement: EngagementData;
  formatAlerts: FormatGap[];
  methodology: string[];
  topAngles: ContentAngle[];
  summary: { totalPosts: number; reels: number; newNeeded: number; existingReady: number };
}

async function loadWeekContext(weekStart: Date) {
  const weekEnd = addDays(weekStart, 7);
  const { monthStart, monthEnd } = monthRangeOf(weekStart);

  const [existingSlots, blockedDays, specialDays, strength, engagement, monthlyPace, formatPerf, topAngles, skipDebt] = await Promise.all([
    prisma.scheduledSlot.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
      include: { platformContent: { include: { post: true } } },
    }),
    prisma.blockedDay.findMany({ where: { date: { gte: weekStart, lt: weekEnd } } }),
    getSpecialDays(weekStart, addDays(weekEnd, -1)),
    getDayHourStrength(),
    getDayHourEngagement(),
    getMonthlyFormatPace(monthStart, monthEnd),
    getFormatPerformance(),
    getTopContentAngles(),
    getSkippedFormatDebt(weekStart),
  ]);

  // דילוג בפועל (ראו getSkippedFormatDebt) דוחף isBehind=true גם אם קצב
  // הפרסום החודשי בפועל עדיין נראה בסדר (למשל אם לא סונכרן אינסטגרם עדיין).
  const formatAlerts = monthlyPace.map((a) => (skipDebt.has(a.format) ? { ...a, isBehind: true } : a));

  return { weekEnd, existingSlots, blockedDays, specialDays, strength, engagement, formatAlerts, formatPerf, topAngles };
}

/** שולפת ומרכיבה מפה mediaId->NextReelCandidate, ל"הזכרת" הצעות שנתפסו בעבר (ראו plannedReelCandidateMediaId). */
async function buildCandidateMap(slots: { plannedReelCandidateMediaId?: string | null }[]): Promise<Map<string, NextReelCandidate>> {
  const mediaIds = slots.map((s) => s.plannedReelCandidateMediaId).filter((id): id is string => !!id);
  const candidates = await getReelCandidatesByMediaIds([...new Set(mediaIds)]);
  return new Map(candidates.map((c) => [c.mediaId, c]));
}

/**
 * תגיות נושיין שכבר "נתפסו" ע"י סלוט קיים — כדי לא להציע את אותו קטע
 * פעמיים. נספרות רק תפיסות משבוע נתון (since) ואילך: תפיסה משבוע שכבר עבר
 * ולא טופל (לא הפכה לפוסט בפועל) היא "הצעה שלא נוצלה" — היא לא צריכה
 * להמשיך לחסום את הקטע לתמיד משבועות עתידיים, ראו בקשתה על עדיפות לשבוע הקרוב.
 */
async function getUsedNotionTags(since: Date): Promise<Set<string>> {
  const rows = await prisma.scheduledSlot.findMany({
    where: { plannedNotionTag: { not: null }, date: { gte: since } },
    select: { plannedNotionTag: true },
  });
  return new Set(rows.map((r) => r.plannedNotionTag as string));
}

function toSlot(row: {
  id: string;
  date: Date;
  hour: number;
  isManual: boolean;
  note: string | null;
  plannedType: string | null;
  plannedFormat: string | null;
  plannedReelCandidateMediaId: string | null;
  plannedNotionTag: string | null;
  plannedNotionPreview: string | null;
  plannedNotionPageUrl: string | null;
  actualStatus: string;
  actualAt: Date | null;
  platformContent:
    | { id: string; type: string; text: string | null; postId: string; hashtags: string; post: { hashtags: string; notionUrl: string | null } }
    | null;
}, strength: StrengthData, engagement: EngagementData, candidateMap: Map<string, NextReelCandidate>): WeekSlot {
  const dateStr = formatCalendarDate(row.date);
  const dayOfWeek = row.date.getUTCDay();
  const bucketStart = [0, 4, 8, 12, 16, 20].filter((s) => row.hour >= s).pop() ?? 0;
  return {
    slotId: row.id,
    date: dateStr,
    hour: row.hour,
    isManual: row.isManual,
    note: row.note,
    dayIsStrong: strength.days[dayOfWeek]?.isStrong ?? false,
    hourIsStrong: strength.hourBuckets.find((b) => b.startHour === bucketStart)?.isStrong ?? false,
    dayIsEngaging: engagement.days[dayOfWeek]?.isStrong ?? false,
    hourIsEngaging: engagement.hourBuckets.find((b) => b.startHour === bucketStart)?.isStrong ?? false,
    recommendedType: row.plannedType as "instagram_reel" | "instagram_carousel" | null,
    recommendedFormat: row.plannedFormat as "letter" | "tip" | null,
    recommendedReelCandidate: row.plannedReelCandidateMediaId ? candidateMap.get(row.plannedReelCandidateMediaId) ?? null : null,
    recommendedNotionSegment: row.plannedNotionTag
      ? { tag: row.plannedNotionTag, preview: row.plannedNotionPreview ?? "", pageUrl: row.plannedNotionPageUrl ?? "" }
      : null,
    actualStatus: row.actualStatus as "pending" | "done" | "skipped",
    actualAt: row.actualAt ? row.actualAt.toISOString() : null,
    content: row.platformContent
      ? {
          postId: row.platformContent.postId,
          type: row.platformContent.type,
          text: row.platformContent.text,
          titleTag: firstRealHashtag(row.platformContent.hashtags) ?? firstRealHashtag(row.platformContent.post.hashtags),
          notionUrl: row.platformContent.post.notionUrl,
        }
      : null,
  };
}

/** קורא את התכנון של שבוע נתון כמו שהוא ב-DB היום, בלי לגנרט/לשנות כלום. */
export async function getWeekPlan(weekStart: Date): Promise<WeekPlan> {
  const { existingSlots, blockedDays, specialDays, strength, engagement, formatAlerts, formatPerf, topAngles } = await loadWeekContext(weekStart);
  const candidateMap = await buildCandidateMap(existingSlots);
  return buildPlanResponse(weekStart, existingSlots, blockedDays, specialDays, strength, engagement, formatAlerts, formatPerf, topAngles, candidateMap);
}

/**
 * מייצר/מרענן הצעה אוטומטית לשבוע. סלוטים שסומנו isManual לא נמחקים ולא
 * נדרסים — רק הסלוטים האוטומטיים הקיימים (אם יש) מוחלפים בהצעה חדשה.
 */
export async function generateWeeklySchedule(weekStart: Date, options: { cascade?: boolean } = {}): Promise<WeekPlan> {
  const cascade = options.cascade ?? true;
  // "תתחילי מהיום" — לא מציעים ימים שכבר עברו. אם השבוע כולו מאחורי היום
  // הנוכחי, אין שום יום להציע בו משהו — לא מוחקים ולא נוגעים בסלוטים
  // האוטומטיים הקיימים (יכולים לשאת actualStatus היסטורי), רק מחזירים את
  // התכנון הקיים כמו שהוא (getWeekPlan, בלי generate).
  const today = formatCalendarDate(new Date());
  if (formatCalendarDate(addDays(weekStart, 6)) < today) {
    return getWeekPlan(weekStart);
  }

  const { existingSlots, blockedDays, specialDays, strength, engagement, formatAlerts, formatPerf, topAngles } = await loadWeekContext(weekStart);

  const manualSlots = existingSlots.filter((s) => s.isManual);
  const autoSlotIds = existingSlots.filter((s) => !s.isManual).map((s) => s.id);
  if (autoSlotIds.length > 0) {
    await prisma.scheduledSlot.deleteMany({ where: { id: { in: autoSlotIds } } });
  }

  const blockedDateStrings = new Set(blockedDays.map((b) => formatCalendarDate(b.date)));
  const majorHolidayDateStrings = new Set(specialDays.filter((s) => s.isMajor).map((s) => s.date));
  // רק סלוט ידני עם תוכן/הערה בפועל "תופס" את היום שלו — סלוט ידני ריק לגמרי
  // (בלי תוכן ובלי הערה, למשל שיבוץ מקום שנשאר ריק) לא אמור לחסום את היום
  // מלקבל הצעה אמיתית, אחרת כל השבוע יכול להיראות "ריק" בלי סיבה.
  const manualDateStrings = new Set(
    manualSlots.filter((s) => s.platformContentId || (s.note && s.note.trim())).map((s) => formatCalendarDate(s.date))
  );

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const candidateDays = weekDays.filter((d) => {
    const iso = formatCalendarDate(d);
    return iso >= today && !blockedDateStrings.has(iso) && !majorHolidayDateStrings.has(iso) && !manualDateStrings.has(iso);
  });

  const rankedDays = [...candidateDays].sort((a, b) => {
    const sa = strength.days[a.getUTCDay()];
    const sb = strength.days[b.getUTCDay()];
    if (sa.isStrong !== sb.isStrong) return sa.isStrong ? -1 : 1;
    return (sb.avgReach ?? -1) - (sa.avgReach ?? -1);
  });

  const chosenDays = rankedDays.slice(0, Math.min(MAX_SUGGESTED_SLOTS, rankedDays.length));

  // יום לבדיקה: מבין המועמדים שלא נבחרו למעלה, זה עם הכי פחות פוסטים
  // היסטוריים (לא "חלש" — "לא נבדק") — נוסף כסלוט *נוסף* (לא מחליף אחד מהם),
  // עם ריל דווקא (כדי שאם יש סיכוי אמיתי לחשוף לקהל חדש, ננסה אותו), כי אחרת
  // אותם ימים חזקים היו נשארים לתמיד בלי הזדמנות להוכיח את עצמם.
  const chosenDateStrings = new Set(chosenDays.map((d) => formatCalendarDate(d)));
  const explorationCandidates = candidateDays.filter((d) => !chosenDateStrings.has(formatCalendarDate(d)));
  const explorationDay =
    explorationCandidates.length > 0
      ? [...explorationCandidates].sort((a, b) => strength.days[a.getUTCDay()].count - strength.days[b.getUTCDay()].count)[0]
      : null;
  if (explorationDay) chosenDays.push(explorationDay);
  const explorationDateStrings = new Set(explorationDay ? [formatCalendarDate(explorationDay)] : []);

  const strongHourBuckets = strength.hourBuckets.filter((b) => b.isStrong);
  const hourBucketRotation = strongHourBuckets.length > 0 ? strongHourBuckets : strength.hourBuckets.filter((b) => b.count > 0);
  const fallbackHour = 18;

  const readyContent = await prisma.platformContent.findMany({
    where: { status: "ready", scheduledSlot: null, type: { in: READY_TYPES } },
    include: { post: true },
    orderBy: { createdAt: "asc" },
  });

  // קטעים "מוכנים" מנושיין (סטטוס Ready) שעדיין לא נתפסו ע"י סלוט משבוע אחר
  // (ראו getUsedNotionTags) — מחולקים לפי הטייפ: "ישן" = תפקיד ה"ישן" בשבוע,
  // כל טייפ אחר (או ריק) = תפקיד "חדש". listReadySegments מחזירה [] בשקט אם
  // נושיין לא מוגדר, אז זה נופל אוטומטית למתכונת הקודמת (ראו למטה).
  const usedNotionTags = await getUsedNotionTags(parseCalendarDate(today));
  const notionReady = (await listReadySegments()).filter((r) => !usedNotionTags.has(r.tag));
  const notionNewQueue = notionReady.filter((r) => !r.typeValues.includes(NOTION_OLD_TYPE_VALUE));
  const notionOldQueue = notionReady.filter((r) => r.typeValues.includes(NOTION_OLD_TYPE_VALUE));

  // הכל מתוכנן ונעול *לפני* היצירה (לא מחושב מחדש בכל טעינה בהמשך, ראו
  // WeekSlot.recommendedType/Format/ReelCandidate/NotionSegment) — כדי שיישאר
  // תמונת מצב יציבה, ואפשר "לתפוס" הצעה כדי שהצעה של שבוע אחר לא תציע אותה
  // שוב (ראו getNextReelCandidates/getUsedNotionTags) בלי להמתין לפרסום בפועל.
  // תפיסה משבוע שכבר עבר בלי שנוצלה לא ממשיכה לחסום מועמד לתמיד (ראו
  // getUsedNotionTags) — לכן הסינון כאן מוגבל גם הוא ל-date >= today.
  const behindAlerts = [...formatAlerts].filter((a) => a.isBehind).sort((a, b) => a.monthCount - b.monthCount);
  const claimedMediaIds = new Set(
    (
      await prisma.scheduledSlot.findMany({
        where: { plannedReelCandidateMediaId: { not: null }, date: { gte: parseCalendarDate(today) } },
        select: { plannedReelCandidateMediaId: true },
      })
    ).map((s) => s.plannedReelCandidateMediaId as string)
  );
  const availableCandidates = await getNextReelCandidates(chosenDays.length, claimedMediaIds);

  // תקציב רילים לכל השבוע (ליבה + בדיקה) — לפי בקשתה "ריל גג שניים". סלוט
  // הבדיקה תמיד ריל, אז הוא תמיד תופס אחד מהתקציב.
  let reelBudget = REEL_WEEKLY_CAP - (explorationDay ? 1 : 0);

  let behindIdx = 0;
  let candidateIdx = 0;
  let localIdx = 0;
  const createdSlots = [];
  for (let i = 0; i < chosenDays.length; i++) {
    const date = chosenDays[i];
    const iso = formatCalendarDate(date);
    const isExploration = explorationDateStrings.has(iso);
    // בחירת שעה: השעה הספציפית עם ההגעה הכי גבוהה בתוך הבלוק החזק (לא סתם
    // "תחילת הבלוק" — ראו bestHourInBucket, נמנע משעות שרירותיות כמו 05:00).
    const bucket = hourBucketRotation.length > 0 ? hourBucketRotation[i % hourBucketRotation.length] : null;
    const hour = bucket ? bestHourInBucket(strength.hourly, bucket.startHour) : fallbackHour;
    // תפקיד הסלוט: שני הראשונים (בין השלושה של הליבה) "חדש", השלישי "ישן" —
    // ראו NEW_ROLE_COUNT. לסלוט הבדיקה אין תפקיד (הוא תוסף, לא אחד מהשלושה).
    const role: "new" | "old" | null = isExploration ? null : i < NEW_ROLE_COUNT ? "new" : "old";

    let content = null as (typeof readyContent)[number] | null;
    let notionPick: NotionReadyRow | null = null;
    if (role === "new" && localIdx < readyContent.length) {
      content = readyContent[localIdx];
      localIdx++;
    } else if (role === "new" && notionNewQueue.length > 0) {
      notionPick = notionNewQueue.shift() ?? null;
    } else if (role === "old" && notionOldQueue.length > 0) {
      notionPick = notionOldQueue.shift() ?? null;
    }

    let plannedType: "instagram_reel" | "instagram_carousel" | null = null;
    let plannedFormat: "letter" | "tip" | null = null;
    let plannedReelCandidateMediaId: string | null = null;
    let plannedNotionTag: string | null = null;
    let plannedNotionPreview: string | null = null;
    let plannedNotionPageUrl: string | null = null;

    if (content) {
      // תוכן שכבר קיים ומוכן — הפורמט שלו קבוע, רק מנכים מהתקציב אם הוא בעצמו ריל.
      if (content.type === "instagram_reel") reelBudget--;
    } else if (notionPick) {
      // קטע טקסט טרי מנושיין — עדיין לא הוכיח את עצמו כתוכן מוביל, אז לא
      // הופך לריל (ריל רק מהרשימה המומלצת, ראו למטה) — קרוסלה כברירת מחדל.
      // הבחירה מהתור (new/old) היא "shift" — כלומר תמיד לפי הסדר שחזר מנושיין
      // (ראו listReadySegments), בלי לחפש קדימה קטע "נוח" יותר — גם בין
      // הישנים וגם בין החדשים. אם לקטע שנבחר יש גם "מכתב"/"טיפ" בעמודת
      // Type (למשל קטע ישן שהוא גם מכתב) — זה עדיין משתקף בפורמט המומלץ.
      plannedType = "instagram_carousel";
      plannedNotionTag = notionPick.tag;
      plannedNotionPageUrl = notionPick.pageUrl;
      plannedNotionPreview = await getShortPreview(notionPick.pageId);
      plannedFormat = notionPick.typeValues.includes("מכתב") ? "letter" : notionPick.typeValues.includes("טיפ") ? "tip" : null;
    } else {
      // אין תוכן מוכן וגם אין קטע טרי מנושיין — חוזרים למתכונת הקודמת: רק
      // כותבים מה *סוג* הפוסט הדרוש, לא מה תוכנו. פוסט "ישן" תמיד מתפרסם
      // כפוסט (קרוסלה) ולא כריל; ריל בכלל רק אם יש מועמד אמיתי מ"הרילים
      // הבאים" בדשבורד (תוכן שכבר הוכיח את עצמו) — לא ריל "סתם", לפי בקשתה.
      const canOfferReel = role !== "old" && reelBudget > 0 && candidateIdx < availableCandidates.length;
      plannedType = canOfferReel ? "instagram_reel" : "instagram_carousel";
      if (canOfferReel) {
        plannedReelCandidateMediaId = availableCandidates[candidateIdx].mediaId;
        candidateIdx++;
        reelBudget--;
      }
      if (behindIdx < behindAlerts.length) {
        plannedFormat = behindAlerts[behindIdx].format;
        behindIdx++;
      }
    }

    const note = isExploration
      ? plannedType === "instagram_reel"
        ? "🔍 יום לבדיקה — פחות מפורסם היסטורית; ריל כאן יכול להרחיב חשיפה לקהל חדש"
        : "🔍 יום לבדיקה — פחות מפורסם היסטורית; אין כרגע מועמד ריל מומלץ, אז קרוסלה"
      : role === "old" && !content && !notionPick
        ? "📜 פוסט ישן — אין קטע מוכן (סטטוס Ready, טייפ 'ישן') בנושיין כרגע"
        : null;

    const created = await prisma.scheduledSlot.create({
      data: {
        date,
        hour,
        isManual: false,
        platformContentId: content?.id ?? null,
        note,
        plannedType,
        plannedFormat,
        plannedReelCandidateMediaId,
        plannedNotionTag,
        plannedNotionPreview,
        plannedNotionPageUrl,
      },
      include: { platformContent: { include: { post: true } } },
    });
    createdSlots.push(created);

    // אם התגית/המועמד הזה "נתפס" קודם בסלוט משבוע שכבר עבר ולא נוצל (ראו
    // getUsedNotionTags/claimedMediaIds — תפיסה משבוע שעבר לא נחשבת "תפוסה"
    // יותר, כדי לא לחסום תוכן לתמיד) — הסלוט הישן מנוקה עכשיו, כדי שלא
    // תוצג פעמיים אותה המלצה בדיוק (גם בשבוע שעבר וגם כאן).
    if (plannedNotionTag) {
      await prisma.scheduledSlot.updateMany({
        where: { plannedNotionTag, id: { not: created.id } },
        data: { plannedNotionTag: null, plannedNotionPreview: null, plannedNotionPageUrl: null },
      });
    }
    if (plannedReelCandidateMediaId) {
      await prisma.scheduledSlot.updateMany({
        where: { plannedReelCandidateMediaId, id: { not: created.id } },
        data: { plannedReelCandidateMediaId: null },
      });
    }
  }

  // השבוע הזה תפס את מה שהוא צריך (claimedMediaIds/usedNotionTags עדכניים
  // ב-DB) — עכשיו מרעננים כל שבוע *עתידי* שכבר נוצר אוטומטית, כדי שהוא
  // יתעדכן ולא יישאר עם מועמד/קטע שהשבוע הזה עכשיו תפס, ולפי בקשתה שהשבוע
  // הקרוב מקבל עדיפות בלי קשר לסדר שבו לוחצים "צרי הצעה" על כל שבוע. cascade
  // false מונע כפילות עבודה — ראו generateMonthlySchedule, שכבר עובר על
  // השבועות בסדר כרונולוגי ולא צריך את הריענון הזה בעצמו.
  if (cascade) {
    const laterWeekStarts = await getLaterAutoGeneratedWeekStarts(weekStart);
    for (const laterWeekStart of laterWeekStarts) {
      await generateWeeklySchedule(laterWeekStart, { cascade: false });
    }
  }

  const allSlots = [...manualSlots, ...createdSlots];
  const candidateMap = await buildCandidateMap(allSlots);
  return buildPlanResponse(weekStart, allSlots, blockedDays, specialDays, strength, engagement, formatAlerts, formatPerf, topAngles, candidateMap);
}

/** שבועות עתידיים (אחרי weekStart) שיש בהם כבר סלוט אוטומטי — למי שצריך ריענון לאחר שהשבוע הקרוב תפס תוכן/מועמדים. */
async function getLaterAutoGeneratedWeekStarts(afterWeekStart: Date): Promise<Date[]> {
  const rows = await prisma.scheduledSlot.findMany({
    where: { isManual: false, date: { gt: addDays(afterWeekStart, 6) } },
    select: { date: true },
  });
  const starts = new Set(rows.map((r) => formatCalendarDate(getWeekStart(r.date))));
  return [...starts].sort().map((iso) => parseCalendarDate(iso));
}

function buildPlanResponse(
  weekStart: Date,
  slotsRaw: {
    id: string;
    date: Date;
    hour: number;
    isManual: boolean;
    note: string | null;
    plannedType: string | null;
    plannedFormat: string | null;
    plannedReelCandidateMediaId: string | null;
    plannedNotionTag: string | null;
    plannedNotionPreview: string | null;
    plannedNotionPageUrl: string | null;
    actualStatus: string;
    actualAt: Date | null;
    platformContent:
      | { id: string; type: string; text: string | null; postId: string; hashtags: string; post: { hashtags: string; notionUrl: string | null } }
      | null;
  }[],
  blockedDays: { id: string; date: Date; note: string | null }[],
  specialDays: SpecialDay[],
  strength: StrengthData,
  engagement: EngagementData,
  formatAlerts: FormatGap[],
  formatPerf: FormatPerformance,
  topAngles: ContentAngle[],
  candidateMap: Map<string, NextReelCandidate>
): WeekPlan {
  const slots = slotsRaw
    .map((row) => toSlot(row, strength, engagement, candidateMap))
    .sort((a, b) => (a.date === b.date ? a.hour - b.hour : a.date.localeCompare(b.date)));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const iso = formatCalendarDate(d);
    const blocked = blockedDays.find((b) => formatCalendarDate(b.date) === iso) ?? null;
    return {
      date: iso,
      label: WEEKDAY_FULL_LABELS[i],
      specialDays: specialDays.filter((s) => s.date === iso),
      blockedNote: blocked?.note ?? null,
      blockedDayId: blocked?.id ?? null,
    };
  });

  const reels = slots.filter((s) => (s.content ? s.content.type === "instagram_reel" : s.recommendedType === "instagram_reel")).length;
  const newNeeded = slots.filter((s) => !s.content).length;
  const existingReady = slots.filter((s) => !!s.content).length;
  const totalSamples = strength.days.reduce((sum, d) => sum + d.count, 0);

  return {
    weekStart: formatCalendarDate(weekStart),
    days,
    slots,
    strength,
    engagement,
    formatAlerts,
    methodology: buildMethodologyLines(strength, formatPerf, totalSamples),
    topAngles,
    summary: {
      totalPosts: slots.length,
      reels,
      newNeeded,
      existingReady,
    },
  };
}
