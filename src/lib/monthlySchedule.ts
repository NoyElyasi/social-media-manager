import { getWeekStart, formatCalendarDate, getWeekPlan, generateWeeklySchedule, reconcileScheduleWithInstagram, type ReconcileResult } from "@/lib/weeklySchedule";
import { getMonthlyFormatPace, type ContentAngle, type FormatGap } from "@/lib/reachInsights";
import type { SpecialDay } from "@/lib/holidays";

/**
 * שכבת "חודש" מעל התכנון השבועי — לא מודל DB נפרד, רק אגרגציה של שבועות
 * קיימים (ראו weeklySchedule.ts). "שבוע" שייך לחודש שבו נופל יום ראשון שלו,
 * גם אם הוא חורג לחודש הבא/הקודם (ראו weekStartsInMonth) — כדי שכל שבוע
 * ישתייך לחודש אחד בדיוק ולא יופיע/ייווצר כפול כשמייצרים חודשים סמוכים.
 */

const MONTH_LABELS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export function getMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function weekStartsInMonth(monthStart: Date): Date[] {
  const monthEnd = addMonths(monthStart, 1);
  const starts: Date[] = [];
  let cursor = getWeekStart(monthStart);
  if (cursor.getTime() < monthStart.getTime()) cursor = addDays(cursor, 7);
  while (cursor.getTime() < monthEnd.getTime()) {
    starts.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return starts;
}

/**
 * כמו weekStartsInMonth, אבל כוללת גם את השבוע החופף מהחודש הקודם (אם יש) —
 * לתצוגה בלבד (getMonthPlan), לא ליצירה (generateMonthlySchedule ממשיכה
 * להשתמש ב-weekStartsInMonth הבלעדית, כדי שלא ייווצר פעמיים). לפי בקשה
 * מפורשת: שבוע שמפוצל בין חודשים צריך להיות *נראה* בשני החודשים (עם החלק
 * שלא שייך לחודש הזה מוחשך, כמו היום), לא רק בחודש שבו הוא "רשום".
 */
function weekStartsOverlappingMonth(monthStart: Date): Date[] {
  const monthEnd = addMonths(monthStart, 1);
  const starts: Date[] = [];
  let cursor = getWeekStart(monthStart);
  while (cursor.getTime() < monthEnd.getTime()) {
    starts.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return starts;
}

export interface MonthDaySlotPreview {
  slotId: string | null;
  hour: number;
  // התגית של התוכן שיפורסם (מפוסט מקושר, או מקטע נושיין שתוכנן), אם ידועה —
  // אחרת null (עדיין רק "צריך ריל/פוסט" גנרי, בלי תוכן ספציפי מאחוריו).
  tag: string | null;
  type: string | null;
  // פורמט מומלץ (מכתב/טיפ) לסלוט הזה שעדיין אין לו תוכן — כמו ב-ScheduleSlotChip
  // בנראות השבועית, ראו recommendedFormat. null אם יש תוכן, או אין המלצת פורמט.
  format: "letter" | "tip" | null;
  actualStatus: "pending" | "done" | "skipped";
}

export interface MonthDaySummary {
  date: string;
  label: string;
  isStrong: boolean;
  isEngaging: boolean;
  specialDays: SpecialDay[];
  blockedDayId: string | null;
  blockedNote: string | null;
  slotsCount: number;
  slotsWithContentCount: number;
  slots: MonthDaySlotPreview[];
}

export interface MonthWeekSummary {
  weekStart: string;
  days: MonthDaySummary[];
  totalPosts: number;
  reels: number;
  existingReady: number;
  newNeeded: number;
  // הסבר קונקרטי לשבוע הזה (למה כל סלוט נבחר) — ראו buildWeekReasonLines ב-weeklySchedule.ts.
  reasonLines: string[];
}

export interface MonthPlan {
  monthStart: string;
  monthLabel: string;
  weeks: MonthWeekSummary[];
  formatAlerts: FormatGap[];
  methodology: string[];
  topAngles: ContentAngle[];
  summary: { totalPosts: number; reels: number; existingReady: number; newNeeded: number };
}

export async function getMonthPlan(monthStart: Date): Promise<MonthPlan> {
  const monthEnd = addMonths(monthStart, 1);
  const weekStarts = weekStartsOverlappingMonth(monthStart);

  const [weekPlans, formatAlerts] = await Promise.all([Promise.all(weekStarts.map((ws) => getWeekPlan(ws))), getMonthlyFormatPace(monthStart, monthEnd)]);

  const weeks: MonthWeekSummary[] = weekPlans.map((plan) => ({
    weekStart: plan.weekStart,
    totalPosts: plan.summary.totalPosts,
    reels: plan.summary.reels,
    existingReady: plan.summary.existingReady,
    newNeeded: plan.summary.newNeeded,
    reasonLines: plan.reasonLines,
    days: plan.days.map((day, di) => {
      const daySlots = plan.slots.filter((s) => s.date === day.date);
      return {
        date: day.date,
        label: day.label,
        isStrong: plan.strength.days[di]?.isStrong ?? false,
        isEngaging: plan.engagement.days[di]?.isStrong ?? false,
        specialDays: day.specialDays,
        blockedDayId: day.blockedDayId,
        blockedNote: day.blockedNote,
        slotsCount: daySlots.length,
        slotsWithContentCount: daySlots.filter((s) => !!s.content).length,
        slots: [...daySlots]
          .sort((a, b) => a.hour - b.hour)
          .map((s) => ({
            slotId: s.slotId,
            hour: s.hour,
            // recommendedReelCandidate יכול להיות מועמד אמיתי בלי כיתוב (פוסטים
            // ישנים, מלפני שהיה כיתוב עקבי) — "?? null" רגיל היה קורס למקום ריק
            // ומראה "צריך ריל" גנרי, כאילו אין בכלל מועמד. יש מועמד, רק בלי כיתוב.
            tag:
              s.content?.titleTag ??
              s.recommendedNotionSegment?.tag ??
              (s.recommendedReelCandidate ? s.recommendedReelCandidate.caption ?? "(ללא כיתוב)" : null),
            type: s.content?.type ?? s.recommendedType ?? null,
            format: s.content ? null : s.recommendedFormat,
            actualStatus: s.actualStatus,
          })),
      };
    }),
  }));

  const summary = weeks.reduce(
    (acc, w) => ({
      totalPosts: acc.totalPosts + w.totalPosts,
      reels: acc.reels + w.reels,
      existingReady: acc.existingReady + w.existingReady,
      newNeeded: acc.newNeeded + w.newNeeded,
    }),
    { totalPosts: 0, reels: 0, existingReady: 0, newNeeded: 0 }
  );

  // ההסבר (ראו buildMethodologyLines) זהה בכל השבועות של החודש כרגע — הוא
  // מבוסס על *כל* הנתונים ההיסטוריים בכלי, לא רק על החודש הזה, כי עדיין אין
  // מספיק פוסטים כדי לחשב "יום/שעה חזק" בנפרד לכל חודש בלי שכל דלי יתבסס על
  // 0-1 פוסטים בודדים. מציגים את זה בפירוש כדי שלא תיראה כאילו ההמלצה
  // "התאימה את עצמה" לחודש הספציפי כשבפועל היא לא.
  const totalSamples = weekPlans[0]?.strength.days.reduce((sum, d) => sum + d.count, 0) ?? 0;
  const methodology = [
    ...(weekPlans[0]?.methodology ?? []),
    `ההסבר הזה זהה בין החודשים כרגע — הוא מבוסס על כל ${totalSamples} הפוסטים ההיסטוריים בכלי, לא רק על ${MONTH_LABELS[monthStart.getUTCMonth()]}, כי עדיין אין מספיק נתונים כדי לחשב "יום/שעה חזק" בנפרד לכל חודש. ככל שיצטבר עוד מידע, אפשר יהיה לבדוק אם יש הבדל בין החודשים עצמם.`,
  ];

  return {
    monthStart: formatCalendarDate(monthStart),
    monthLabel: `${MONTH_LABELS[monthStart.getUTCMonth()]} ${monthStart.getUTCFullYear()}`,
    weeks,
    formatAlerts,
    methodology,
    topAngles: weekPlans[0]?.topAngles ?? [],
    summary,
  };
}

/**
 * מייצרת/מרעננת הצעה לכל השבועות של החודש, שבוע-שבוע ברצף (לא במקביל) —
 * כדי שמלאי התוכן המוכן (readyContent, ראו generateWeeklySchedule) יתחלק
 * נכון בין השבועות ולא ישובץ פעמיים לאותו תוכן בשני שבועות שונים. לפני זה,
 * מסנכרנת בפועל את הימים שעברו החודש מול מה שכבר פורסם באינסטגרם (ראו
 * reconcileScheduleWithInstagram) — כדי שהתכנון להמשך החודש ייקח בחשבון מה
 * שבאמת קרה, לא רק המלצות ישנות.
 */
export async function generateMonthlySchedule(monthStart: Date): Promise<MonthPlan> {
  const monthEnd = addMonths(monthStart, 1);
  await reconcileScheduleWithInstagram(monthStart, monthEnd);

  const weekStarts = weekStartsInMonth(monthStart);
  for (const ws of weekStarts) {
    // cascade: false — הלולאה כאן כבר עוברת על השבועות בסדר כרונולוגי, אז
    // אין צורך שכל שבוע ירענן גם הוא את כל השבועות שאחריו (ראו generateWeeklySchedule).
    await generateWeeklySchedule(ws, { cascade: false });
  }
  return getMonthPlan(monthStart);
}

/** מסנכרנת בפועל בלבד (ראו reconcileScheduleWithInstagram), בלי ליצור/לרענן הצעות — לכפתור הנפרד "סנכרון בפועל" בלוח החודשי. */
export async function reconcileMonth(monthStart: Date): Promise<ReconcileResult> {
  const monthEnd = addMonths(monthStart, 1);
  return reconcileScheduleWithInstagram(monthStart, monthEnd);
}
