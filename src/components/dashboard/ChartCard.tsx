"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BRAND_RED = "#c41e3a";
const BRAND_PINK = "#e7a9b8";
const BRAND_MAROON = "#4a1420";
const PIE_COLORS = ["#c41e3a", "#e7a9b8", "#a11730", "#d6798d", "#4a1420", "#f3d4dc"];

export interface BarDatum {
  name: string;
  value: number;
  count: number;
}

/** כרטיס גרף עמודות בודד (השוואת שתי קבוצות/יותר) — או placeholder אם אין מספיק נתונים. */
export function BarComparisonCard({
  title,
  data,
  unit,
  note,
}: {
  title: string;
  data: BarDatum[] | null;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="min-w-[260px] shrink-0 self-start snap-start rounded-lg border border-brand-pink/30 bg-white p-4 text-sm flex flex-col gap-2">
      <p className="font-medium text-brand-maroon">{title}</p>
      {data ? (
        <>
          <div style={{ width: "100%", height: 160 }} dir="ltr">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 5, right: 5, left: -5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={BRAND_PINK} opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: BRAND_MAROON }} />
                <YAxis tick={{ fontSize: 11, fill: BRAND_MAROON }} width={44} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}${unit ?? ""}`} />
                <Bar dataKey="value" fill={BRAND_RED} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-brand-maroon/50">{data.map((d) => `${d.name}: ${d.count}`).join(" · ")}</p>
        </>
      ) : (
        <p className="flex-1 flex items-center justify-center text-center text-xs text-brand-maroon/40 py-8">
          {note ?? "אין עדיין מספיק נתונים"}
        </p>
      )}
    </div>
  );
}

/** כרטיס גרף עמודות מקובצות — כמה מדדים זה לצד זה לכל קטגוריה (למשל ריל/קרוסלה: לייקים+תגובות). */
export function GroupedBarCard({
  title,
  data,
  bars,
  note,
}: {
  title: string;
  data: Record<string, string | number>[] | null;
  bars: { key: string; label: string; color: string }[];
  note?: string;
}) {
  return (
    <div className="min-w-[260px] shrink-0 self-start snap-start rounded-lg border border-brand-pink/30 bg-white p-4 text-sm flex flex-col gap-2">
      <p className="font-medium text-brand-maroon">{title}</p>
      {data ? (
        <div style={{ width: "100%", height: 180 }} dir="ltr">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 5, right: 5, left: -5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={BRAND_PINK} opacity={0.4} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: BRAND_MAROON }} />
              <YAxis tick={{ fontSize: 11, fill: BRAND_MAROON }} width={44} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {bars.map((b) => (
                <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="flex-1 flex items-center justify-center text-center text-xs text-brand-maroon/40 py-8">
          {note ?? "אין עדיין מספיק נתונים"}
        </p>
      )}
    </div>
  );
}

/** כרטיס גרף קו — מגמה כרונולוגית (למשל לייקים לאורך זמן). */
export function LineTrendCard({
  title,
  data,
  unit,
}: {
  title: string;
  data: { date: string; value: number }[];
  unit?: string;
}) {
  return (
    <div className="w-full rounded-lg border border-brand-pink/30 bg-white p-4 text-sm flex flex-col gap-2">
      <p className="font-medium text-brand-maroon">{title}</p>
      {data.length >= 2 ? (
        <div style={{ width: "100%", height: 220 }} dir="ltr">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 20, left: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={BRAND_PINK} opacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: BRAND_MAROON }} />
              <YAxis tick={{ fontSize: 11, fill: BRAND_MAROON }} width={44} />
              <Tooltip formatter={(v) => `${v}${unit ?? ""}`} />
              <Line type="monotone" dataKey="value" stroke={BRAND_RED} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-8 text-center text-xs text-brand-maroon/40">אין עדיין מספיק פוסטים למגמה</p>
      )}
    </div>
  );
}

/** גלילה אופקית (לא רשימה שממשיכה לגדול לאורך) — מכילה כמה כרטיסי גרף. */
export function ChartScrollRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-3 overflow-x-auto pb-2 snap-x">{children}</div>;
}

/** כרטיס גרף עוגה — פילוח (מין/גיל/מדינה וכו') לתמונת מצב אחת, לא סדרה. */
export function PieBreakdownCard({
  title,
  data,
  note,
}: {
  title: string;
  data: { label: string; value: number }[] | null;
  note?: string;
}) {
  const total = data?.reduce((sum, d) => sum + d.value, 0) ?? 0;
  return (
    <div className="min-w-[260px] shrink-0 self-start snap-start rounded-lg border border-brand-pink/30 bg-white p-4 text-sm flex flex-col gap-2">
      <p className="font-medium text-brand-maroon">{title}</p>
      {data && data.length > 0 ? (
        <>
          <div style={{ width: "100%", height: 200 }} dir="ltr">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={85}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name) => [`${v} (${((Number(v) / total) * 100).toFixed(0)}%)`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="flex-1 flex items-center justify-center text-center text-xs text-brand-maroon/40 py-8">
          {note ?? "אין עדיין נתונים"}
        </p>
      )}
    </div>
  );
}
