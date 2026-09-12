import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { PRIVACY_FLAG_LABELS, type PrivacyFlag } from "@/server/content/privacyScanner";
import PlatformContentCard, { type NormalizedPlatformContent } from "@/components/PlatformContentCard";
import EditablePostText from "@/components/EditablePostText";
import PostExtras from "@/components/PostExtras";
import OpenFolderButton from "@/components/OpenFolderButton";
import DeletePostButton from "@/components/DeletePostButton";
import AiLabelBadge from "@/components/AiLabelBadge";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    include: { platformContents: true },
  });

  if (!post) notFound();

  const privacyFlags: PrivacyFlag[] = JSON.parse(post.privacyFlags || "[]");

  // הסטורי הוסר מהכלי (לא עבד טוב) — תוכן סטורי ישן, אם קיים, לא מוצג יותר
  // (הקבצים/הרשומה נשארים בדיסק/DB, רק לא מופיעים בממשק).
  const visiblePlatformContents = post.platformContents.filter((pc) => pc.type !== "instagram_story");

  const contents: NormalizedPlatformContent[] = visiblePlatformContents.map((pc) => ({
    id: pc.id,
    type: pc.type,
    folderPath: pc.folderPath,
    text: pc.text,
    files: JSON.parse(pc.files || "[]"),
    altText: pc.altText,
    hashtags: JSON.parse(pc.hashtags || "[]"),
    tags: JSON.parse(pc.tags || "[]"),
    suggestedSongs: JSON.parse(pc.suggestedSongs || "[]"),
    durationSeconds: pc.durationSeconds,
    instagramMediaId: pc.instagramMediaId,
    instagramPermalink: pc.instagramPermalink,
    publishedAt: pc.publishedAt ? pc.publishedAt.toISOString() : null,
    status: pc.status,
    updatedAt: pc.updatedAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-brand-maroon/60">
            {new Date(post.createdAt).toLocaleString("he-IL")} · {post.folderPath}
          </p>
          <AiLabelBadge theme={post.aiTheme} format={post.aiFormat} tone={post.aiTone} />
        </div>
        <div className="mt-2 flex flex-col gap-4">
          <EditablePostText
            postId={post.id}
            initialRawText={post.rawText}
            hasSplitTarget={visiblePlatformContents.some(
              (pc) => pc.type === "instagram_carousel" || pc.type === "instagram_reel"
            )}
            hasCarousel={visiblePlatformContents.some((pc) => pc.type === "instagram_carousel")}
            hasReel={visiblePlatformContents.some((pc) => pc.type === "instagram_reel")}
            splitMode={post.splitMode as "auto" | "manual"}
            revealMode={post.revealMode as "word" | "letter"}
            initialCarouselBackgroundPath={
              visiblePlatformContents.find((pc) => pc.type === "instagram_carousel")?.backgroundImagePath ?? null
            }
            initialReelBackgroundPath={
              visiblePlatformContents.find((pc) => pc.type === "instagram_reel")?.backgroundImagePath ?? null
            }
            initialCoverBackgroundPath={
              visiblePlatformContents.find((pc) => pc.type === "instagram_carousel")?.coverImagePath ?? null
            }
          />
          <PostExtras
            postId={post.id}
            hashtags={JSON.parse(post.hashtags || "[]")}
            existingTypes={visiblePlatformContents.map((pc) => pc.type)}
            rawText={post.rawText}
            splitMode={post.splitMode as "auto" | "manual"}
            revealMode={post.revealMode as "word" | "letter"}
          />
        </div>
      </div>

      {privacyFlags.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col gap-2">
          <p className="font-bold text-red-700">⚠️ אזהרת פרטיות (סעיף 8)</p>
          <p className="text-sm text-red-700">
            נמצאו בטקסט פרטים שעשויים לחשוף זהות. זו רק אזהרה — ההחלטה אם לשנות את הטקסט נשארת בידיים שלך.
          </p>
          <ul className="text-sm text-red-800 flex flex-col gap-1">
            {privacyFlags.map((flag, i) => (
              <li key={i}>
                <span className="font-medium">{PRIVACY_FLAG_LABELS[flag.type]}:</span> &quot;{flag.match}&quot;
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {contents.map((content) => (
          <PlatformContentCard key={content.id} content={content} />
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-brand-pink/30 pt-4">
        <OpenFolderButton postId={post.id} />
        <DeletePostButton postId={post.id} />
      </div>
    </div>
  );
}
