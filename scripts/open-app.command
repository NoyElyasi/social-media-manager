#!/bin/bash
# לחיצה כפולה על הקובץ הזה (בפינדר) מריצה את שרת הפיתוח ופותחת את האפליקציה
# בדפדפן אוטומטית — בלי לפתוח טרמינל ולהקליד פקודות. משאירה את חלון הטרמינל
# הזה פתוח כל עוד השרת רץ (בדיוק כמו npm run dev רגיל) — סגירת החלון עוצרת
# את השרת.
cd "$(dirname "$0")/.." || exit 1

# טוענת את nvm במפורש אם קיים — כשמריצים את הקובץ הזה דרך אפליקציית מאק
# (Dock/קליק כפול, ראו scripts/*.app) הסביבה לא בהכרח מכילה את ה-PATH המלא
# שמעטפת אינטראקטיבית רגילה מקבלת מקובצי ההגדרות שלה, ואז npm "לא נמצא"
# בכלל גם אם הוא מותקן. טעינה מפורשת פותרת את זה בלי תלות בקובץ הגדרות
# ספציפי (.zshrc/.bash_profile/וכו').
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if ! command -v npm >/dev/null 2>&1; then
  echo "שגיאה: לא נמצא npm בסביבה הזו (גם אחרי ניסיון לטעון nvm)."
  echo "פתחי טרמינל רגיל ותריצי כאן 'which npm' כדי לבדוק איפה הוא מותקן בפועל."
  read -r -p "לחצי Enter לסגירה..."
  exit 1
fi

LOG_FILE="$(mktemp)"
npm run dev > "$LOG_FILE" 2>&1 &
DEV_PID=$!

echo "מכינה את השרת..."
URL=""
for _ in $(seq 1 30); do
  URL=$(grep -oE 'http://localhost:[0-9]+' "$LOG_FILE" | head -1)
  if [ -n "$URL" ]; then
    break
  fi
  sleep 1
done

if [ -n "$URL" ]; then
  sleep 1
  open "$URL"
  echo "האפליקציה נפתחה: $URL"
else
  echo "השרת לא עלה בזמן — הפלט המלא:"
  cat "$LOG_FILE"
fi

echo ""
echo "השרת רץ בחלון הזה — השאירי אותו פתוח כל עוד את עובדת. לעצירה: Ctrl+C."
wait "$DEV_PID"
