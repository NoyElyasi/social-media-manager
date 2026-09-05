import type { StorageService } from "./types";

/**
 * שלד (stub) למימוש עתידי מול Google Drive, לפי סעיף 9.1 באפיון:
 * הקוד/הלוגיקה נבנים כבר עכשיו, אבל החיבור לחשבון Google Drive הספציפי
 * (client id/secret, refresh token, תיקיית שורש) יתבצע בהמשך, כשיוחלט
 * תחת איזה חשבון המוצר ירוץ לטווח ארוך.
 *
 * כדי להפעיל בעתיד:
 * 1. npm install googleapis
 * 2. להגדיר ב-.env: GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET /
 *    GOOGLE_DRIVE_REFRESH_TOKEN / GOOGLE_DRIVE_ROOT_FOLDER_ID
 * 3. להחליף STORAGE_PROVIDER=local ל-STORAGE_PROVIDER=google-drive ב-.env
 * 4. למלא את המימוש למטה (יצירת תיקיות/העלאת קבצים דרך ה-Drive API).
 */
export class GoogleDriveStorageService implements StorageService {
  constructor() {
    throw new Error(
      "GoogleDriveStorageService אינו מומש עדיין — יש לחבר חשבון Google Drive " +
        "(ראו סעיף 9.1 באפיון) ולהשלים את המימוש בקובץ הזה לפני שימוש."
    );
  }

  async createPostFolder(): Promise<string> {
    throw new Error("not implemented");
  }
  async createSubfolder(): Promise<string> {
    throw new Error("not implemented");
  }
  async saveFile(): Promise<string> {
    throw new Error("not implemented");
  }
  async saveTextFile(): Promise<string> {
    throw new Error("not implemented");
  }
  async readFile(): Promise<Buffer> {
    throw new Error("not implemented");
  }
  async deleteFolder(): Promise<void> {
    throw new Error("not implemented");
  }
}
