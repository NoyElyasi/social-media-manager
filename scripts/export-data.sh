#!/bin/bash
# מארזת את הנתונים האמיתיים (מסד הנתונים + כל הקבצים שהועלו/נוצרו + .env) לקובץ
# אחד בדסקטופ, כדי להעביר בין שני מחשבים (AirDrop/USB) בלי לגעת בקוד עצמו —
# הקוד כבר ב-git, רק הנתונים האלה חיים מקומית על הדיסק.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_FILE="$HOME/Desktop/data-transfer.tar.gz"

cd "$PROJECT_DIR"

if [ ! -f dev.db ]; then
  echo "שגיאה: לא נמצא dev.db בתיקיית הפרויקט ($PROJECT_DIR) — לא ממשיכים."
  exit 1
fi

tar czf "$OUT_FILE" dev.db storage .env

echo "נוצר: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
echo "העבירי את הקובץ הזה למחשב השני (AirDrop/USB), ואז הריצי שם: npm run import-data"
