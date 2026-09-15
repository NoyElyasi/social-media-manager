#!/bin/bash
# פורקת קובץ נתונים שנוצר ע"י export-data.sh (מהמחשב האחר) לתוך הפרויקט
# הנוכחי. לפני שדורסת משהו קיים, מעבירה את מה שיש כאן כרגע לתיקיית גיבוי עם
# חותמת זמן — כדי שאם הקובץ שהועבר לא היה מה שחשבת, אין אובדן מידע.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IN_FILE="${1:-$HOME/Desktop/data-transfer.tar.gz}"

cd "$PROJECT_DIR"

if [ ! -f "$IN_FILE" ]; then
  echo "שגיאה: לא נמצא קובץ ב-$IN_FILE — הריצי export-data.sh במחשב השני קודם, והעבירי את הקובץ לכאן."
  exit 1
fi

if [ -f dev.db ] || [ -d storage ]; then
  BACKUP_DIR="$PROJECT_DIR/.data-backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  [ -f dev.db ] && mv dev.db "$BACKUP_DIR/"
  [ -d storage ] && mv storage "$BACKUP_DIR/"
  [ -f .env ] && cp .env "$BACKUP_DIR/"
  echo "גיבוי של הנתונים הקיימים (אם היו) נשמר ב-$BACKUP_DIR — אפשר למחוק אחרי שמאשרים שהייבוא תקין."
fi

tar xzf "$IN_FILE"

echo "ייבוא הסתיים. עכשיו אפשר להריץ: npx prisma migrate deploy && npm run dev"
