/** תג ה-#אחתביום כתגית ממותגת (לא טקסט אפור רגיל) — לשימוש בכל מקום שמזכירים אותה בממשק. */
export default function HashtagBadge({ text }: { text: string }) {
  return (
    <span className="inline-block rounded-full bg-brand-pink px-2 py-0.5 text-xs font-bold text-white align-middle">
      {text}
    </span>
  );
}
