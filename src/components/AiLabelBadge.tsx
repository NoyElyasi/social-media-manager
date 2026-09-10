export default function AiLabelBadge({
  theme,
  format,
  tone,
}: {
  theme: string | null;
  format: string | null;
  tone: string | null;
}) {
  if (!theme) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs rounded-full bg-purple-50 text-purple-700 px-2 py-1">
      🏷️ {theme}
      {format === "letter" && " · מכתב"}
      {tone === "absurd" && " · אבסורדי"}
    </span>
  );
}
