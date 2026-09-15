#!/bin/bash
# בונה אייקון .icns לאפליקציית ה-Dock (scripts/פתיחת-האפליקציה.app) מתוך תמונת
# הפרופיל הנוכחית שהועלתה בהגדרות — כדי שהאייקון ב-Dock יהיה הלוגו האמיתי,
# לא אייקון גנרי. מריצים ידנית שוב כל פעם שמעלים תמונת פרופיל חדשה בהגדרות.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

REL_PATH="$(sqlite3 dev.db "SELECT profileImagePath FROM ProfileSettings WHERE id='default';")"
if [ -z "$REL_PATH" ]; then
  echo "שגיאה: אין תמונת פרופיל מוגדרת בהגדרות עדיין — העלי אחת קודם."
  exit 1
fi

SOURCE_IMAGE="$PROJECT_DIR/storage/$REL_PATH"
if [ ! -f "$SOURCE_IMAGE" ]; then
  echo "שגיאה: הקובץ $SOURCE_IMAGE לא נמצא."
  exit 1
fi

APP_BUNDLE="$PROJECT_DIR/scripts/פתיחת-האפליקציה.app"
ICONSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET"

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$SOURCE_IMAGE" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$SOURCE_IMAGE" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

mkdir -p "$APP_BUNDLE/Contents/Resources"
iconutil -c icns "$ICONSET" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns"

# מוסיפה CFBundleIconFile ל-Info.plist אם עוד אין (בלי לדרוס אם כבר קיים).
if ! /usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "$APP_BUNDLE/Contents/Info.plist" >/dev/null 2>&1; then
  /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "$APP_BUNDLE/Contents/Info.plist"
fi

touch "$APP_BUNDLE"
echo "האייקון עודכן. אם ב-Dock/פינדר עדיין רואים אייקון ישן — לחצו קליק ימני על הקיצור ב-Dock והסירו והוסיפו אותו מחדש, זה מרענן את המטמון של פינדר."
