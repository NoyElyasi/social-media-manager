// תהליך-עובד לריסטור (resvg.render) של SVG-ים ל-PNG, מקבילית לרינדור ריל
// (ראו parallelRasterize.ts). קובץ .cjs נפרד ופשוט בכוונה — לא TypeScript,
// לא תלוי בסאטורי/גופנים/כל דבר אחר בפרויקט — כדי ש-child_process.fork
// יוכל להריץ אותו ישירות (node לא יודע להריץ .ts), ולא כדי שהוא ייטען
// בטעות ע"י ה-bundler של Next (אין שום import/require אליו מהקוד הרגיל).
const fs = require("fs");
const { Resvg } = require("@resvg/resvg-js");

process.on("message", (msg) => {
  if (msg.type !== "render") return;
  try {
    for (const job of msg.jobs) {
      const resvg = new Resvg(job.svg, { fitTo: { mode: "width", value: msg.width } });
      const png = resvg.render().asPng();
      fs.writeFileSync(job.filePath, png);
      process.send({ type: "progress" });
    }
    process.send({ type: "done" });
  } catch (err) {
    process.send({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
});
