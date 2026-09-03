/**
 * הצעת שירים (שם בלבד, לא קובץ אודיו) לפי סעיף 4.2/4.4 — התאמה גסה לפי
 * מצב-רוח מילות מפתח בטקסט. זו היוריסטיקה פשוטה ולא ניתוח סמנטי אמיתי;
 * ראו שאלה פתוחה #5 באפיון — ניתן לשדרג בעתיד לשירות חיצוני.
 */

export interface SongSuggestion {
  title: string;
  artist: string;
}

const MOOD_SONGS: { keywords: string[]; songs: SongSuggestion[] }[] = [
  {
    keywords: ["שמח", "שמחה", "חגיגה", "מזל טוב", "חתונה", "יומולדת"],
    songs: [
      { title: "עוד יהיה טוב", artist: "עידן רייכל" },
      { title: "שמח", artist: "אושר כהן" },
    ],
  },
  {
    keywords: ["אהבה", "זוגיות", "אהוב", "אהובה", "לב"],
    songs: [
      { title: "אהבה בשבילנו", artist: "עברי לידר" },
      { title: "תגידי", artist: "אייל גולן" },
    ],
  },
  {
    keywords: ["עצוב", "געגוע", "כאב", "פרידה", "חסר"],
    songs: [
      { title: "געגוע", artist: "שלמה ארצי" },
      { title: "הלוואי", artist: "יהודית רביץ" },
    ],
  },
  {
    keywords: ["חג", "חגים", "פסח", "סוכות", "ראש השנה", "חנוכה"],
    songs: [
      { title: "אביב", artist: "אריק איינשטיין" },
      { title: "הבה נגילה", artist: "מסורתי" },
    ],
  },
  {
    keywords: ["הצלחה", "ניצחון", "גאה", "גאווה", "חלום"],
    songs: [
      { title: "אני מאמין", artist: "עידן רייכל" },
      { title: "תודה", artist: "עומר אדם" },
    ],
  },
];

const DEFAULT_SONGS: SongSuggestion[] = [
  { title: "כאן ביחד", artist: "שרית חדד" },
  { title: "יום יבוא", artist: "עידן רייכל" },
];

export function suggestSongs(text: string, max = 3): SongSuggestion[] {
  const matched: SongSuggestion[] = [];

  for (const mood of MOOD_SONGS) {
    if (mood.keywords.some((kw) => text.includes(kw))) {
      matched.push(...mood.songs);
    }
  }

  const unique = [...new Map(matched.map((s) => [`${s.title}-${s.artist}`, s])).values()];
  const result = unique.length > 0 ? unique : DEFAULT_SONGS;

  return result.slice(0, max);
}
