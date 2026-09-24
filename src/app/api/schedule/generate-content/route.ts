import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { getWeekPlan, getWeekStart, parseCalendarDate, type WeekSlot } from "@/lib/weeklySchedule";
import { findReadySegmentByTag } from "@/server/notion";
import { createAndPreparePost, addTargetToPost } from "@/server/content/preparePost";
import { ReelCancelledError } from "@/server/content/instagramReel";
import { getProfileSettings, updateProfileSettings } from "@/server/settings/profile";
import type { SelectedTarget } from "@/lib/labels";

const bodySchema = z.object({ weekStart: z.string() });

// כמו parseNotionType ב-weeklySchedule.ts — משוכפל בכוונה (לא מיוצא משם, ראו
// קונבנציית השכפול המכוונת בפרויקט הזה).
function parseNotionType(typeValues: string[]): { format: "letter" | "tip" | null; theme: string | null } {
  const format = typeValues.includes("טיפ") ? "tip" : typeValues.includes("מכתב") ? "letter" : null;
  const theme = typeValues.map((v) => v.trim()).find((v) => v && v !== "טיפ" && v !== "מכתב" && v !== "ישן") ?? null;
  return { format, theme };
}

/** רושמת נושא חדש (מנושיין) לרשימת הנושאים בהגדרות, אם הוא עדיין לא שם — כמו applyNotionTypeValue ב-posts/new. */
async function registerThemeIfNew(theme: string | null): Promise<void> {
  if (!theme) return;
  const profile = await getProfileSettings();
  const themeOptions: string[] = JSON.parse(profile.aiThemeOptions || "[]");
  if (!themeOptions.includes(theme)) {
    await updateProfileSettings({ aiThemeOptions: [...themeOptions, theme] });
  }
}

/**
 * לכל שיבוץ בשבוע שעדיין אין לו תוכן אמיתי (לא נעשה כלום, לא שולחת/מדלגת) —
 * מכינה בעצמה תוכן חדש לפי ההמלצה שכבר קיימת: קטע נושיין → פוסט חדש
 * (createAndPreparePost), מועמד ריל שהקרוסלה שלו כבר בכלי → הוספת ריל לאותו
 * פוסט (addTargetToPost). בלי המלצה קונקרטית — מדלגת, לא ממציאה תוכן.
 * מוחזרת כזרם NDJSON (כמו /api/posts) כי ההכנה איטית וסינכרונית לכל פריט —
 * כדי שהממשק יראה התקדמות פריט-פריט על פני כל השבוע, לא יתקע בלי מידע.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }
  const weekStart = getWeekStart(parseCalendarDate(parsed.data.weekStart));
  const plan = await getWeekPlan(weekStart);
  const pending: WeekSlot[] = [...plan.slots]
    .filter((s) => s.slotId && !s.content && s.actualStatus === "pending")
    .sort((a, b) => (a.date === b.date ? a.hour - b.hour : a.date.localeCompare(b.date)));
  // רקעי ברירת מחדל (ראו setDefaultBackgroundPath) — כאן, בניגוד ליצירה
  // ידנית, אין מי שיבחר רקע בזמן אמת, אז משתמשים במה שסומן כברירת מחדל
  // בהגדרות (או בלי רקע, אם לא סומן כלום).
  const profile = await getProfileSettings();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // הבקשה כבר נסגרה בצד הלקוח — אין למי לשלוח יותר.
        }
      };

      let created = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < pending.length; i++) {
        const slot = pending[i];
        if (req.signal.aborted) {
          send({ type: "cancelled" });
          controller.close();
          return;
        }
        send({ type: "progress", index: i + 1, total: pending.length, date: slot.date, hour: slot.hour });

        try {
          if (slot.recommendedReelCandidate) {
            const postId = slot.recommendedReelCandidate.postId;
            if (!postId) {
              skipped++;
              send({ type: "item", date: slot.date, hour: slot.hour, status: "skipped", message: "הריל המומלץ לא מקושר לפוסט בכלי — לא הוכן ריל" });
              continue;
            }
            let updatedPost;
            let reelAlreadyExisted = false;
            try {
              updatedPost = await addTargetToPost(postId, "instagram_reel", {
                signal: req.signal,
                reelBackgroundPath: profile.defaultReelBackgroundPath,
              });
            } catch (targetErr) {
              // לא כשל אמיתי: יש כאן עדיין תוכן שלא קושר לשיבוץ הזה — אם כבר
              // נוסף ריל לפוסט הזה מאז שההמלצה נשמרה (למשל ידנית, או בהרצה
              // קודמת של הכפתור הזה), הריל כבר מוכן, רק צריך לקשר אותו לשיבוץ
              // (בדיוק כמו "אם קיים כבר פוסט בכלי שרק יכין ממנו גם ריל").
              if (targetErr instanceof Error && targetErr.message.includes("היעד הזה כבר קיים")) {
                reelAlreadyExisted = true;
                updatedPost = await prisma.post.findUniqueOrThrow({ where: { id: postId }, include: { platformContents: true } });
              } else {
                throw targetErr;
              }
            }
            const newContent = updatedPost.platformContents.find((pc) => pc.type === "instagram_reel");
            if (!newContent) throw new Error("הריל לא נוצר");
            await prisma.scheduledSlot.update({ where: { id: slot.slotId! }, data: { platformContentId: newContent.id, isManual: true } });
            created++;
            send({
              type: "item",
              date: slot.date,
              hour: slot.hour,
              status: "created",
              message: reelAlreadyExisted ? "ריל שכבר היה מוכן לפוסט הזה קושר לשיבוץ" : "ריל חדש נוסף לפוסט הקיים",
              postId: updatedPost.id,
            });
          } else if (slot.recommendedNotionSegment) {
            const result = await findReadySegmentByTag(slot.recommendedNotionSegment.tag);
            if (!result.ok || !result.segment) {
              skipped++;
              send({ type: "item", date: slot.date, hour: slot.hour, status: "skipped", message: "הקטע לא נמצא יותר בנושיין" });
              continue;
            }
            const segment = result.segment;
            const { format, theme } = parseNotionType(segment.typeValues);
            await registerThemeIfNew(theme);
            const selectedTargets: SelectedTarget[] = [slot.recommendedType ?? "instagram_carousel"];
            const manualHashtags = segment.tagValues.map((t) => (t.startsWith("#") ? t : `#${t}`));
            const post = await createAndPreparePost({
              rawText: segment.bodyText,
              selectedTargets,
              manualHashtags,
              aiTheme: theme,
              aiFormat: format ?? undefined,
              notionUrl: segment.pageUrl,
              notionTag: slot.recommendedNotionSegment.tag,
              carouselBackgroundPath: profile.defaultCarouselBackgroundPath,
              coverBackgroundPath: profile.defaultCoverBackgroundPath,
              signal: req.signal,
            });
            const newContent = post.platformContents.find((pc) => selectedTargets.includes(pc.type as SelectedTarget));
            if (!newContent) throw new Error("התוכן לא נוצר");
            await prisma.scheduledSlot.update({ where: { id: slot.slotId! }, data: { platformContentId: newContent.id, isManual: true } });
            created++;
            send({ type: "item", date: slot.date, hour: slot.hour, status: "created", message: "פוסט חדש הוכן מהקטע בנושיין", postId: post.id });
          } else {
            skipped++;
            send({ type: "item", date: slot.date, hour: slot.hour, status: "skipped", message: "אין עדיין המלצה קונקרטית ליום הזה" });
          }
        } catch (err) {
          if (err instanceof ReelCancelledError) {
            send({ type: "cancelled" });
            controller.close();
            return;
          }
          errors++;
          console.error("Failed to generate content for slot:", slot.slotId, err);
          send({ type: "item", date: slot.date, hour: slot.hour, status: "error", message: "שגיאה בהכנת התוכן — נסו שוב עבור היום הזה" });
        }
      }

      send({ type: "done", created, skipped, errors });
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
