import { promises as fs } from "fs";
import path from "path";
import type { StorageService } from "./types";

/**
 * מימוש מקומי (דיסק) של StorageService, לפי מבנה התיקיות בסעיף 9:
 * <root>/פוסטים/<דייטסלאג>/<תת-תיקייה>/<קבצים>
 *
 * זהו מימוש הביניים עד לחיבור Google Drive בפועל (סעיף 9.1) — כשזה יקרה,
 * יתווסף GoogleDriveStorageService שמיישם את אותו StorageService, וההחלפה
 * תהיה שינוי של STORAGE_PROVIDER בקובץ הסביבה בלבד.
 */
export class LocalFileStorageService implements StorageService {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  private resolve(...segments: string[]) {
    return path.join(this.root, ...segments);
  }

  async createPostFolder(dateSlug: string): Promise<string> {
    const relativePath = path.join("posts", dateSlug);
    await fs.mkdir(this.resolve(relativePath), { recursive: true });
    return relativePath;
  }

  async createSubfolder(postFolderPath: string, subfolder: string): Promise<string> {
    const relativePath = path.join(postFolderPath, subfolder);
    await fs.mkdir(this.resolve(relativePath), { recursive: true });
    return relativePath;
  }

  async saveFile(folderPath: string, fileName: string, data: Buffer): Promise<string> {
    await fs.mkdir(this.resolve(folderPath), { recursive: true });
    await fs.writeFile(this.resolve(folderPath, fileName), data);
    return fileName;
  }

  async saveTextFile(folderPath: string, fileName: string, content: string): Promise<string> {
    await fs.mkdir(this.resolve(folderPath), { recursive: true });
    await fs.writeFile(this.resolve(folderPath, fileName), content, "utf-8");
    return fileName;
  }

  async readFile(folderPath: string, fileName: string): Promise<Buffer> {
    return fs.readFile(this.resolve(folderPath, fileName));
  }
}
