/**
 * הצעת שירים (שם בלבד, לא קובץ אודיו) לפי סעיף 4.2/4.4 — מבוססת על נושא
 * (theme) שנבחר בזמן יצירת הפוסט, ולא על ניחוש מילות מפתח בטקסט (שהתברר
 * כלא רלוונטי לתוכן — היוריסטיקה הקודמת החזירה כל הזמן את אותם 1-2 שירים
 * קבועים). רשימת השירים לכל נושא ניתנת לעריכה מלאה בהגדרות (ראו
 * SongsByThemeForm) — ההצעה היא תמיד שיר שהמשתמשת עצמה אישרה כמתאים.
 */

export interface SongSuggestion {
  title: string;
  artist: string;
}

export type ThemeSongs = Record<string, SongSuggestion[]>;

const FALLBACK_THEME = "אחר";
const HARD_FALLBACK: SongSuggestion[] = [
  { title: "כאן ביחד", artist: "שרית חדד" },
  { title: "יום יבוא", artist: "עידן רייכל" },
];

/**
 * theme — הנושא שנבחר לפוסט (מתוך aiThemeOptions), או null אם לא נבחר.
 * themeSongs — המפה הנוכחית (מוגדרות/הגדרות), theme → רשימת שירים.
 * אם לנושא הנבחר אין שירים שמורים (רשימה ריקה/לא קיימת), חוזרים לדלי "אחר";
 * ואם גם זה ריק, לרשימת ברירת המחדל הקשיחה כאן (כך שההצעה לא נעלמת לגמרי).
 */
export function suggestSongs(theme: string | null | undefined, themeSongs: ThemeSongs, max = 3): SongSuggestion[] {
  const forTheme = theme ? themeSongs[theme] : undefined;
  const songs = forTheme && forTheme.length > 0 ? forTheme : themeSongs[FALLBACK_THEME];
  const result = songs && songs.length > 0 ? songs : HARD_FALLBACK;
  return result.slice(0, max);
}
