/** בונה URL לצפייה בקובץ מתוך /api/files/[...path], עם קידוד בטוח לכל מקטע (כולל עברית). */
export function buildFileUrl(folderPath: string, fileName: string): string {
  const segments = [...folderPath.split("/"), fileName].filter((s) => s && s !== ".");
  return `/api/files/${segments.map(encodeURIComponent).join("/")}`;
}

/** כמו buildFileUrl, אך מקבל נתיב יחסי מלא אחד (למשל "פרופיל/avatar.png"). */
export function buildFileUrlFromPath(relativePath: string): string {
  const segments = relativePath.split("/").filter((s) => s && s !== ".");
  return `/api/files/${segments.map(encodeURIComponent).join("/")}`;
}
