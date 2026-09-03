/** פלטת רקעים לעמודי קרוסלה/ריל/סטורי — כל צבע כאן נבדק ידנית שיש לו ניגודיות תקינה עם טקסט לבן או שחור. */
export const BACKGROUND_PALETTE = [
  "#2B2D42",
  "#7B2CBF",
  "#0A9396",
  "#AE2012",
  "#1B4332",
  "#3D348B",
  "#9E2A2B",
  "#264653",
];

/** בוחר צבע רקע עקבי לפי seed (למשל id הפוסט), כדי שכל עמודי אותה קרוסלה ייראו אחידים. */
export function pickBackgroundColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return BACKGROUND_PALETTE[hash % BACKGROUND_PALETTE.length];
}
