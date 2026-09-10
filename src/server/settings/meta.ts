import { prisma } from "../db";
import { getProfileSettings } from "./profile";
import { ALWAYS_FIRST_HASHTAG } from "@/lib/labels";

const GRAPH_API_VERSION = "v26.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaApiError extends Error {}

/**
 * מחליפה טוקן קצר-טווח (מ-Graph API Explorer, בתוקף לשעה-שעתיים) בטוקן
 * ארוך-טווח (60 יום) — כדי שלא יהיה צריך להתחבר ידנית כל שעה.
 */
async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new MetaApiError("META_APP_ID / META_APP_SECRET לא מוגדרים ב-.env");
  }

  const url = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) {
    throw new MetaApiError(data?.error?.message || "כשל בהחלפת הטוקן לטוקן ארוך-טווח");
  }

  const expiresInSeconds: number = data.expires_in ?? 60 * 24 * 60 * 60;
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

interface PageWithInstagram {
  id: string;
  name: string;
  instagram_business_account?: { id: string };
}

/** מאתרת, מבין העמודים שהמשתמשת מנהלת, את זה שמקושר לחשבון אינסטגרם עסקי. */
async function findPageWithInstagram(accessToken: string): Promise<PageWithInstagram> {
  const url = new URL(`${GRAPH_API_BASE}/me/accounts`);
  url.searchParams.set("fields", "id,name,instagram_business_account");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) {
    throw new MetaApiError(data?.error?.message || "כשל בשליפת רשימת העמודים");
  }

  const pages: PageWithInstagram[] = data.data ?? [];
  const withInstagram = pages.find((p) => p.instagram_business_account?.id);
  if (!withInstagram) {
    throw new MetaApiError(
      "לא נמצא עמוד פייסבוק עם חשבון אינסטגרם מקושר מבין העמודים שהטוקן הזה מנהל"
    );
  }
  return withInstagram;
}

/** מבצעת את כל תהליך החיבור: החלפת הטוקן לארוך-טווח + איתור העמוד/חשבון האינסטגרם + שמירה. */
export async function connectMetaAccount(shortLivedToken: string) {
  const { accessToken, expiresAt } = await exchangeForLongLivedToken(shortLivedToken);
  const page = await findPageWithInstagram(accessToken);

  await getProfileSettings();
  return prisma.profileSettings.update({
    where: { id: "default" },
    data: {
      metaAccessToken: accessToken,
      metaTokenExpiresAt: expiresAt,
      metaPageId: page.id,
      metaPageName: page.name,
      metaInstagramBusinessAccountId: page.instagram_business_account!.id,
    },
  });
}

export async function disconnectMetaAccount() {
  await getProfileSettings();
  return prisma.profileSettings.update({
    where: { id: "default" },
    data: {
      metaAccessToken: null,
      metaTokenExpiresAt: null,
      metaPageId: null,
      metaPageName: null,
      metaInstagramBusinessAccountId: null,
    },
  });
}

export interface MetaConnectionStatus {
  connected: boolean;
  pageName: string | null;
  instagramBusinessAccountId: string | null;
  tokenExpiresAt: string | null;
  tokenPreview: string | null;
}

export async function getMetaConnectionStatus(): Promise<MetaConnectionStatus> {
  const profile = await getProfileSettings();
  const connected = Boolean(profile.metaAccessToken && profile.metaInstagramBusinessAccountId);
  return {
    connected,
    pageName: profile.metaPageName,
    instagramBusinessAccountId: profile.metaInstagramBusinessAccountId,
    tokenExpiresAt: profile.metaTokenExpiresAt ? profile.metaTokenExpiresAt.toISOString() : null,
    tokenPreview: profile.metaAccessToken ? `...${profile.metaAccessToken.slice(-6)}` : null,
  };
}

/** מחזירה את הטוקן + ה-ID של חשבון האינסטגרם המחוברים, או זורקת אם אין חיבור פעיל. */
async function requireMetaConnection(): Promise<{ accessToken: string; instagramBusinessAccountId: string }> {
  const profile = await getProfileSettings();
  if (!profile.metaAccessToken || !profile.metaInstagramBusinessAccountId) {
    throw new MetaApiError("אין חיבור פעיל לאינסטגרם — יש להתחבר בהגדרות קודם");
  }
  return {
    accessToken: profile.metaAccessToken,
    instagramBusinessAccountId: profile.metaInstagramBusinessAccountId,
  };
}

export interface InstagramMediaSummary {
  id: string;
  caption: string | null;
  timestamp: string;
  permalink: string;
  mediaType: string;
  mediaProductType: string | null;
  thumbnailUrl: string | null;
}

interface RawInstagramMedia {
  id: string;
  caption?: string;
  timestamp: string;
  permalink: string;
  media_type: string;
  media_product_type?: string;
  thumbnail_url?: string;
  media_url?: string;
}

function mapRawMedia(m: RawInstagramMedia): InstagramMediaSummary {
  return {
    id: m.id,
    caption: m.caption ?? null,
    timestamp: m.timestamp,
    permalink: m.permalink,
    mediaType: m.media_type,
    mediaProductType: m.media_product_type ?? null,
    thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
  };
}

/** שולפת את הפוסטים האחרונים שפורסמו באינסטגרם, לבחירה ידנית לקישור לתוכן מקומי. */
export async function fetchRecentInstagramMedia(limit = 25): Promise<InstagramMediaSummary[]> {
  const { accessToken, instagramBusinessAccountId } = await requireMetaConnection();

  const url = new URL(`${GRAPH_API_BASE}/${instagramBusinessAccountId}/media`);
  url.searchParams.set(
    "fields",
    "id,caption,timestamp,permalink,media_type,media_product_type,thumbnail_url,media_url"
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) {
    throw new MetaApiError(data?.error?.message || "כשל בשליפת הפוסטים מאינסטגרם");
  }

  return (data.data ?? []).map(mapRawMedia);
}

/**
 * שולפת את כל הפוסטים שפורסמו מתאריך נתון ואילך, בדפדוף מלא (paging.next) —
 * לצורך גיבוי/סנכרון המוני של פוסטים ישנים. הרשימה מוחזרת מסודרת מהחדש לישן
 * (כמו שה-API מחזיר), ועוצרת בדפדוף ברגע שמגיעים לפוסט ישן מהתאריך המבוקש.
 */
async function fetchAllInstagramMediaSince(sinceDate: Date): Promise<InstagramMediaSummary[]> {
  const { accessToken, instagramBusinessAccountId } = await requireMetaConnection();

  const results: InstagramMediaSummary[] = [];

  const firstUrl = new URL(`${GRAPH_API_BASE}/${instagramBusinessAccountId}/media`);
  firstUrl.searchParams.set(
    "fields",
    "id,caption,timestamp,permalink,media_type,media_product_type,thumbnail_url,media_url"
  );
  firstUrl.searchParams.set("limit", "50");
  firstUrl.searchParams.set("access_token", accessToken);

  let nextUrl: string | null = firstUrl.toString();

  while (nextUrl) {
    const currentUrl: string = nextUrl;
    const res: Response = await fetch(currentUrl);
    const data = await res.json();
    if (!res.ok) {
      throw new MetaApiError(data?.error?.message || "כשל בשליפת הפוסטים מאינסטגרם");
    }

    let reachedCutoff = false;
    for (const raw of (data.data ?? []) as RawInstagramMedia[]) {
      if (new Date(raw.timestamp) < sinceDate) {
        reachedCutoff = true;
        break;
      }
      results.push(mapRawMedia(raw));
    }

    if (reachedCutoff) break;
    nextUrl = data.paging?.next ?? null;
  }

  return results;
}

/** מקשרת פריט תוכן מקומי (PlatformContent) לפוסט ספציפי באינסטגרם, לפי בחירה ידנית. */
export async function linkInstagramMedia(
  platformContentId: string,
  instagramMediaId: string,
  instagramPermalink: string
) {
  return prisma.platformContent.update({
    where: { id: platformContentId },
    data: { instagramMediaId, instagramPermalink },
  });
}

/** מנסה מספר שמות מטריקה (משתנים בין גרסאות Graph API) ומחזירה את הראשון שהצליח. */
async function tryInsightsMetric(
  mediaId: string,
  accessToken: string,
  metricCandidates: string[]
): Promise<number | null> {
  for (const metric of metricCandidates) {
    const url = new URL(`${GRAPH_API_BASE}/${mediaId}/insights`);
    url.searchParams.set("metric", metric);
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url.toString());
    const data = await res.json();
    if (res.ok) {
      const value = data?.data?.[0]?.values?.[0]?.value;
      if (typeof value === "number") return value;
    }
  }
  return null;
}

export interface SyncedMetrics {
  likesCount: number | null;
  commentsCount: number | null;
  viewsCount: number | null; // "views" — סך הצפיות, יכול לכלול צפיות חוזרות
  reachCount: number | null; // "reach" — כמות חשבונות ייחודיים שנחשפו לפוסט (נבדק: זמין גם לקרוסלה/תמונה, לא רק לריל)
  savedCount: number | null; // "saved" — נבדק: זמין גם לקרוסלה/תמונה
  sharesCount: number | null; // "shares" — נבדק: זמין גם לקרוסלה/תמונה
  avgWatchSeconds: number | null;
  skipped: string[]; // אילו שדות לא הצלחנו לשלוף (כדי להציג למשתמשת בלי להסתיר כשלים)
}

/** שולפת מ-Graph API את נתוני הביצועים האמיתיים של פוסט אינסטגרם ספציפי, לפי ה-ID שלו. */
async function fetchInstagramMediaMetrics(mediaId: string, accessToken: string): Promise<SyncedMetrics> {
  const skipped: string[] = [];

  const basicUrl = new URL(`${GRAPH_API_BASE}/${mediaId}`);
  basicUrl.searchParams.set("fields", "like_count,comments_count,media_type,media_product_type");
  basicUrl.searchParams.set("access_token", accessToken);
  const basicRes = await fetch(basicUrl.toString());
  const basicData = await basicRes.json();
  if (!basicRes.ok) {
    throw new MetaApiError(basicData?.error?.message || "כשל בשליפת נתוני הפוסט מאינסטגרם");
  }

  const likesCount: number | null = basicData.like_count ?? null;
  const commentsCount: number | null = basicData.comments_count ?? null;
  if (likesCount === null) skipped.push("לייקים");
  if (commentsCount === null) skipped.push("תגובות");

  const viewsCount = await tryInsightsMetric(mediaId, accessToken, ["views", "plays"]);
  if (viewsCount === null) skipped.push("צפיות");

  const reachCount = await tryInsightsMetric(mediaId, accessToken, ["reach"]);
  if (reachCount === null) skipped.push("הגעה");

  const savedCount = await tryInsightsMetric(mediaId, accessToken, ["saved"]);
  if (savedCount === null) skipped.push("שמירות");

  const sharesCount = await tryInsightsMetric(mediaId, accessToken, ["shares"]);
  if (sharesCount === null) skipped.push("שיתופים");

  const isVideo = basicData.media_type === "VIDEO" || basicData.media_product_type === "REELS";
  let avgWatchSeconds: number | null = null;

  if (isVideo) {
    const avgWatchMs = await tryInsightsMetric(mediaId, accessToken, [
      "ig_reels_avg_watch_time",
      "average_watch_time",
    ]);
    avgWatchSeconds = avgWatchMs !== null ? avgWatchMs / 1000 : null;
    if (avgWatchSeconds === null) skipped.push("זמן צפייה ממוצע");
  }

  return { likesCount, commentsCount, viewsCount, reachCount, savedCount, sharesCount, avgWatchSeconds, skipped };
}

/**
 * מסנכרנת ל-cache המקומי (InstagramMedia) את כל הפוסטים האמיתיים מאינסטגרם
 * מתאריך נתון ואילך, עם נתוני הביצועים שלהם — לגמרי בלי תלות בתוכן שנוצר
 * בכלי הזה. זה מקור הנתונים היחיד של הדשבורד (/dashboard).
 */
export class SyncCancelledError extends Error {}

export async function syncInstagramMediaSince(
  sinceDate: Date,
  options?: { signal?: AbortSignal; onProgress?: (synced: number, total: number) => void }
): Promise<{ syncedCount: number }> {
  const { accessToken } = await requireMetaConnection();
  const media = await fetchAllInstagramMediaSince(sinceDate);

  let syncedCount = 0;
  for (const item of media) {
    if (options?.signal?.aborted) throw new SyncCancelledError();
    const metrics = await fetchInstagramMediaMetrics(item.id, accessToken);
    const captionWordCount = item.caption ? item.caption.trim().split(/\s+/).filter(Boolean).length : 0;
    const hashtagCount = (item.caption?.match(/#[^\s#@]+/g) ?? []).length;

    // אורך הריל ותיוג ה-AI לא חשופים ב-Graph API — אם הפוסט הזה קושר לתוכן
    // שנוצר בכלי, שם יש את הערכים (מחושב ברינדור / מסווג בנפרד). אופציונלי בהחלט.
    const linkedContent = await prisma.platformContent.findFirst({
      where: { instagramMediaId: item.id },
      select: { durationSeconds: true, post: { select: { aiTheme: true, aiFormat: true, aiTone: true } } },
    });
    const durationSeconds = linkedContent?.durationSeconds ?? null;
    const aiTheme = linkedContent?.post.aiTheme ?? null;
    const aiFormat = linkedContent?.post.aiFormat ?? null;
    const aiTone = linkedContent?.post.aiTone ?? null;

    await prisma.instagramMedia.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        caption: item.caption,
        timestamp: new Date(item.timestamp),
        permalink: item.permalink,
        mediaType: item.mediaType,
        mediaProductType: item.mediaProductType,
        thumbnailUrl: item.thumbnailUrl,
        captionWordCount,
        hashtagCount,
        likesCount: metrics.likesCount,
        commentsCount: metrics.commentsCount,
        viewsCount: metrics.viewsCount,
        reachCount: metrics.reachCount,
        savedCount: metrics.savedCount,
        sharesCount: metrics.sharesCount,
        avgWatchSeconds: metrics.avgWatchSeconds,
        durationSeconds,
        aiTheme,
        aiFormat,
        aiTone,
      },
      update: {
        caption: item.caption,
        mediaType: item.mediaType,
        mediaProductType: item.mediaProductType,
        thumbnailUrl: item.thumbnailUrl,
        captionWordCount,
        hashtagCount,
        durationSeconds,
        // רק אם יש מקור סיווג מהכלי (פוסט מקושר וממויין) — לא דורסים תיוג
        // ידני שהוזן ישירות ב-InstagramMedia (ראו classifyInstagramMediaManually).
        ...(aiTheme !== null ? { aiTheme } : {}),
        ...(aiFormat !== null ? { aiFormat } : {}),
        ...(aiTone !== null ? { aiTone } : {}),
        ...(metrics.likesCount !== null ? { likesCount: metrics.likesCount } : {}),
        ...(metrics.commentsCount !== null ? { commentsCount: metrics.commentsCount } : {}),
        ...(metrics.viewsCount !== null ? { viewsCount: metrics.viewsCount } : {}),
        ...(metrics.reachCount !== null ? { reachCount: metrics.reachCount } : {}),
        ...(metrics.savedCount !== null ? { savedCount: metrics.savedCount } : {}),
        ...(metrics.sharesCount !== null ? { sharesCount: metrics.sharesCount } : {}),
        ...(metrics.avgWatchSeconds !== null ? { avgWatchSeconds: metrics.avgWatchSeconds } : {}),
      },
    });
    syncedCount++;
    options?.onProgress?.(syncedCount, media.length);
  }

  const audience = await fetchAudienceDemographicsSafely(accessToken);

  await getProfileSettings();
  await prisma.profileSettings.update({
    where: { id: "default" },
    data: {
      lastDashboardSyncAt: new Date(),
      ...(audience.genderJson !== null ? { audienceGenderJson: audience.genderJson } : {}),
      ...(audience.ageJson !== null ? { audienceAgeJson: audience.ageJson } : {}),
      ...(audience.countryJson !== null ? { audienceCountryJson: audience.countryJson } : {}),
    },
  });

  return { syncedCount };
}

export interface AudienceBucket {
  label: string;
  value: number;
}

/** שולפת דמוגרפיית עוקבים (מין/גיל/מדינה) — "תמונת מצב" עדכנית, לא היסטוריה. */
async function fetchFollowerDemographics(
  instagramBusinessAccountId: string,
  accessToken: string,
  breakdown: string
): Promise<{ dimensionKeys: string[]; results: { dimension_values: string[]; value: number }[] } | null> {
  const url = new URL(`${GRAPH_API_BASE}/${instagramBusinessAccountId}/insights`);
  url.searchParams.set("metric", "follower_demographics");
  url.searchParams.set("period", "lifetime");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("breakdown", breakdown);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) return null;

  const totalValue = data?.data?.[0]?.total_value;
  const breakdownData = totalValue?.breakdowns?.[0];
  if (!breakdownData) return null;
  return { dimensionKeys: breakdownData.dimension_keys, results: breakdownData.results };
}

/** לא זורקת — דמוגרפיה היא תוספת "יפה שיהיה", לא קריטית לשאר הסנכרון. */
async function fetchAudienceDemographicsSafely(
  accessToken: string
): Promise<{ genderJson: string | null; ageJson: string | null; countryJson: string | null }> {
  try {
    const profile = await getProfileSettings();
    const igId = profile.metaInstagramBusinessAccountId;
    if (!igId) return { genderJson: null, ageJson: null, countryJson: null };

    const genderData = await fetchFollowerDemographics(igId, accessToken, "gender");
    const genderBuckets: AudienceBucket[] = (genderData?.results ?? []).map((r) => ({
      label: r.dimension_values[0],
      value: r.value,
    }));

    const ageGenderData = await fetchFollowerDemographics(igId, accessToken, "age");
    const ageBuckets: AudienceBucket[] = (ageGenderData?.results ?? []).map((r) => ({
      label: r.dimension_values[0],
      value: r.value,
    }));

    const countryData = await fetchFollowerDemographics(igId, accessToken, "country");
    const countryBuckets: AudienceBucket[] = (countryData?.results ?? [])
      .map((r) => ({ label: r.dimension_values[0], value: r.value }))
      .sort((a, b) => b.value - a.value);

    return {
      genderJson: genderBuckets.length > 0 ? JSON.stringify(genderBuckets) : null,
      ageJson: ageBuckets.length > 0 ? JSON.stringify(ageBuckets) : null,
      countryJson: countryBuckets.length > 0 ? JSON.stringify(countryBuckets) : null,
    };
  } catch {
    return { genderJson: null, ageJson: null, countryJson: null };
  }
}

/** תיוג ידני (במקום AI) של פוסט מאינסטגרם — לא תלוי בקישור לתוכן מקומי בכלל. */
export async function classifyInstagramMediaManually(
  mediaId: string,
  input: { aiTheme?: string | null; aiFormat?: string | null }
) {
  return prisma.instagramMedia.update({
    where: { id: mediaId },
    data: {
      ...(input.aiTheme !== undefined ? { aiTheme: input.aiTheme } : {}),
      ...(input.aiFormat !== undefined ? { aiFormat: input.aiFormat } : {}),
    },
  });
}

function extractHashtags(caption: string | null): string[] {
  if (!caption) return [];
  const matches = caption.match(/#[^\s#@]+/g) ?? [];
  return matches.filter((tag) => tag !== ALWAYS_FIRST_HASHTAG);
}

function mediaTypeToLocalType(media: InstagramMediaSummary): "instagram_reel" | "instagram_carousel" | null {
  if (media.mediaType === "VIDEO") return "instagram_reel";
  if (media.mediaType === "CAROUSEL_ALBUM") return "instagram_carousel";
  return null; // IMAGE בודדת — לא בשימוש בזרימת העבודה שלה, לא ניתן להתאמה
}

export interface BackfillReportItem {
  permalink: string;
  timestamp: string;
  caption: string | null;
  reason: string;
}

export interface BackfillReport {
  linked: { permalink: string; hashtag: string }[];
  unmatched: BackfillReportItem[];
}

/**
 * עוברת על כל הפוסטים שפורסמו באינסטגרם מתאריך נתון, ומנסה להתאים כל אחד
 * מהם אוטומטית לתוכן מקומי (PlatformContent) לפי התגית הייחודית (מלבד
 * #אחתביום) שמופיעה גם בכיתוב באינסטגרם וגם בתגיות של הפוסט המקומי, ולפי
 * סוג הפוסט (ריל/קרוסלה). כשההתאמה חד-משמעית — מקשרת ומסנכרנת נתונים אמיתיים.
 */
export async function backfillInstagramMetrics(sinceDate: Date): Promise<BackfillReport> {
  const media = await fetchAllInstagramMediaSince(sinceDate);

  const localContents = await prisma.platformContent.findMany({
    where: { type: { in: ["instagram_reel", "instagram_carousel"] } },
    include: { post: true },
  });

  const linked: { permalink: string; hashtag: string }[] = [];
  const unmatched: BackfillReportItem[] = [];

  for (const item of media) {
    const localType = mediaTypeToLocalType(item);
    if (!localType) {
      unmatched.push({
        permalink: item.permalink,
        timestamp: item.timestamp,
        caption: item.caption,
        reason: "סוג פוסט שאינו ריל או קרוסלה — לא ניתן להתאמה אוטומטית",
      });
      continue;
    }

    const captionHashtags = extractHashtags(item.caption);
    if (captionHashtags.length === 0) {
      unmatched.push({
        permalink: item.permalink,
        timestamp: item.timestamp,
        caption: item.caption,
        reason: "אין תגית ייחודית בכיתוב לזיהוי",
      });
      continue;
    }

    const candidates = localContents.filter((c) => {
      if (c.type !== localType) return false;
      const postHashtags: string[] = JSON.parse(c.post.hashtags || "[]");
      return captionHashtags.some((tag) => postHashtags.includes(tag));
    });

    const distinctCandidates = [...new Set(candidates.map((c) => c.id))];

    if (distinctCandidates.length === 0) {
      unmatched.push({
        permalink: item.permalink,
        timestamp: item.timestamp,
        caption: item.caption,
        reason: "לא נמצא פוסט מקומי מתאים עם אותה תגית",
      });
      continue;
    }

    if (distinctCandidates.length > 1) {
      unmatched.push({
        permalink: item.permalink,
        timestamp: item.timestamp,
        caption: item.caption,
        reason: "נמצאו כמה פוסטים מקומיים מתאימים — צריך לקשר ידנית",
      });
      continue;
    }

    const matchedContent = candidates[0];
    await linkInstagramMedia(matchedContent.id, item.id, item.permalink);

    const postHashtags: string[] = JSON.parse(matchedContent.post.hashtags || "[]");
    linked.push({ permalink: item.permalink, hashtag: postHashtags[0] ?? "" });
  }

  return { linked, unmatched };
}
