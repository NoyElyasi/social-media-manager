"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ALWAYS_FIRST_HASHTAG, SELECTABLE_TARGETS, type SelectedTarget } from "@/lib/labels";
import { readNdjsonStream, estimateRemainingSeconds } from "@/lib/ndjsonStream";
import ReelProgress from "./ReelProgress";

export default function PostExtras({
  postId,
  hashtags,
  existingTypes,
}: {
  postId: string;
  hashtags: string[];
  existingTypes: string[];
}) {
  const router = useRouter();
  const [hashtagsInput, setHashtagsInput] = useState(hashtags.join(" "));
  const [savingHashtags, setSavingHashtags] = useState(false);
  const [addingTarget, setAddingTarget] = useState<SelectedTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ rendered: number; total: number } | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const missingTargets = SELECTABLE_TARGETS.filter((t) => !existingTypes.includes(t.value));

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
        body: JSON.stringify({ target }),
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
          תגיות (משותפות לכל התוכן של הפוסט. {ALWAYS_FIRST_HASHTAG}{" "}
          מתווספת אוטומטית, אין צורך לכתוב אותה)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={hashtagsInput}
            onChange={(e) => setHashtagsInput(e.target.value)}
            className="flex-1 rounded-md border text-sm p-1.5"
            placeholder="#תגית2 #תגית3"
          />
          <button
            type="button"
            onClick={saveHashtags}
            disabled={savingHashtags}
            className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {savingHashtags ? "מעדכן..." : "שמור תגיות לכל התוכן"}
          </button>
        </div>
      </div>

      {missingTargets.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">הוסיפו יעד נוסף לפוסט הזה</label>
          <div className="flex gap-2 flex-wrap">
            {missingTargets.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => addTarget(t.value)}
                disabled={addingTarget !== null}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                {addingTarget === t.value ? "מכין..." : `+ ${t.label}`}
              </button>
            ))}
          </div>
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
