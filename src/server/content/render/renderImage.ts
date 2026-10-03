import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { SatoriNode } from "./h";
import { getHebrewFonts } from "./fonts";

/**
 * מרנדר עץ satori ל-SVG (הפריסה עצמה) — בלי הריסטור ל-PNG. מופרד מ-resvg
 * בכוונה: satori קל (כ-4% מזמן רינדור מסגרת, לפי מדידה) ולכן זול להריץ
 * ברצף; ה-resvg הוא היקר (~96%), ולריל עם הרבה מסגרות אפשר לפצל אותו
 * למקביליות אמיתית בין תהליכים (ראו parallelRasterize.ts) — לא אפשרי
 * לעשות את זה ל-satori+resvg ביחד בקריאה סינכרונית אחת.
 */
export async function renderNodeToSvg(node: SatoriNode, width: number, height: number): Promise<string> {
  return satori(node as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: getHebrewFonts(),
  });
}

/** מרנדר עץ satori לתמונת PNG בגודל נתון (רוחב x גובה בפיקסלים). */
export async function renderNodeToPng(
  node: SatoriNode,
  width: number,
  height: number
): Promise<Buffer> {
  const svg = await renderNodeToSvg(node, width, height);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
  });
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

/**
 * רוחב התוכן המצויר בפועל (בפיקסלים) — מדידה אמיתית של הגליפים, לא אומדן לפי
 * מספר תווים: רוחב אות עברית משתנה מאוד (י׳ צרה, ש׳ רחבה), במיוחד במשקל כבד.
 * הקנבס חייב להיות רחב מהתוכן, אחרת התוכן נחתך/נשבר והמדידה לא נכונה.
 */
export async function measureNodeContentWidth(node: SatoriNode, width: number, height: number): Promise<number> {
  const svg = await renderNodeToSvg(node, width, height);
  return new Resvg(svg).innerBBox()?.width ?? 0;
}
