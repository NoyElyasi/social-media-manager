export default function AiLabelBadge({
  theme,
  format,
  tone,
}: {
  theme: string | null;
  format: string | null;
  tone: string | null;
}) {
  if (!theme && format !== "letter" && format !== "tip") return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs rounded-full bg-purple-50 text-purple-700 px-2 py-1">
      {theme && `🏷️ ${theme}`}
      {format === "letter" && `${theme ? " · " : ""}✉️ מכתב`}
      {format === "tip" && `${theme ? " · " : ""}💡 טיפ`}
      {tone === "absurd" && " · אבסורדי"}
    </span>
  );
}
