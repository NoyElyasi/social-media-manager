export interface StreamEvent {
  type: "progress" | "done" | "cancelled" | "error";
  rendered?: number;
  total?: number;
  post?: unknown;
  message?: string;
}

/** קורא תשובת זרם NDJSON (שורת JSON אחת לאירוע) וקוראת ל-onEvent לכל אירוע. */
export async function readNdjsonStream(res: Response, onEvent: (event: StreamEvent) => void): Promise<void> {
  if (!res.body) throw new Error("שגיאה בקבלת תשובה מהשרת");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as StreamEvent);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
}

/** אומדן שניות שנותרו, לפי קצב ההתקדמות עד כה (שניות שחלפו חלקי מסגרות שנעשו). */
export function estimateRemainingSeconds(rendered: number, total: number, startedAt: number): number | null {
  if (rendered <= 0 || total <= 0) return null;
  const elapsedMs = Date.now() - startedAt;
  const perFrameMs = elapsedMs / rendered;
  return Math.max(0, Math.round((perFrameMs * (total - rendered)) / 1000));
}
