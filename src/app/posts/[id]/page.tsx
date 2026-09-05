import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { PRIVACY_FLAG_LABELS, type PrivacyFlag } from "@/server/content/privacyScanner";
import PlatformContentCard, { type NormalizedPlatformContent } from "@/components/PlatformContentCard";
import EditablePostText from "@/components/EditablePostText";
import PostExtras from "@/components/PostExtras";

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
    suggestedHighlight: pc.suggestedHighlight,
    backgroundColor: pc.backgroundColor,
    publishedAt: pc.publishedAt ? pc.publishedAt.toISOString() : null,
    status: pc.status,
    updatedAt: pc.updatedAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-neutral-500">
          {new Date(post.createdAt).toLocaleString("he-IL")} · {post.folderPath}
        </p>
        <div className="mt-2 flex flex-col gap-4">
          <EditablePostText
            postId={post.id}
            initialRawText={post.rawText}
            hasCarousel={post.platformContents.some((pc) => pc.type === "instagram_carousel")}
          />
          <PostExtras
            postId={post.id}
            hashtags={JSON.parse(post.hashtags || "[]")}
            existingTypes={visiblePlatformContents.map((pc) => pc.type)}
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
    </div>
  );
}
