import { readFileSync } from "fs";
import path from "path";

let cachedFonts: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | undefined;

/**
 * גופן עברי (Noto Sans Hebrew) לרינדור עמודי הקרוסלה/ריל/סטורי דרך satori.
 * מוסיפים גם את תת-הקבוצה הלטינית של אותו גופן כ-fallback: תת-הקבוצה העברית
 * (hebrew subset) לא כוללת סימני פיסוק בסיסיים כמו "," "!" ".", וסאטורי עובר
 * לגופן הבא ברשימה כשחסר גליף בגופן הראשון.
 */
export function getHebrewFonts() {
  if (!cachedFonts) {
    const dir = path.join(process.cwd(), "assets", "fonts");
    cachedFonts = [
      {
        name: "Noto Sans Hebrew",
        data: readFileSync(path.join(dir, "NotoSansHebrew-Regular.woff")),
        weight: 400 as const,
        style: "normal" as const,
      },
      {
        name: "Noto Sans Hebrew",
        data: readFileSync(path.join(dir, "NotoSansHebrew-Bold.woff")),
        weight: 700 as const,
        style: "normal" as const,
      },
      {
        name: "Noto Sans Hebrew Latin",
        data: readFileSync(path.join(dir, "NotoSansHebrew-Latin-Regular.woff")),
        weight: 400 as const,
        style: "normal" as const,
      },
      {
        name: "Noto Sans Hebrew Latin",
        data: readFileSync(path.join(dir, "NotoSansHebrew-Latin-Bold.woff")),
        weight: 700 as const,
        style: "normal" as const,
      },
    ];
  }
  return cachedFonts;
}
