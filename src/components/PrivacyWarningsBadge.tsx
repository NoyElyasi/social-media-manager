"use client";

import { useState } from "react";
import type { PrivacyFlag } from "@/server/content/privacyScanner";

/**
 * אזהרת פרטיות (סעיף 8) — אייקון קטן (משולש/סימן קריאה) במקום בלוק גדול
 * שתמיד תפוס על המסך. לחיצה פותחת/סוגרת את פירוט האזהרות בפועל.
 */
export default function PrivacyWarningsBadge({
  flags,
  labels,
}: {
  flags: PrivacyFlag[];
  labels: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  if (flags.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`${flags.length} אזהרות פרטיות — לחצי לפרטים`}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-700 text-xs hover:bg-red-200"
      >
        ⚠️
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-lg border border-red-200 bg-red-50 p-3 flex flex-col gap-2 shadow-md">
          <p className="text-sm text-red-700">
            נמצאו בטקסט פרטים שעשויים לחשוף זהות. זו רק אזהרה — ההחלטה אם לשנות את הטקסט נשארת בידיים שלך.
          </p>
          <ul className="text-sm text-red-800 flex flex-col gap-1">
            {flags.map((flag, i) => (
              <li key={i}>
                <span className="font-medium">{labels[flag.type]}:</span> &quot;{flag.match}&quot;
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
