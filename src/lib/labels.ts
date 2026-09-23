/** תגית קבועה שמופיעה תמיד ראשונה בכל הצעת תגיות, בכל סוגי הפוסטים. */
export const ALWAYS_FIRST_HASHTAG = "#אחתביום";

export type SelectedTarget = "facebook_post" | "instagram_carousel" | "instagram_story" | "instagram_reel";

/**
 * יעדים ניתנים לבחירה בטופס יצירת פוסט. פייסבוק וסטורי הוסרו מכאן (פייסבוק
 * לא נמצא שימושי מספיק; הסטורי לא עבד טוב ולא נראה טוב) — אבל הטיפוס/הלוגיקה
 * נשארים כדי שפוסטים קיימים עם תוכן כזה עדיין יוצגו נכון.
 */
export const SELECTABLE_TARGETS: { value: SelectedTarget; label: string }[] = [
  { value: "instagram_carousel", label: "אינסטגרם – פוסט קרוסלה" },
  { value: "instagram_reel", label: "אינסטגרם – ריל" },
];

export const PLATFORM_LABELS: Record<string, string> = {
  facebook_post: "פייסבוק",
  instagram_carousel: "אינסטגרם – קרוסלה",
  instagram_reel: "אינסטגרם – ריל",
  instagram_story: "אינסטגרם – סטורי",
  whatsapp_link: "וואטסאפ",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  ready: "מוכן",
  scheduled: "מתוזמן",
  published: "פורסם",
};

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  ready: "bg-blue-100 text-blue-700",
  scheduled: "bg-amber-100 text-amber-700",
  published: "bg-green-100 text-green-700",
};

/** צבע לפי סוג פוסט (ריל מול קרוסלה) — משותף בין נראות שבועית וחודשית כדי שיהיו תואמים. */
const POST_TYPE_STYLES: Record<string, { solid: string; border: string }> = {
  instagram_reel: { solid: "bg-fuchsia-100 text-fuchsia-800", border: "border-fuchsia-300" },
  instagram_carousel: { solid: "bg-sky-100 text-sky-800", border: "border-sky-300" },
};
const DEFAULT_POST_TYPE_STYLE = { solid: "bg-neutral-100 text-neutral-700", border: "border-neutral-300" };
export function postTypeStyle(type: string | null): { solid: string; border: string } {
  return (type && POST_TYPE_STYLES[type]) || DEFAULT_POST_TYPE_STYLE;
}
