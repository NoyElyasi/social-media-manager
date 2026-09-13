"use client";

import { useEffect, useRef, useState } from "react";

export interface CapturedNarration {
  audioBase64: string;
  audioMimeType: string;
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
 * מעלה או מקליטה הקראה של הפוסט — בלי צורך לסמן מילה-מילה. השרת מזהה תזמון
 * גס לפי עוצמת הסאונד בהקלטה (ראו detectWordTimestamps ב-instagramReel.ts):
 * לא זיהוי דיבור מדויק, רק "רגישות" לעליות/ירידות בעוצמה, לפי בקשה מפורשת
 * שלא חייבת להיות מדויקת ב-100%. ה-onCaptured נקרא עם ההקלטה (base64), או
 * null כשמנקים/מקליטים מחדש.
 */
export default function NarrationInput({
  onCaptured,
}: {
  onCaptured: (narration: CapturedNarration | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const audioBase64 = await blobToBase64(file);
      setAudioUrl(URL.createObjectURL(file));
      onCaptured({ audioBase64, audioMimeType: file.type || "audio/mpeg" });
    } catch {
      setError("שגיאה בקריאת הקובץ");
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        const audioBase64 = await blobToBase64(blob);
        onCaptured({ audioBase64, audioMimeType: blob.type });
      };
      mediaRecorderRef.current = recorder;
      onCaptured(null);
      setAudioUrl(null);
      recorder.start();
      setRecording(true);
    } catch {
      setError("לא ניתן לגשת למיקרופון — ודאי שהדפדפן מורשה לגשת אליו");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function clear() {
    setAudioUrl(null);
    setError(null);
    onCaptured(null);
  }

  // מנקה URL זמני של האודיו כשעוזבים את הקומפוננטה, כדי לא לדלוף זיכרון.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand-pink/40 bg-white p-3">
      <label className="text-xs font-medium">
        🎙️ הקראה של הפוסט (אופציונלי) — קצב הופעת המילים בריל יתאים בקירוב לקצב ההקראה שלך
      </label>

      {!recording && !audioUrl && (
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer self-start rounded-md border border-brand-pink/40 px-3 py-1.5 text-xs hover:bg-brand-pink/10">
            העלי הקלטה
            <input type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
          </label>
          <button
            type="button"
            onClick={startRecording}
            className="self-start rounded-md border border-brand-pink/40 px-3 py-1.5 text-xs hover:bg-brand-pink/10"
          >
            או הקליטי כאן
          </button>
        </div>
      )}

      {recording && (
        <button
          type="button"
          onClick={stopRecording}
          className="self-start rounded-md bg-brand-red px-3 py-1.5 text-xs text-white hover:bg-brand-red-dark"
        >
          עצרי הקלטה
        </button>
      )}

      {audioUrl && (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={audioUrl} controls className="w-full" />
          <button
            type="button"
            onClick={clear}
            className="self-start rounded-md border border-brand-pink/40 px-3 py-1.5 text-xs hover:bg-brand-pink/10"
          >
            הסירי הקלטה
          </button>
        </div>
      )}

      {error && <p className="text-xs text-brand-red">{error}</p>}
    </div>
  );
}
