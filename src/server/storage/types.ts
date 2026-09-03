/**
 * ממשק אחסון קבצים, לפי סעיף 9 ו-9.1 באפיון: הקוד נבנה מול ממשק אחיד,
 * וה"חשבון" בפועל (Google Drive מול תיקייה מקומית) מוחלף בהגדרה אחת בלבד.
 */
export interface StorageService {
  /** יוצר תיקייה חדשה לפוסט ומחזיר את הנתיב היחסי שלה (folderPath שנשמר ב-DB) */
  createPostFolder(dateSlug: string): Promise<string>;

  /** יוצר תת-תיקייה ליעד (פייסבוק/אינסטגרם-פוסט/...) בתוך תיקיית הפוסט */
  createSubfolder(postFolderPath: string, subfolder: string): Promise<string>;

  /** שומר קובץ בינארי (תמונה/וידאו) בתוך תיקייה, מחזיר שם קובץ */
  saveFile(folderPath: string, fileName: string, data: Buffer): Promise<string>;

  /** שומר קובץ טקסט (metadata.txt, alt text וכו') */
  saveTextFile(folderPath: string, fileName: string, content: string): Promise<string>;

  /** קורא קובץ בינארי לצורך תצוגה מקדימה בממשק */
  readFile(folderPath: string, fileName: string): Promise<Buffer>;
}
