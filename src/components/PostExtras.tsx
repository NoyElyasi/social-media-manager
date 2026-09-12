"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ALWAYS_FIRST_HASHTAG, SELECTABLE_TARGETS, type SelectedTarget } from "@/lib/labels";
import { readNdjsonStream, estimateRemainingSeconds } from "@/lib/ndjsonStream";
import ReelProgress from "./ReelProgress";
import HashtagBadge from "./HashtagBadge";
import BackgroundPicker from "./BackgroundPicker";
import type { BackgroundItem } from "./BackgroundGallery";
import { buildFileUrlFromPath } from "@/lib/files";
import NarrationRecorder, { type CapturedNarration } from "./NarrationRecorder";

export default function PostExtras({
  postId,
  hashtags,
  existingTypes,
  rawText,
  splitMode,
}: {
  postId: string;
  hashtags: string[];
  existingTypes: string[];
  rawText: string;
  splitMode: "auto" | "manual";
}) {
  const router = useRouter();
  const [hashtagsInput, setHashtagsInput] = useState(hashtags.join(" "));
  const [savingHashtags, setSavingHashtags] = useState(false);
  const [addingTarget, setAddingTarget] = useState<SelectedTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ rendered: number; total: number } | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [showReelBackgroundPicker, setShowReelBackgroundPicker] = useState(false);
  const [reelBackgrounds, setReelBackgrounds] = useState<BackgroundItem[]>([]);
  const [reelBackgroundPath, setReelBackgroundPath] = useState<string | null>(null);
  const [reelNarration, setReelNarration] = useState<CapturedNarration | null>(null);

  const missingTargets = SELECTABLE_TARGETS.filter((t) => !existingTypes.includes(t.value));

  useEffect(() => {
    if (!showReelBackgroundPicker) return;
    fetch("/api/settings/profile")
      .then((r) => r.json())
      .then((data) => {
        const paths: string[] = data.profile?.reelBackgroundImagePaths ?? [];
        setReelBackgrounds(paths.map((path) => ({ path, url: buildFileUrlFromPath(path) })));
      });
  }, [showReelBackgroundPicker]);

  async function saveHashtags() {
    setSavingHashtags(true);
    try {
      const tags = hashtagsInput.split(/\s+/).filter(Boolean);
      await fetch(`/api/posts/${postId}/hashtags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashtags: tags }),
      });
      router.refresh();
    } finally {
      setSavingHashtags(false);
    }
  }

  function cancelAddTarget() {
    abortControllerRef.current?.abort();
  }

  async function addTarget(target: SelectedTarget) {
    setAddingTarget(target);
    setError(null);
    setProgress(null);
    startedAtRef.current = Date.now();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/posts/${postId}/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          ...(target === "instagram_reel" ? { reelBackgroundPath, reelNarration } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error?.formErrors?.[0] ?? "שגיאה בהוספת היעד");
      }

      let succeeded = false;
      await readNdjsonStream(res, (event) => {
        if (event.type === "progress" && event.total) {
          setProgress({ rendered: event.rendered ?? 0, total: event.total });
        } else if (event.type === "done") {
          succeeded = true;
        } else if (event.type === "cancelled") {
          setError("ההוספה בוטלה");
        } else if (event.type === "error") {
          setError(event.message ?? "שגיאה בהוספת היעד");
        }
      });

      if (succeeded) router.refresh();
    } catch (err) {
      if (controller.signal.aborted) {
        setError("ההוספה בוטלה");
      } else {
        setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      }
    } finally {
      setAddingTarget(null);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium">
          תגיות (משותפות לכל התוכן של הפוסט. <HashtagBadge text={ALWAYS_FIRST_HASHTAG} />{" "}
          מתווספת אוטומטית, אין צורך לכתוב אותה)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={hashtagsInput}
            onChange={(e) => setHashtagsInput(e.target.value)}
            className="flex-1 rounded-md border border-brand-pink/40 text-sm p-1.5 bg-white"
            placeholder="#תגית2 #תגית3"
          />
          <button
            type="button"
            onClick={saveHashtags}
            disabled={savingHashtags}
            className="shrink-0 rounded-md border border-brand-pink/40 px-3 py-1.5 text-sm hover:bg-brand-pink/10 disabled:opacity-50"
          >
            {savingHashtags ? "מעדכן..." : "שמור תגיות לכל התוכן"}
          </button>
        </div>
      </div>

      {missingTargets.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium">הוסיפו יעד נוסף לפוסט הזה</label>
          <div className="flex gap-2 flex-wrap">
            {missingTargets.map((t) =>
              t.value === "instagram_reel" ? (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setShowReelBackgroundPicker((v) => !v)}
                  disabled={addingTarget !== null}
                  className="rounded-md border border-brand-pink/40 px-3 py-1.5 text-sm hover:bg-brand-pink/10 disabled:opacity-50"
                >
                  {addingTarget === t.value ? "מכין..." : `+ ${t.label}`}
                </button>
              ) : (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => addTarget(t.value)}
                  disabled={addingTarget !== null}
                  className="rounded-md border border-brand-pink/40 px-3 py-1.5 text-sm hover:bg-brand-pink/10 disabled:opacity-50"
                >
                  {addingTarget === t.value ? "מכין..." : `+ ${t.label}`}
                </button>
              )
            )}
          </div>
          {showReelBackgroundPicker && (
            <div className="flex flex-col gap-2 rounded-lg border border-brand-pink/40 bg-brand-pink/10 p-3">
              <label className="text-xs font-medium">רקע לריל</label>
              <BackgroundPicker
                items={reelBackgrounds}
                selected={reelBackgroundPath}
                onSelect={setReelBackgroundPath}
                noneLabel="בלי תבנית (צבע אוטומטי)"
              />
              <NarrationRecorder
                key={`${rawText}-${splitMode}`}
                rawText={rawText}
                splitMode={splitMode}
                onCaptured={setReelNarration}
              />
              <button
                type="button"
                onClick={() => addTarget("instagram_reel")}
                disabled={addingTarget !== null}
                className="self-start rounded-md bg-brand-red px-3 py-1.5 text-sm text-white hover:bg-brand-red-dark disabled:opacity-50"
              >
                {addingTarget === "instagram_reel" ? "מכין..." : "הוסיפי ריל"}
              </button>
            </div>
          )}
        </div>
      )}

      {progress && startedAtRef.current && (
        <ReelProgress
          rendered={progress.rendered}
          total={progress.total}
          etaSeconds={estimateRemainingSeconds(progress.rendered, progress.total, startedAtRef.current)}
          onCancel={cancelAddTarget}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
