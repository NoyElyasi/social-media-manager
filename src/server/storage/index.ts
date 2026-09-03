import path from "path";
import { LocalFileStorageService } from "./localStorage";
import { GoogleDriveStorageService } from "./googleDriveStorage";
import type { StorageService } from "./types";

export type { StorageService } from "./types";

function createStorageService(): StorageService {
  const provider = process.env.STORAGE_PROVIDER ?? "local";

  if (provider === "google-drive") {
    return new GoogleDriveStorageService();
  }

  const root = process.env.LOCAL_STORAGE_ROOT
    ? path.resolve(process.env.LOCAL_STORAGE_ROOT)
    : path.join(process.cwd(), "storage");

  return new LocalFileStorageService(root);
}

let cached: StorageService | undefined;

export function getStorageService(): StorageService {
  if (!cached) {
    cached = createStorageService();
  }
  return cached;
}
