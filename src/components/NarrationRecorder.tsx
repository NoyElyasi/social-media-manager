"use client";

import { useEffect, useRef, useState } from "react";

export interface CapturedNarration {
  audioBase64: string;
  audioMimeType: string;
  wordTimestamps: number[];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * מקליטה הקראה של טקסט הריל, בעוד המשתמשת מקישה על כל מילה בדיוק ברגע
 * שהיא מתחילה להקריא אותה — כך נאספים תזמוני מילים אמיתיים בלי צורך בזיהוי
 * דיבור. רלוונטי רק ב-revealMode="word" (תזמון פר-מילה חסר משמעות באות-אות).
 * ה-onCaptured נקרא עם ההקלטה המוכנה (base64+תזמונים), או null כשמנקים/מקליטים מחדש.
 */
export default function NarrationRecorder({
  rawText,
  splitMode,
  revealMode,
  onCaptured,
}: {
  rawText: string;
  splitMode: "auto" | "manual";
  revealMode: "word" | "letter";
  onCaptured: (narration: CapturedNarration | null) => void;
}) {
  const [words, setWords] = useState<string[] | null>(null);
  const [loadingWords, setLoadingWords] = useState(false);
  const [recording, setRecording] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hasCaptured, setHasCaptured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);

  async function loadWords(): Promise<string[] | null> {
    setLoadingWords(true);
    setError(null);
    try {
      const res = await fetch("/api/reel-captions-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, splitMode }),
      });
      if (!res.ok) throw new Error("שגיאה בטעינת הכתוביות");
      const data = await res.json();
      const captions: string[] = data.captions;
      const flat = captions.flatMap((c) => c.split(/\s+/).filter(Boolean));
      setWords(flat);
      return flat;
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      return null;
    } finally {
      setLoadingWords(false);
    }
  }

  async function startRecording() {
    setError(null);
    const currentWords = words ?? (await loadWords());
    if (!currentWords || currentWords.length === 0) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      setCurrentIndex(0);
      setTimestamps([]);
      setHasCaptured(false);
      setAudioUrl(null);
      onCaptured(null);
      recorder.start();
      startTimeRef.current = performance.now();
      setRecording(true);
    } catch {
      setError("לא ניתן לגשת למיקרופון — ודאי שהדפדפן מורשה לגשת אליו");
    }
  }

  function handleWordTap(index: number) {
    if (!recording || index < currentIndex) return;
    const now = (performance.now() - startTimeRef.current) / 1000;
    setTimestamps((prev) => {
      const next = [...prev];
      for (let i = currentIndex; i <= index; i++) next[i] = now;
      return next;
    });
    setCurrentIndex(index + 1);
  }

  function finishRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !words) return;
    if (currentIndex < words.length) {
      setError(`עדיין לא סימנת את כל המילים (${currentIndex}/${words.length}) — המשיכי להקיש עליהן, או הקליטי מחדש`);
      return;
    }
    setError(null);
    const finalTimestamps = timestamps;
    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      const audioBase64 = await blobToBase64(blob);
      setHasCaptured(true);
      onCaptured({ audioBase64, audioMimeType: blob.type, wordTimestamps: finalTimestamps });
    };
    recorder.stop();
    setRecording(false);
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => streamRef.current?.getTracks().forEach((t) => t.stop());
      recorder.stop();
    }
    setRecording(false);
    setCurrentIndex(0);
    setTimestamps([]);
  }

  function reRecord() {
    setHasCaptured(false);
    setAudioUrl(null);
    setTimestamps([]);
    setCurrentIndex(0);
    onCaptured(null);
  }

  // מנקה URL זמני של האודיו כשעוזבים את הקומפוננטה, כדי לא לדלוף זיכרון.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  if (revealMode !== "word") {
    return <p className="text-xs text-brand-maroon/50">הקלטת הקראה מסונכרנת זמינה רק באנימציית "מילה-מילה".</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand-pink/40 bg-white p-3">
      <label className="text-xs font-medium">
        🎙️ הקלטת הקראה מסונכרנת (אופציונלי) — קצב הופעת המילים בריל יתאים לקצב ההקראה שלך
      </label>

      {!recording && !hasCaptured && (
        <button
          type="button"
          onClick={startRecording}
          disabled={loadingWords}
          className="self-start rounded-md border border-brand-pink/40 px-3 py-1.5 text-xs hover:bg-brand-pink/10 disabled:opacity-50"
        >
          {loadingWords ? "טוענת כתוביות..." : "התחילי הקלטה"}
        </button>
      )}

      {recording && words && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-brand-maroon/60">
            הקישי על כל מילה בדיוק ברגע שאת מתחילה להקריא אותה ({currentIndex}/{words.length})
          </p>
          <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm" dir="rtl">
            {words.map((w, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleWordTap(i)}
                disabled={i < currentIndex}
                className={
                  i < currentIndex
                    ? "text-green-700"
                    : i === currentIndex
                      ? "rounded bg-brand-red px-1 text-white"
                      : "text-neutral-400 hover:text-brand-maroon"
                }
              >
                {w}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={finishRecording}
              className="self-start rounded-md bg-brand-red px-3 py-1.5 text-xs text-white hover:bg-brand-red-dark"
            >
              סיימתי
            </button>
            <button
              type="button"
              onClick={cancelRecording}
              className="self-start rounded-md border border-brand-pink/40 px-3 py-1.5 text-xs hover:bg-brand-pink/10"
            >
              בטלי הקלטה
            </button>
          </div>
        </div>
      )}

      {hasCaptured && audioUrl && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-green-700">✓ הקלטה מסונכרנת מוכנה</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={audioUrl} controls className="w-full" />
          <button
            type="button"
            onClick={reRecord}
            className="self-start rounded-md border border-brand-pink/40 px-3 py-1.5 text-xs hover:bg-brand-pink/10"
          >
            הקליטי מחדש
          </button>
        </div>
      )}

      {error && <p className="text-xs text-brand-red">{error}</p>}
    </div>
  );
}
