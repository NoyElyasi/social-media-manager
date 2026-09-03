/**
 * כללי נגישות לפי סעיף 7 באפיון: ניגודיות WCAG AA וגודל פונט מינימלי,
 * בייחוד בעמודי הריל שבהם קצב הקריאה מהיר.
 */

export const MIN_FONT_SIZE_CAROUSEL = 32; // px, עמודי קרוסלה
export const MIN_FONT_SIZE_STORY = 36; // px, סטורי
export const MIN_FONT_SIZE_REEL = 40; // px, ריל — קצב קריאה מהיר יותר

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [toLinear(r), toLinear(g), toLinear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** יחס ניגודיות בין שני צבעי HEX, לפי נוסחת WCAG. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

/** האם הניגודיות עומדת בסטנדרט WCAG AA (4.5 לטקסט רגיל, 3 לטקסט גדול). */
export function meetsWcagAA(hexA: string, hexB: string, isLargeText = true): boolean {
  const ratio = contrastRatio(hexA, hexB);
  return ratio >= (isLargeText ? 3 : 4.5);
}

/** בוחר צבע טקסט (שחור/לבן) שמניגודיות הכי טובה על רקע נתון, ומאשר עמידה ב-AA. */
export function pickAccessibleTextColor(backgroundHex: string): {
  color: string;
  ratio: number;
  passesAA: boolean;
} {
  const white = "#FFFFFF";
  const black = "#1A1A1A";
  const ratioWhite = contrastRatio(backgroundHex, white);
  const ratioBlack = contrastRatio(backgroundHex, black);

  const useWhite = ratioWhite >= ratioBlack;
  const color = useWhite ? white : black;
  const ratio = useWhite ? ratioWhite : ratioBlack;

  return { color, ratio, passesAA: ratio >= 3 };
}
