import Link from "next/link";
import { prisma } from "@/server/db";
import { PLATFORM_LABELS, STATUS_LABELS, STATUS_COLORS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    include: { platformContents: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">הפוסטים שלי</h1>
        <Link
          href="/posts/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white text-sm font-medium hover:bg-blue-700"
        >
          + פוסט חדש
        </Link>
      </div>

      {posts.length === 0 && (
        <p className="text-neutral-500 text-center py-20">
          אין עדיין פוסטים. לחצו על &quot;פוסט חדש&quot; כדי להתחיל.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {posts.map((post) => {
          const selectedTargets: string[] = JSON.parse(post.selectedTargets || "[]");
          const privacyFlags: unknown[] = JSON.parse(post.privacyFlags || "[]");

          return (
            <li key={post.id} className="rounded-xl border bg-white p-5 hover:shadow-sm transition">
              <Link href={`/posts/${post.id}`} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-500">
                    {new Date(post.createdAt).toLocaleDateString("he-IL")}
                  </span>
                  {privacyFlags.length > 0 && (
                    <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-1">
                      ⚠️ {privacyFlags.length} אזהרות פרטיות
                    </span>
                  )}
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
