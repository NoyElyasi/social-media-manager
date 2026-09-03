/** תגית קבועה שמופיעה תמיד ראשונה בכל הצעת תגיות, בכל סוגי הפוסטים. */
export const ALWAYS_FIRST_HASHTAG = "#אחתביום";

export type SelectedTarget = "facebook_post" | "instagram_carousel" | "instagram_story";

/** יעדים נתמכים ב-MVP (שלב 1, סעיף 12) — ריל ווואטסאפ אוטומטי מתווספים בשלבים הבאים. */
export const SELECTABLE_TARGETS: { value: SelectedTarget; label: string }[] = [
  { value: "facebook_post", label: "פייסבוק" },
  { value: "instagram_carousel", label: "אינסטגרם – פוסט קרוסלה" },
  { value: "instagram_story", label: "אינסטגרם – סטורי" },
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
