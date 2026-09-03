import type { PlatformType } from "@/generated/prisma/client";

/**
 * תזמון פרסום לפי סעיף 4.6: "שעה מדויקת" או "תאריך + שעה אוטומטית".
 * במצב אוטומטי, בהיעדר נתוני Insights היסטוריים (יגיעו בשלב 4 - דשבורד),
 * נשענים על כללי אצבע כלליים בתחום השיווק, עם התחשבות ביום בשבוע
 * (סוף שבוע בישראל = שישי-שבת).
 */

type PeakHours = { weekday: number; weekend: number };

const DEFAULT_PEAK_HOURS: Record<PlatformType, PeakHours> = {
  facebook_post: { weekday: 20, weekend: 11 },
  instagram_carousel: { weekday: 19, weekend: 12 },
  instagram_reel: { weekday: 21, weekend: 20 },
  instagram_story: { weekday: 9, weekend: 10 },
  whatsapp_link: { weekday: 0, weekend: 0 }, // אוטומטי מיידי, לא רלוונטי
};

function isWeekend(date: Date): boolean {
  const day = date.getDay(); // 0=ראשון ... 5=שישי, 6=שבת
  return day === 5 || day === 6;
}

export function getRecommendedHour(platform: PlatformType, date: Date): number {
  const peaks = DEFAULT_PEAK_HOURS[platform];
  return isWeekend(date) ? peaks.weekend : peaks.weekday;
}

export interface ScheduleInput {
  platform: PlatformType;
  mode: "exact" | "auto";
  date: Date; // התאריך שנבחר (השעה בו תתעלם ב-mode="auto")
  exactHour?: number;
  exactMinute?: number;
}

/** מחשב את מועד הפרסום המתוזמן הסופי, לפי המצב שנבחר. */
export function computeScheduledAt(input: ScheduleInput): Date {
  const result = new Date(input.date);

  if (input.mode === "exact") {
    result.setHours(input.exactHour ?? 20, input.exactMinute ?? 0, 0, 0);
  } else {
    const recommendedHour = getRecommendedHour(input.platform, result);
    result.setHours(recommendedHour, 0, 0, 0);
  }

  return result;
}
