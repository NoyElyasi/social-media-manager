import Link from "next/link";
import { prisma } from "@/server/db";
import { PLATFORM_LABELS, STATUS_LABELS, STATUS_COLORS } from "@/lib/labels";
import DeletePostIconButton from "@/components/DeletePostIconButton";
import AiLabelBadge from "@/components/AiLabelBadge";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme: selectedTheme } = await searchParams;

  const allPosts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    include: { platformContents: true },
  });

  const themes = [...new Set(allPosts.map((p) => p.aiTheme).filter((t): t is string => !!t))];
  const posts = selectedTheme ? allPosts.filter((p) => p.aiTheme === selectedTheme) : allPosts;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-maroon">הפוסטים שלי</h1>
        <Link
          href="/posts/new"
          className="rounded-lg bg-brand-red px-4 py-2 text-white text-sm font-medium hover:bg-brand-red-dark"
        >
          + פוסט חדש
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Link
          href="/"
          className={`rounded-full px-3 py-1 ${!selectedTheme ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"}`}
        >
          הכל
        </Link>
        {themes.map((theme) => (
          <Link
            key={theme}
            href={`/?theme=${encodeURIComponent(theme)}`}
            className={`rounded-full px-3 py-1 ${selectedTheme === theme ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"}`}
          >
            {theme}
          </Link>
        ))}
      </div>

      {posts.length === 0 && (
        <p className="text-neutral-500 text-center py-20">
          {allPosts.length === 0 ? (
            <>אין עדיין פוסטים. לחצו על &quot;פוסט חדש&quot; כדי להתחיל.</>
          ) : (
            <>אין פוסטים עם התווית הזו.</>
          )}
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {posts.map((post) => {
          const selectedTargets: string[] = JSON.parse(post.selectedTargets || "[]");
          const privacyFlags: unknown[] = JSON.parse(post.privacyFlags || "[]");

          return (
            <li
              key={post.id}
              className="relative rounded-xl border border-brand-pink/30 bg-brand-card p-5 hover:shadow-sm transition"
            >
              <DeletePostIconButton postId={post.id} />
              <Link href={`/posts/${post.id}`} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-500">
                    {new Date(post.createdAt).toLocaleDateString("he-IL")}
                  </span>
                  <div className="flex items-center gap-2">
                    <AiLabelBadge theme={post.aiTheme} format={post.aiFormat} tone={post.aiTone} />
                    {privacyFlags.length > 0 && (
                      <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-1">
                        ⚠️ {privacyFlags.length} אזהרות פרטיות
                      </span>
                    )}
                  </div>
                </div>
                <p className="line-clamp-2 text-neutral-800">{post.rawText}</p>
                <div className="flex flex-wrap gap-2">
                  {post.platformContents
                    .filter((pc) => pc.type !== "instagram_story")
                    .map((pc) => (
                    <span
                      key={pc.id}
                      className={`text-xs rounded-full px-2 py-1 ${STATUS_COLORS[pc.status]}`}
                    >
                      {PLATFORM_LABELS[pc.type]} · {STATUS_LABELS[pc.status]}
                    </span>
                  ))}
                  {selectedTargets.length === 0 && (
                    <span className="text-xs text-neutral-400">לא נבחרו יעדים</span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
