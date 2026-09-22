/**
 * "שוברת" את ה-max-w-4xl הגלובלי (src/app/layout.tsx) רק בעמודי התכנון —
 * ללוח שנה יש צורך ברוחב גדול יותר מעמודי טקסט/פוסטים רגילים, כדי שלא תהיה
 * גלילה אופקית בתוך הלוח עצמו. הטריק הסטנדרטי לפריצת קונטיינר ממורכז: רוחב
 * מסך מלא + margin שמזיז בחזרה למרכז ה-viewport (לא מרכז ה-max-w-4xl). לא
 * משנה את הפריסה הגלובלית לשאר העמודים באתר.
 */
export default function WideScheduleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen mx-[calc(50%-50vw)] px-4 md:px-6">
      <div className="max-w-[1280px] mx-auto">{children}</div>
    </div>
  );
}
