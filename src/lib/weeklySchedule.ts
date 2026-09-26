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
  summarizeHourTesting,
  WEEKDAY_FULL_LABELS,
  israelDayAndHour,
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
import { findSegmentTypeByTag, getShortPreview, listReadySegments, type NotionReadyRow } from "@/server/notion";
import { syncLatestInstagramMedia } from "@/server/settings/meta";

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

/**
 * תאריך לוח (YYYY-MM-DD) לפי השעון בישראל, לא UTC — לשימוש רק כשממירים
 * timestamp אמיתי של פרסום באינסטגרם ליום לוח (ראו reconcileScheduleWithInstagram):
 * הפרש 2-3 שעות מ-UTC יכול להזיז פרסום סמוך לחצות ליום אחר לגמרי. שאר
 * הכלי משתמש ב-formatCalendarDate (UTC) כי הוא סתם תווית לוח, לא נגזר
 * מזמן אמיתי — כאן זה נגזר מזמן אמיתי, אז חשוב שהיום יהיה נכון בפועל.
 */
function israelCalendarDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
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
/**
 * שורות מקוצרות, "ציוריות" (בסגנון "X 🟰 Y") — לא פסקאות הסבר — לפי בקשה
 * מפורשת שהחלק הזה יהיה קריא בעין אחת ולא טקסט ארוך. הפירוט המלא נשאר בקוד
 * (ראו generateWeeklySchedule), זו רק תמצית לתצוגה.
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
      ? `⚡ יום חזק 🟰 הגעה ממוצעת גבוהה (2+ פוסטים) — ${strongDays.map((d) => d.name).join(", ")}`
      : `⚡ יום חזק 🟰 עדיין אין מספיק נתונים (מתוך ${totalSamples} פוסטים)`
  );

  const strongHours = strength.hourBuckets.filter((h) => h.isStrong);
  lines.push(
    strongHours.length > 0
      ? `🕐 שעה חזקה 🟰 בלוק 4 שעות + הרגע החזק בתוכו — ${strongHours.map((h) => h.name).join(", ")}`
      : `🕐 שעה חזקה 🟰 עדיין אין מספיק נתונים`
  );

  lines.push(`🔍 יום בדיקה 🟰 הכי פחות היסטוריה + תוסף לשבוע (לא מחליף) — לבדוק פוטנציאל חשיפה לקהל חדש`);

  const { reel, carousel } = formatPerf;
  const reelAvg = reel.avgReach !== null ? Math.round(reel.avgReach) : null;
  const carouselAvg = carousel.avgReach !== null ? Math.round(carousel.avgReach) : null;
  lines.push(
    `🎬 ריל 🟰 רק עם מועמד מוכח מ"הרילים הבאים"${reelAvg !== null ? ` (הגעה ${reelAvg})` : ""} | 📄 קרוסלה 🟰 ברירת מחדל + כל פוסט "ישן"${carouselAvg !== null ? ` (הגעה ${carouselAvg})` : ""}`
  );

  lines.push(`📅 הרכב שבועי 🟰 2 חדש + 1 ישן + 1 בדיקה | מקס' 2 רילים בשבוע`);

  lines.push(`♻️ ההמלצה מתעדכנת אוטומטית לפי כל נתון חדש שמסתנכרן מאינסטגרם`);

  return lines;
}

export interface SlotContentPreview {
  postId: string;
  type: string;
  text: string | null;
  // התגית הראשונה שאינה #אחתביום — לכותרת בחלונית הפרטים, ראו firstRealHashtag.
  titleTag: string | null;
  notionUrl: string | null;
  // פורמט בפועל של הפוסט המקושר (Post.aiFormat) — לא ההמלצה, התוכן האמיתי.
  format: "letter" | "tip" | null;
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
  // מעורבות (לייקים+תגובות) — נפרד מ-dayIsStrong (הגעה), ראו EngagementData.
  dayIsEngaging: boolean;
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
  // הסבר קונקרטי לשבוע *הזה* בדיוק — לא הכללים הגלובליים (methodology),
  // אלא מה בפועל נבחר לכל סלוט ולמה. ראו buildWeekReasonLines.
  reasonLines: string[];
  topAngles: ContentAngle[];
  summary: { totalPosts: number; reels: number; newNeeded: number; existingReady: number };
}

/**
 * הסבר קצר וקונקרטי לכל סלוט בשבוע הזה — למה נבחר היום/השעה/הפורמט הספציפי,
 * לא רק הכללים הכלליים (ראו buildMethodologyLines). לפי בקשה מפורשת להבין
 * את השיקולים בכל שבוע, לא רק פעם אחת גלובלית.
 */
function buildWeekReasonLines(days: { date: string; label: string }[], slots: WeekSlot[]): string[] {
  if (slots.length === 0) return ["השבוע הזה אין עדיין אף שיבוץ."];
  const dayLabelByDate = new Map(days.map((d) => [d.date, d.label]));
  return [...slots]
    .sort((a, b) => (a.date === b.date ? a.hour - b.hour : a.date.localeCompare(b.date)))
    .map((s) => {
      const label = dayLabelByDate.get(s.date) ?? s.date;
      const head = `${label} (${s.date.slice(5)}, ${String(s.hour).padStart(2, "0")}:00)`;
      const parts: string[] = [];

      if (s.actualStatus === "done") return `${head} 🟰 ✅`;

      if (s.note?.startsWith("🔍")) parts.push("🔍");
      else if (s.note?.startsWith("🎁")) parts.push("🎁");
      else if (s.dayIsStrong) parts.push("⚡");
      if (s.note?.includes("🕐")) parts.push("🕐");

      if (s.recommendedReelCandidate) parts.push(`🎬 ${s.recommendedReelCandidate.caption?.slice(0, 30) ?? "ללא כיתוב"}`);
      else if (s.recommendedNotionSegment) {
        const tag = s.recommendedNotionSegment.tag;
        parts.push(`📓 ${tag.startsWith("#") ? tag : `#${tag}`}`);
      } else if (s.content) parts.push("📦");
      else parts.push(s.recommendedType === "instagram_reel" ? "🎬" : "📄");

      if (s.recommendedFormat) parts.push(s.recommendedFormat === "letter" ? "✉️" : "💡");

      return `${head} 🟰 ${parts.join(" ")}`;
    });
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
    | {
        id: string;
        type: string;
        text: string | null;
        postId: string;
        hashtags: string;
        post: { hashtags: string; notionUrl: string | null; aiFormat: string | null };
      }
    | null;
}, strength: StrengthData, engagement: EngagementData, candidateMap: Map<string, NextReelCandidate>): WeekSlot {
  const dateStr = formatCalendarDate(row.date);
  const dayOfWeek = row.date.getUTCDay();
  return {
    slotId: row.id,
    date: dateStr,
    hour: row.hour,
    isManual: row.isManual,
    note: row.note,
    dayIsStrong: strength.days[dayOfWeek]?.isStrong ?? false,
    dayIsEngaging: engagement.days[dayOfWeek]?.isStrong ?? false,
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
          format: row.platformContent.post.aiFormat as "letter" | "tip" | null,
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
  // מסנכרנת בפועל את השבוע הזה מול מה שכבר פורסם באינסטגרם (ראו
  // reconcileScheduleWithInstagram) *לפני* כל החלטה אחרת — כדי שהצעה חדשה
  // (כאן, לא רק ב"סנכרון בפועל" הנפרד בלוח החודשי) לא תציע שוב תגית/תוכן
  // שכבר פורסם היום, ותסמן את מה שכבר קרה. גם על שבוע שכבר עבר לגמרי (ראו
  // ההגנה למטה) — כדי שהמידע יהיה נכון גם אם היא לא ביקרה בלוח החודשי.
  await reconcileScheduleWithInstagram(weekStart, addDays(weekStart, 7));

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
  // רק סלוט ידני עם תוכן/הערה/הצעה מתוכננת בפועל "תופס" את היום שלו — סלוט
  // ידני ריק לגמרי (בלי תוכן, בלי הערה, ובלי המלצה מתוכננת, למשל שיבוץ מקום
  // שנשאר ריק) לא אמור לחסום את היום מלקבל הצעה אמיתית, אחרת כל השבוע יכול
  // להיראות "ריק" בלי סיבה. סלוט "נעול" (🔒) שכן נושא המלצה (פורמט/ריל/קטע
  // נושיין) חייב לתפוס את היום, אחרת הרענון יכול ליצור סלוט נוסף בדיוק באותה
  // שעה — זה מה שקרה בבאג המקורי.
  const manualDateStrings = new Set(
    manualSlots
      .filter(
        (s) =>
          s.platformContentId ||
          (s.note && s.note.trim()) ||
          s.plannedType ||
          s.plannedFormat ||
          s.plannedReelCandidateMediaId ||
          s.plannedNotionTag
      )
      .map((s) => formatCalendarDate(s.date))
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

  // מכסת "חדש/ישן/ריל" לשבוע הזה מפחיתה קודם את מה שכבר פורסם *בפועל*
  // השבוע (actualStatus="done", ראו reconcileScheduleWithInstagram) *וגם* כל
  // שיבוץ נעול (isManual) עם המלצה אמיתית שעדיין pending (למשל אחרי גרירה/
  // נעילה ידנית) — אחרת ההצעה ממשיכה להציע מכסה מלאה נוספת על גבי מה שכבר
  // קיים/נעול, ומציפה בעוד סלוטים "חדש" שכבר לא נחוצים.
  const countedSlotsThisWeek = existingSlots.filter(
    (s) => s.actualStatus === "done" || (s.isManual && (s.plannedType || s.plannedNotionTag || s.plannedReelCandidateMediaId))
  );
  let realReelCount = 0;
  let realOldCount = 0;
  let realNewCount = 0;
  for (const s of countedSlotsThisWeek) {
    if (s.plannedType === "instagram_reel") realReelCount++;
    const typeValues = s.plannedNotionTag ? await findSegmentTypeByTag(s.plannedNotionTag) : null;
    if (typeValues?.includes(NOTION_OLD_TYPE_VALUE)) realOldCount++;
    else realNewCount++;
  }
  const remainingNewSlots = Math.max(0, NEW_ROLE_COUNT - realNewCount);
  const oldRoleTarget = MAX_SUGGESTED_SLOTS - NEW_ROLE_COUNT;
  const remainingOldSlots = Math.max(0, oldRoleTarget - realOldCount);
  const remainingCoreSlots = remainingNewSlots + remainingOldSlots;

  const chosenDays = rankedDays.slice(0, Math.min(remainingCoreSlots, rankedDays.length));

  // אם אף אחד מהימים הנבחרים לא "חזק" (ההגעה לא הכריעה כלום, המיון היה
  // שרירותי) — מעדיפים לפזר בין שני התאריכים "חדש" ולא לצמצם אותם לימים
  // רצופים: פוסט "ישן" (שחלק מהעוקבים כבר ראו) מתאים כ"מפריד" ביניהם. חוזק
  // אמיתי גובר על פיזור — לא נוגעים בסדר אם יש הכרעה לפי הגעה, לפי בקשתה.
  if (remainingNewSlots === 2 && remainingOldSlots === 1 && chosenDays.length >= 3) {
    const core = chosenDays.slice(0, 3);
    const noneStrong = core.every((d) => !strength.days[d.getUTCDay()].isStrong);
    if (noneStrong) {
      const sortedByDate = [...core].sort((a, b) => a.getTime() - b.getTime());
      const middle = sortedByDate[1];
      const others = sortedByDate.filter((d) => d !== middle);
      chosenDays.splice(0, 3, ...others, middle);
    }
  }

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
  const coreLen = chosenDays.length;
  if (explorationDay) chosenDays.push(explorationDay);
  const explorationDateStrings = new Set(explorationDay ? [formatCalendarDate(explorationDay)] : []);

  // בדיקת שעה: לפחות שעה אחת שעדיין אין לה שום פוסט היסטורי (untestedHours)
  // נבדקת השבוע בפועל, לא רק שעות שכבר הוכחו כחזקות (hourBucketRotation) —
  // לפי בקשה מפורשת שלא נמשיך "להמר" רק על מה שכבר נבדק. מעדיפים לתלות את
  // הבדיקה בסלוט ה"ישן" האחרון אם יש (תוכן שחלק מהעוקבים כבר ראו — הימור
  // פחות יקר על שעה לא ידועה מאשר תוכן חדש), ואם אין יום "ישן" השבוע —
  // בסלוט האחרון שנבחר (יכול להיות גם יום הבדיקה עצמו).
  const untestedHour = summarizeHourTesting(strength.hourly).untestedHours[0] ?? null;
  const hourTestIndex =
    untestedHour === null
      ? null
      : coreLen > remainingNewSlots
        ? coreLen - 1
        : chosenDays.length > 0
          ? chosenDays.length - 1
          : null;

  // מסודר לפי הגעה ממוצעת (לא לפי סדר כרונולוגי של הבלוקים!) — כדי שהסלוט
  // הראשון (i=0, בדרך כלל גם היום החזק ביותר) יזכה בבלוק השעות החזק ביותר,
  // לא סתם בבלוק הראשון בזמן. לפי בקשה מפורשת: לא לפזר בין בלוקים חזקים
  // בסדר שרירותי כשיש דירוג אמיתי ביניהם.
  const strongHourBuckets = strength.hourBuckets.filter((b) => b.isStrong).sort((a, b) => (b.avgReach ?? 0) - (a.avgReach ?? 0));
  const hourBucketRotation =
    strongHourBuckets.length > 0
      ? strongHourBuckets
      : [...strength.hourBuckets.filter((b) => b.count > 0)].sort((a, b) => (b.avgReach ?? 0) - (a.avgReach ?? 0));
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
  // "ישן": לפי סדר הכתיבה בטבלה (זמן יצירה) — חשוב לה שם. "חדש": לא לפי זמן
  // כתיבה בכלל (לא קריטי לה) — לפי שיקלול: מכתב/טיפ שמאחורי הקצב החודשי, וגם
  // נושא שכרגע "מוביל" (topAngles) מקבלים עדיפות. שני הכללים לפי בקשה מפורשת.
  const notionOldQueue = notionReady
    .filter((r) => r.typeValues.includes(NOTION_OLD_TYPE_VALUE))
    .sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  const letterBehind = formatAlerts.some((a) => a.format === "letter" && a.isBehind);
  const tipBehind = formatAlerts.some((a) => a.format === "tip" && a.isBehind);
  const leadingThemes = new Set(topAngles.map((a) => a.theme));
  function scoreNewCandidate(row: NotionReadyRow): number {
    const { format, theme } = parseNotionType(row.typeValues);
    let score = 0;
    if (format === "letter" && letterBehind) score += 2;
    if (format === "tip" && tipBehind) score += 2;
    if (theme && leadingThemes.has(theme)) score += 1;
    return score;
  }
  const notionNewQueue = notionReady
    .filter((r) => !r.typeValues.includes(NOTION_OLD_TYPE_VALUE))
    .sort((a, b) => scoreNewCandidate(b) - scoreNewCandidate(a));

  // נושא (aiTheme, מעמודת Type בנושיין) לכל יום שכבר יש לו שיבוץ אמיתי/נעול
  // השבוע — כדי לא לשבץ אותו נושא בימים רצופים (ראו pickAvoidingAdjacentTheme
  // למטה), לפי בקשה מפורשת. גיוון הוא שיקול רך — לא גובר על סדר הנושיין/חוזק.
  const dateToTheme = new Map<string, string>();
  for (const s of existingSlots) {
    if (!s.plannedNotionTag) continue;
    const typeValues = await findSegmentTypeByTag(s.plannedNotionTag);
    const theme = typeValues ? parseNotionType(typeValues).theme : null;
    if (theme) dateToTheme.set(formatCalendarDate(s.date), theme);
  }

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

  // תקציב רילים לכל השבוע (ליבה + בדיקה) — לפי בקשתה "ריל גג שניים", בניכוי
  // רילים שכבר פורסמו בפועל השבוע (realReelCount). סלוט הבדיקה, אם הופך
  // בפועל לריל, מנכה מהתקציב הזה בעצמו בהמשך (ראו reelEligible/reelBudget--
  // למטה, על אותו ענף בדיוק כמו כל סלוט אחר) — לא מנכים כאן מראש בנוסף,
  // אחרת ריל אחד נחשב פעמיים ומגביל בפועל לריל אחד בשבוע גם כשהתקציב שניים.
  let reelBudget = REEL_WEEKLY_CAP - realReelCount;

  // שעה נוכחית בישראל (לא UTC) — כמו strength.hourly עצמו (מבוסס
  // israelDayAndHour), אחרת ההשוואה בין "השעה שנבחרה" ל"השעה עכשיו" ב-
  // pickHourForDay משווה שני קני מידה שונים. כדי שהיום הנוכחי לא יקבל הצעה
  // לשעה שכבר עברה בפועל (ראו pickHourForDay למטה). לימים אחרים אין לזה השפעה.
  const currentHour = israelDayAndHour(new Date()).hour;
  function pickHourForDay(iso: string, i: number): number {
    // בחירת שעה: השעה הספציפית עם ההגעה הכי גבוהה בתוך הבלוק החזק (לא סתם
    // "תחילת הבלוק" — ראו bestHourInBucket, נמנע משעות שרירותיות כמו 05:00).
    const bucket = hourBucketRotation.length > 0 ? hourBucketRotation[i % hourBucketRotation.length] : null;
    const base = bucket ? bestHourInBucket(strength.hourly, bucket.startHour) : fallbackHour;
    if (iso !== today || base > currentHour) return base;
    // הבלוק החזק/שעת ברירת המחדל כבר עברו היום — קופצים לשעה העגולה הבאה
    // שעדיין לא עברה, לכל היותר 23:00 (עדיין היום הזה, לא מוצע ליום אחר בגלל זה).
    return Math.min(23, currentHour + 1);
  }

  let behindIdx = 0;
  let candidateIdx = 0;
  let localIdx = 0;
  const createdSlots = [];
  for (let i = 0; i < chosenDays.length; i++) {
    const date = chosenDays[i];
    const iso = formatCalendarDate(date);
    const isExploration = explorationDateStrings.has(iso);
    // אם השעה הלא-נבדקת עדיין לא עברה היום (אם זה היום הנוכחי) — משתמשים
    // בה במקום בבלוק החזק הרגיל; אחרת חוזרים להתנהגות הרגילה (ראו pickHourForDay).
    const isHourTest = i === hourTestIndex && untestedHour !== null && !(iso === today && untestedHour <= currentHour);
    const hour = isHourTest ? untestedHour! : pickHourForDay(iso, i);
    // תפקיד הסלוט: לפי remainingNewSlots/remainingOldSlots (כבר מנוכה מה
    // שפורסם בפועל השבוע, ראו למעלה) — לא NEW_ROLE_COUNT הגולמי. לסלוט
    // הבדיקה אין תפקיד (הוא תוסף, לא אחד מהשלושה).
    const role: "new" | "old" | null = isExploration ? null : i < remainingNewSlots ? "new" : "old";

    // ליום בדיקה יש עדיפות לריל (ראו למטה) — תוכן/קטע נושיין נבדק בשבילו רק
    // אם אין מועמד ריל פנוי, כדי לא להעדיף קרוסלה מוכנה על פני הזדמנות
    // אמיתית לבדוק ריל ביום הזה (המטרה המקורית של יום הבדיקה).
    const explorationHasReel = isExploration && reelBudget > 0 && candidateIdx < availableCandidates.length;

    let content = null as (typeof readyContent)[number] | null;
    let notionPick: NotionReadyRow | null = null;
    if (role === "new" && localIdx < readyContent.length) {
      content = readyContent[localIdx];
      localIdx++;
    } else if (role === "new" && notionNewQueue.length > 0) {
      notionPick = pickAvoidingAdjacentTheme(notionNewQueue, iso, dateToTheme);
    } else if (role === "old" && notionOldQueue.length > 0) {
      notionPick = pickAvoidingAdjacentTheme(notionOldQueue, iso, dateToTheme);
    } else if (isExploration && !explorationHasReel && localIdx < readyContent.length) {
      // יום לבדיקה בלי מועמד ריל פנוי — עדיין מעדיף תוכן/קטע שממתין על פני
      // "צריך פוסט" גנרי (ראו בהמשך), בדיוק כמו תפקיד "חדש". מגיע רק אחרי
      // ששני התפקידים בליבה (חדש/ישן) כבר לקחו את מה שהם צריכים באיטרציה
      // שלהם (יום הבדיקה נמצא בסוף chosenDays, ראו למעלה) — לא "גונב" מהם.
      content = readyContent[localIdx];
      localIdx++;
    } else if (isExploration && !explorationHasReel && notionNewQueue.length > 0) {
      // רק התור ה"חדש", לא ה"ישן" — יום הבדיקה נועד לבדוק חשיפה ל*קהל חדש*,
      // ותוכן "ישן" (שחלק מהעוקבים כבר ראו) פוגע בדיוק בזה, לפי בקשה מפורשת.
      notionPick = pickAvoidingAdjacentTheme(notionNewQueue, iso, dateToTheme);
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
      // הבחירה מהתור (new/old) היא לפי הסדר שחזר מנושיין (ראו listReadySegments),
      // עם חריגה יחידה: מדלגת קדימה בתור אם הראשון מתנגש בנושא עם יום סמוך
      // (ראו pickAvoidingAdjacentTheme) — לא "נוחות" כללית, רק גיוון נושאי.
      // אם לקטע שנבחר יש גם "מכתב"/"טיפ" בעמודת Type (למשל קטע ישן שהוא גם
      // מכתב) — זה עדיין משתקף בפורמט המומלץ.
      plannedType = "instagram_carousel";
      plannedNotionTag = notionPick.tag;
      plannedNotionPageUrl = notionPick.pageUrl;
      plannedNotionPreview = await getShortPreview(notionPick.pageId);
      plannedFormat = notionPick.typeValues.includes("מכתב") ? "letter" : notionPick.typeValues.includes("טיפ") ? "tip" : null;
      const pickedTheme = parseNotionType(notionPick.typeValues).theme;
      if (pickedTheme) dateToTheme.set(iso, pickedTheme);
    } else {
      // אין תוכן מוכן וגם אין קטע טרי מנושיין. פוסט "ישן" תמיד מתפרסם כפוסט
      // (קרוסלה) ולא כריל, ואם תקציב הריל השבועי כבר נוצל — גם כקרוסלה. אבל
      // אם התקציב עדיין פנוי (role!=old, reelBudget>0) והפער הוא רק שאין
      // *כרגע* מועמד קונקרטי מ"הרילים הבאים" — נשאר "צריך ריל" (placeholder,
      // בלי מועמד) ולא קרוסלה: התקציב השבועי ל-2 רילים הוא התחייבות, לא
      // הצעה שמתכווצת רק כי הדשבורד ריק כרגע (לפי בקשה מפורשת). התקציב עדיין
      // נחשב "תפוס" כאן בכל מקרה, כדי שלא ננסה יותר מ-2 סלוטי-ריל בפועל בשבוע.
      const reelEligible = role !== "old" && reelBudget > 0;
      const canOfferReel = reelEligible && candidateIdx < availableCandidates.length;
      plannedType = reelEligible ? "instagram_reel" : "instagram_carousel";
      if (reelEligible) reelBudget--;
      if (canOfferReel) {
        plannedReelCandidateMediaId = availableCandidates[candidateIdx].mediaId;
        candidateIdx++;
      }
      if (behindIdx < behindAlerts.length) {
        plannedFormat = behindAlerts[behindIdx].format;
        behindIdx++;
      }
    }

    const baseNote = isExploration
      ? plannedReelCandidateMediaId
        ? "🔍 יום לבדיקה — פחות מפורסם היסטורית; ריל כאן יכול להרחיב חשיפה לקהל חדש"
        : plannedType === "instagram_reel"
          ? "🔍 יום לבדיקה — פחות מפורסם היסטורית; עדיין אין מועמד ריל מומלץ — צריך למצוא/להכין אחד"
          : "🔍 יום לבדיקה — פחות מפורסם היסטורית; אין כרגע מועמד ריל מומלץ, אז קרוסלה"
      : role === "old" && !content && !notionPick
        ? "📜 פוסט ישן — אין קטע מוכן (סטטוס Ready, טייפ 'ישן') בנושיין כרגע"
        : null;
    const hourTestNote = isHourTest ? `🕐 גם בדיקת שעה שעדיין לא נבדקה בכלל (${String(hour).padStart(2, "0")}:00)` : null;
    const note = [baseNote, hourTestNote].filter((v): v is string => !!v).join(" · ") || null;

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

  // יום חזק שנשאר בלי שום שיבוץ השבוע (המכסה הבסיסית לא הגיעה אליו, למשל
  // בגלל שיבוצים ידניים ישנים שתפסו כבר את המכסה) — אם עדיין יש תקציב ריל
  // פנוי שלא נוצל עד כאן, מוסיפה לו ריל בפני עצמו, כתוסף. לא משנה שום כלל
  // קיים (מכסת חדש/ישן, בחירת יום הבדיקה) — רק ממלאת תקציב שכבר קיים ולא
  // נוצל, כדי שיום חזק לא יישאר ריק סתם. לפי בקשה מפורשת.
  const usedDateStrings = new Set(chosenDays.map((d) => formatCalendarDate(d)));
  const leftoverStrongDays = candidateDays
    .filter((d) => !usedDateStrings.has(formatCalendarDate(d)) && strength.days[d.getUTCDay()].isStrong)
    .sort((a, b) => (strength.days[b.getUTCDay()].avgReach ?? -1) - (strength.days[a.getUTCDay()].avgReach ?? -1));

  for (const date of leftoverStrongDays) {
    if (reelBudget <= 0) break;
    const iso = formatCalendarDate(date);
    const hour = pickHourForDay(iso, chosenDays.length);
    reelBudget--;
    let bonusReelCandidateMediaId: string | null = null;
    if (candidateIdx < availableCandidates.length) {
      bonusReelCandidateMediaId = availableCandidates[candidateIdx].mediaId;
      candidateIdx++;
    }
    const bonusSlot = await prisma.scheduledSlot.create({
      data: {
        date,
        hour,
        isManual: false,
        platformContentId: null,
        note: "🎁 יום חזק שנשאר בלי שיבוץ במכסה הרגילה — נוסף כאן ריל כדי לא להחמיץ אותו",
        plannedType: "instagram_reel",
        plannedFormat: null,
        plannedReelCandidateMediaId: bonusReelCandidateMediaId,
        plannedNotionTag: null,
        plannedNotionPreview: null,
        plannedNotionPageUrl: null,
      },
      include: { platformContent: { include: { post: true } } },
    });
    createdSlots.push(bonusSlot);
    chosenDays.push(date);
    if (bonusReelCandidateMediaId) {
      await prisma.scheduledSlot.updateMany({
        where: { plannedReelCandidateMediaId: bonusReelCandidateMediaId, id: { not: bonusSlot.id } },
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

function mediaTypeToPlannedType(mediaType: string): "instagram_reel" | "instagram_carousel" | null {
  if (mediaType === "VIDEO") return "instagram_reel";
  if (mediaType === "CAROUSEL_ALBUM") return "instagram_carousel";
  return null; // IMAGE בודדת — לא בשימוש בזרימת העבודה שלה, לא ניתן להתאמה (כמו mediaTypeToLocalType ב-server/settings/meta.ts).
}

export function extractCaptionHashtags(caption: string | null): string[] {
  if (!caption) return [];
  const matches = caption.match(/#[^\s#@]+/g) ?? [];
  return matches.filter((t) => t !== ALWAYS_FIRST_HASHTAG);
}

function normalizeTagText(t: string): string {
  return t.replace(/^#/, "").trim().toLowerCase();
}

/** כמו applyNotionTypeValue ב-posts/new/page.tsx, אבל בצד השרת — לשימוש ב-reconcileMonthWithInstagram. */
function parseNotionType(typeValues: string[]): { format: "letter" | "tip" | null; theme: string | null; isOld: boolean } {
  const format = typeValues.includes("טיפ") ? "tip" : typeValues.includes("מכתב") ? "letter" : null;
  const isOld = typeValues.includes(NOTION_OLD_TYPE_VALUE);
  const theme = typeValues.map((v) => v.trim()).find((v) => v && v !== "טיפ" && v !== "מכתב" && v !== NOTION_OLD_TYPE_VALUE) ?? null;
  return { format, theme, isOld };
}

/**
 * בוחרת מתוך התור (new/old) קטע שלא חופף בנושא (aiTheme) עם היום שלפני/אחרי
 * בשבוע — כדי לא לשבץ שני תכנים באותו נושא בימים רצופים, לפי בקשה מפורשת.
 * גיוון הוא שיקול *רך*: אם כל התור חופף (או אין העדפה), נכנעת וחוזרת לראש
 * התור, כמו התנהגות ה-shift המקורית — לא מוותרת על סדר הנושיין בשביל גיוון.
 * משנה את queue במקום (splice), בדיוק כמו .shift().
 */
function pickAvoidingAdjacentTheme(queue: NotionReadyRow[], iso: string, dateToTheme: Map<string, string>): NotionReadyRow | null {
  if (queue.length === 0) return null;
  const prevIso = formatCalendarDate(addDays(parseCalendarDate(iso), -1));
  const nextIso = formatCalendarDate(addDays(parseCalendarDate(iso), 1));
  const neighborThemes = new Set([dateToTheme.get(prevIso), dateToTheme.get(nextIso)].filter((t): t is string => !!t));
  const idx =
    neighborThemes.size === 0
      ? 0
      : queue.findIndex((r) => {
          const theme = parseNotionType(r.typeValues).theme;
          return !theme || !neighborThemes.has(theme);
        });
  const pickIdx = idx === -1 ? 0 : idx;
  return queue.splice(pickIdx, 1)[0] ?? null;
}

export interface ReconcileResult {
  checkedDays: number;
  matchedSlots: number;
  createdSlots: number;
  formatsClassified: number;
  deletedPlaceholders: number;
}

/**
 * אם עדיין לא היה סנכרון דשבורד היום (ProfileSettings.lastDashboardSyncAt) —
 * מסנכרנת כמה פוסטים אחרונים (סנכרון "מהיר", לא הסנכרון המלא של הדשבורד),
 * כדי שסנכרון בפועל/תכנון שבועי יראה גם פרסום שקרה היום בלי שהיא ביקרה
 * בהגדרות/דשבורד בעצמה קודם. אם כבר סונכרן היום — לא מושכת שוב (לפי בקשתה
 * לבדוק קודם ולא למשוך מה שכבר נמשך). לא זורקת אם אין חיבור פעיל/כשל ברשת —
 * ממשיכה עם מה שכבר יש במטמון.
 */
// לא "פעם ביום" — היא יכולה לפרסם כמה פעמים באותו יום, כולל אחרי סנכרון
// קודם מאותו יום. שעה נותנת מרווח סביר בלי למשוך שוב על כל לחיצה, בלי לפספס
// פרסום חדש מהשעה האחרונה.
const SYNC_FRESHNESS_MS = 60 * 60 * 1000;
async function ensureTodaySynced(): Promise<void> {
  const profile = await prisma.profileSettings.findUnique({ where: { id: "default" } });
  if (profile?.lastDashboardSyncAt && Date.now() - profile.lastDashboardSyncAt.getTime() < SYNC_FRESHNESS_MS) return;
  try {
    await syncLatestInstagramMedia(8);
  } catch {
    // אין חיבור פעיל ל-Meta / כשל ברשת — לא עוצרים את הסנכרון בפועל בגלל זה.
  }
}

/**
 * מתאימה בין פוסטים אמיתיים שכבר פורסמו (InstagramMedia — מהמטמון המקומי,
 * ומרעננת אותו בעצמה ל"היום" אם עוד לא סונכרן, ראו ensureTodaySynced) לבין
 * שיבוצים בתכנון (ScheduledSlot) של אותו יום, כדי שהלוח ישקף מה שבאמת
 * פורסם: מסמנת actualStatus="done" עם השעה/תגית/סוג האמיתיים, ואם אין
 * שיבוץ תואם כלל יוצרת אחד. גם מסווגת פורמט/נושא (InstagramMedia.aiFormat/
 * aiTheme) לפי עמודת Type בנושיין כשאין להם עדיין סיווג ממקור אחר (פוסט
 * מקומי מקושר) — כדי שמדדי הקצב החודשי (מכתב/טיפ) ו"מוביל כרגע" ישקפו גם
 * תוכן שפורסם ישר מנושיין, בלי שנוצר פוסט בכלי בכלל. ימים שעברו לגמרי
 * נבדקים פעם אחת בלבד (ReconciledDay) — אבל היום הנוכחי נבדק בכל הרצה, גם
 * אם כבר "סומן", כי עוד יכול להתפרסם בו משהו בין לחיצה ללחיצה. בסוף מוחקת
 * גם כל "צריך ריל/פוסט" (או הערה) בלי תוכן אמיתי שנשאר לא ממומש בימים
 * שעברו *לגמרי* (לא היום) — לפי בקשה מפורשת להשאיר בימים שעברו רק את מה
 * שבאמת פורסם. rangeStart/rangeEnd הם כל טווח (לא רק חודש קלנדרי) — נקראת
 * גם עם טווח שבוע, ראו generateWeeklySchedule.
 */
export async function reconcileScheduleWithInstagram(rangeStart: Date, rangeEnd: Date): Promise<ReconcileResult> {
  const today = formatCalendarDate(new Date());
  const lastDayIso = formatCalendarDate(addDays(rangeEnd, -1));
  const scanEndIso = lastDayIso < today ? lastDayIso : today;
  if (formatCalendarDate(rangeStart) > scanEndIso) {
    return { checkedDays: 0, matchedSlots: 0, createdSlots: 0, formatsClassified: 0, deletedPlaceholders: 0 };
  }
  // רק אם היום הנוכחי בכלל בטווח המבוקש (scanEndIso===today רק במקרה הזה) —
  // אין טעם לסנכרן "אחרונים" כשמתאמתים טווח שכולו בעבר.
  if (scanEndIso === today) await ensureTodaySynced();

  const scanEndDate = parseCalendarDate(scanEndIso);
  const alreadyDone = await prisma.reconciledDay.findMany({
    where: { date: { gte: rangeStart, lte: scanEndDate } },
    select: { date: true },
  });
  const doneSet = new Set(alreadyDone.map((r) => formatCalendarDate(r.date)));

  const candidateDays: Date[] = [];
  for (let d = rangeStart; formatCalendarDate(d) <= scanEndIso; d = addDays(d, 1)) {
    const dIso = formatCalendarDate(d);
    // "היום" נכנס תמיד, גם אם כבר נבדק קודם באותו יום — ראו הערה למעלה.
    if (dIso === today || !doneSet.has(dIso)) candidateDays.push(d);
  }

  let matchedSlots = 0;
  let createdSlots = 0;
  let formatsClassified = 0;

  if (candidateDays.length > 0) {
    const mediaRangeStart = candidateDays[0];
    const mediaRangeEnd = addDays(candidateDays[candidateDays.length - 1], 1);
    // חצי יום מרווח משני הצדדים בשליפה עצמה — כי הגבולות UTC-חצות, וישראל
    // קדימה 2-3 שעות: פרסום אמיתי סמוך לחצות (לפי השעון בישראל) יכול להיות
    // מעבר לגבול ה-UTC. השיבוץ בפועל ליום נכון קורה למטה לפי israelCalendarDate.
    const mediaQueryStart = new Date(mediaRangeStart.getTime() - 12 * 60 * 60 * 1000);
    const mediaQueryEnd = new Date(mediaRangeEnd.getTime() + 12 * 60 * 60 * 1000);

    const [media, slots] = await Promise.all([
      prisma.instagramMedia.findMany({ where: { timestamp: { gte: mediaQueryStart, lt: mediaQueryEnd } }, orderBy: { timestamp: "asc" } }),
      prisma.scheduledSlot.findMany({ where: { date: { gte: mediaRangeStart, lt: mediaRangeEnd } }, include: { platformContent: true } }),
    ]);

    const mediaByDay = new Map<string, typeof media>();
    for (const m of media) {
      const day = israelCalendarDate(m.timestamp);
      mediaByDay.set(day, [...(mediaByDay.get(day) ?? []), m]);
    }
    const slotsByDay = new Map<string, typeof slots>();
    for (const s of slots) {
      const day = formatCalendarDate(s.date);
      slotsByDay.set(day, [...(slotsByDay.get(day) ?? []), s]);
    }

    const typeCache = new Map<string, string[] | null>();
    async function lookupType(tag: string): Promise<string[] | null> {
      const key = normalizeTagText(tag);
      if (!typeCache.has(key)) typeCache.set(key, await findSegmentTypeByTag(tag));
      return typeCache.get(key) ?? null;
    }

    // תגיות שהתאימו בפועל בהרצה הזו, וה-id-ים של הסלוטים שהם עצמם קיבלו את
    // ההתאמה (יכולים להיות כמה סלוטים אמיתיים שונים עם *אותה* תגית — למשל
    // תוכן שהתפרסם בכמה חלקים בימים נפרדים — ראו הניקוי בסוף, שממתין לסיום
    // כל הימים בדיוק כדי לא לנקות בטעות התאמה אמיתית של יום אחר עם אותה תגית).
    const usedRealTags = new Set<string>();
    const realSlotIds = new Set<string>();

    for (const day of candidateDays) {
    const dayIso = formatCalendarDate(day);
    const dayMedia = mediaByDay.get(dayIso) ?? [];
    const daySlots = slotsByDay.get(dayIso) ?? [];
    const claimedSlotIds = new Set<string>();

    for (const item of dayMedia) {
      const plannedType = mediaTypeToPlannedType(item.mediaType);
      if (!plannedType) continue;

      const hashtags = extractCaptionHashtags(item.caption);
      const normalizedHashtags = new Set(hashtags.map(normalizeTagText));

      // אם התגית בנושיין שונתה (ראו refresh-from-notion) אחרי שהשיבוץ תוכנן,
      // plannedNotionTag כאן הוא תמונת מצב קפואה מלפני השינוי — ההתאמה לפי
      // תגית יכולה לפספס גם כשזה באמת אותו תוכן, ויוצרת שיבוץ כפול במקום
      // לעדכן את הקיים. נפילה שלישית: אם יש שיבוץ יחיד (לא יותר, כדי לא
      // לנחש בין כמה) עם תוכן אמיתי מוכן שעדיין pending באותו יום — זה כנראה
      // בדיוק זה שהתפרסם.
      const pendingContentSlots = daySlots.filter(
        (s) => !claimedSlotIds.has(s.id) && s.platformContentId && s.actualStatus === "pending"
      );
      const matchedSlot =
        daySlots.find((s) => !claimedSlotIds.has(s.id) && s.platformContent?.instagramMediaId === item.id) ??
        daySlots.find((s) => !claimedSlotIds.has(s.id) && s.plannedNotionTag && normalizedHashtags.has(normalizeTagText(s.plannedNotionTag))) ??
        (pendingContentSlots.length === 1 ? pendingContentSlots[0] : undefined);

      const tag = matchedSlot?.plannedNotionTag ?? hashtags[0] ?? null;
      const typeValues = tag ? await lookupType(tag) : null;
      const parsed = typeValues ? parseNotionType(typeValues) : null;
      const preview = (parsed?.isOld ? "📜 " : "") + (item.caption?.slice(0, 120) ?? "");
      const hour = israelDayAndHour(item.timestamp).hour;

      if (tag) usedRealTags.add(tag);

      if (matchedSlot) {
        claimedSlotIds.add(matchedSlot.id);
        realSlotIds.add(matchedSlot.id);
        await prisma.scheduledSlot.update({
          where: { id: matchedSlot.id },
          data: {
            actualStatus: "done",
            actualAt: item.timestamp,
            hour,
            isManual: true,
            plannedType,
            ...(matchedSlot.plannedNotionTag ? {} : { plannedNotionTag: tag, plannedNotionPreview: preview }),
            ...(matchedSlot.plannedFormat ? {} : parsed?.format ? { plannedFormat: parsed.format } : {}),
          },
        });
        // מקשרת גם את התוכן המקומי לפוסט האמיתי (כמו "קשר לפוסט מאינסטגרם"
        // הידני) — בלי זה, התאמה עתידית לפי instagramMediaId (השכבה
        // האמינה ביותר) לא תעבוד על התוכן הזה, ותמיד תישאר תלויה בתגית
        // (שיכולה להתיישן, ראו ההערה למעלה) או בנפילה השלישית.
        if (matchedSlot.platformContentId && !matchedSlot.platformContent?.instagramMediaId) {
          await prisma.platformContent.update({
            where: { id: matchedSlot.platformContentId },
            data: { instagramMediaId: item.id, instagramPermalink: item.permalink },
          });
        }
        matchedSlots++;
      } else {
        const created = await prisma.scheduledSlot.create({
          data: {
            date: day,
            hour,
            isManual: true,
            actualStatus: "done",
            actualAt: item.timestamp,
            plannedType,
            plannedFormat: parsed?.format ?? null,
            plannedNotionTag: tag,
            plannedNotionPreview: tag ? preview : null,
          },
        });
        claimedSlotIds.add(created.id);
        realSlotIds.add(created.id);
        createdSlots++;
      }

      if (parsed?.format && item.aiFormat === null) {
        await prisma.instagramMedia.update({
          where: { id: item.id },
          data: { aiFormat: parsed.format, ...(item.aiTheme === null && parsed.theme ? { aiTheme: parsed.theme } : {}) },
        });
        formatsClassified++;
      } else if (parsed?.theme && item.aiTheme === null) {
        await prisma.instagramMedia.update({ where: { id: item.id }, data: { aiTheme: parsed.theme } });
      }
    }

      await prisma.reconciledDay.upsert({ where: { date: day }, create: { date: day }, update: {} });
    }

    // רק אחרי שכל הימים בהרצה הזו עובדו — תגית שהתאימה בפועל (usedRealTags)
    // מתנקה מכל שיבוץ אחר שמחזיק אותה, *חוץ* מסלוטים שהם עצמם קיבלו התאמה
    // אמיתית בהרצה הזו (realSlotIds — יכולה להיות אותה תגית בכמה ימים
    // שונים, שניהם אמיתיים). ניקוי מוקדם-מדי (תוך כדי הלולאה) ניקה בטעות
    // התאמה אמיתית של יום מאוחר יותר לפני שהספיק להירשם.
    for (const tag of usedRealTags) {
      const affected = await prisma.scheduledSlot.findMany({
        where: { plannedNotionTag: tag, id: { notIn: [...realSlotIds] } },
        select: { id: true, note: true, platformContentId: true, plannedReelCandidateMediaId: true, actualStatus: true },
      });
      if (affected.length === 0) continue;
      await prisma.scheduledSlot.updateMany({
        where: { id: { in: affected.map((a) => a.id) } },
        data: { plannedNotionTag: null, plannedNotionPreview: null, plannedNotionPageUrl: null },
      });
      // סלוט נעול שהתגית שלו התיישנה, ואחרי הניקוי נשאר ריק לגמרי (בלי
      // תוכן/הערה/מועמד ריל) — משתחרר מהנעילה, כדי שהרענון הבא יוכל להציע
      // לו תוכן טרי במקום שיישאר "ריק" לתמיד (נעילה תמיד מגנה רק על המלצה
      // בפועל, לא על תא ריק שכבר לא רלוונטי).
      const nowEmptyIds = affected
        .filter((a) => !a.note && !a.platformContentId && !a.plannedReelCandidateMediaId && a.actualStatus === "pending")
        .map((a) => a.id);
      if (nowEmptyIds.length > 0) {
        await prisma.scheduledSlot.updateMany({ where: { id: { in: nowEmptyIds } }, data: { isManual: false } });
      }
    }
  }

  // כל "צריך ריל/פוסט" (או הערה) בלי תוכן אמיתי שנשאר בסטטוס pending בימים
  // שעברו *לגמרי* (לא כולל היום — עדיין יכול להתפרסם בו משהו) — לא התממש,
  // אז לפי בקשה מפורשת נשאר בלוח רק מה שבאמת פורסם. תוכן אמיתי
  // (platformContentId) או סטטוס שסומן ידנית (done/skipped) לא נמחקים.
  const todayDate = parseCalendarDate(today);
  const deleteRangeEnd = todayDate < rangeEnd ? todayDate : rangeEnd;
  const deletedPlaceholders =
    deleteRangeEnd > rangeStart
      ? (
          await prisma.scheduledSlot.deleteMany({
            where: { date: { gte: rangeStart, lt: deleteRangeEnd }, actualStatus: "pending", platformContentId: null },
          })
        ).count
      : 0;

  return { checkedDays: candidateDays.length, matchedSlots, createdSlots, formatsClassified, deletedPlaceholders };
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
      | {
          id: string;
          type: string;
          text: string | null;
          postId: string;
          hashtags: string;
          post: { hashtags: string; notionUrl: string | null; aiFormat: string | null };
        }
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
    reasonLines: buildWeekReasonLines(days, slots),
    topAngles,
    summary: {
      totalPosts: slots.length,
      reels,
      newNeeded,
      existingReady,
    },
  };
}
