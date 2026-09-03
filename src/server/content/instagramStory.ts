import type { StorageService } from "../storage/types";
import { buildStorySlideNode, STORY_WIDTH, STORY_HEIGHT } from "./render/storySlide";
import { renderNodeToPng } from "./render/renderImage";
import { pickBackgroundColor } from "./render/palette";

/** שורות שיווק הומוריסטיות לסטורי, לפי סעיף 4.5. תבניות קבועות — אפשר להרחיב בעתיד. */
const MARKETING_TEMPLATES = [
  "עוד לא ראית? הפוסט מחכה לך 👀",
  "פספסת? זה הזמן לתקן 😉",
  "תגידו שלא ראיתם, אני לא מאמינה 😄",
  "מי שלא ראה — זו הבעיה שלו 😅",
  "רגע לפני שזה נעלם מהפיד...",
];

function pickTemplate(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return MARKETING_TEMPLATES[hash % MARKETING_TEMPLATES.length];
}

/** מציע היילייט קיים לפי התאמת מילות מפתח פשוטה; אם אין התאמה — ברירת המחדל הראשונה ברשימה. */
export function suggestHighlight(existingHighlights: string[], text: string): string | null {
  const match = existingHighlights.find((h) => text.includes(h));
  return match ?? existingHighlights[0] ?? null;
}

export interface InstagramStoryResult {
  marketingLine: string;
  linkLabel: string;
  suggestedHighlight: string | null;
  files: string[];
  altTexts: string[];
}

export interface PrepareStoryParams {
  rawText: string;
  seed: string;
  folderPath: string;
  existingHighlights: string[];
  link?: string | null;
  storage: StorageService;
}

export async function prepareInstagramStory(params: PrepareStoryParams): Promise<InstagramStoryResult> {
  const marketingLine = pickTemplate(params.seed);
  const linkLabel = params.link ?? "🔗 קישור בהיילייטס / בתגובות";
  const backgroundHex = pickBackgroundColor(params.seed + "-story");
  const suggestedHighlight = suggestHighlight(params.existingHighlights, params.rawText);

  const node = buildStorySlideNode({ marketingLine, linkLabel, backgroundHex });
  const png = await renderNodeToPng(node, STORY_WIDTH, STORY_HEIGHT);
  const fileName = "story.png";
  await params.storage.saveFile(params.folderPath, fileName, png);

  const altText = `${marketingLine} — ${linkLabel}`;

  await params.storage.saveTextFile(
    params.folderPath,
    "metadata.txt",
    [
      `שורת שיווק: ${marketingLine}`,
      `קישור: ${linkLabel}`,
      `היילייט מומלץ: ${suggestedHighlight ?? "לא הוגדרו היילייטס"}`,
    ].join("\n\n")
  );
  await params.storage.saveTextFile(params.folderPath, "alt-text.txt", `${fileName}:\n${altText}`);

  return {
    marketingLine,
    linkLabel,
    suggestedHighlight,
    files: [fileName],
    altTexts: [altText],
  };
}
