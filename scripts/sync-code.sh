#!/bin/bash
# מסנכרנת את הקוד עם התיקונים העדכניים מ-GitHub (בלי לגעת בנתונים המקומיים —
# dev.db/storage/.env לא ב-git, אז git pull לא נוגע בהם בכלל). מריצים במחשב
# שבו את מכינה פוסטים בפועל, אחרי שהתקבל תיקון חדש במחשב השני.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "מושכת עדכוני קוד מ-GitHub..."
git pull

echo "מתקינה תלויות (אם השתנו)..."
npm install

echo "מריצה מיגרציות סכמה חדשות לדאטהבייס (אם יש — לא נוגע בנתונים קיימים)..."
npx prisma migrate deploy

echo "סנכרון הושלם. אם השרת (npm run dev) רץ, הפעילי אותו מחדש כדי שהשינויים יכנסו לתוקף."
