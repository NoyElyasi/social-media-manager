import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { SatoriNode } from "./h";
import { getHebrewFonts } from "./fonts";

/** מרנדר עץ satori לתמונת PNG בגודל נתון (רוחב x גובה בפיקסלים). */
export async function renderNodeToPng(
  node: SatoriNode,
  width: number,
  height: number
): Promise<Buffer> {
  const svg = await satori(node as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: getHebrewFonts(),
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
  });
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}
