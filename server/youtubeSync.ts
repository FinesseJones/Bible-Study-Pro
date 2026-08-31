import { ENV } from "./_core/env";
import { getDb } from "./db";
import { studies } from "../drizzle/schema";
import { eq, inArray, and } from "drizzle-orm";

export const PLAYLIST_MAP: Record<string, string> = {
  // Main Channel Uploads & Playlists
  "UUbxDKaZwac5KMC04DTT8pFw": "IOG Main Channel",
  "PL4AAB1A9F0B61E4F2": "IOG Chicago (Main)",
  "PLs5a5c-bGaMdWUffiy1l71Vn3AYaXOY8e": "IOG Chicago Sabbath Lessons",
  
  // Satellite Branches (Direct Upload Feeds & Playlists)
  "UUt2bVZ4KaO-bILIWQa9sg4g": "IOG Baltimore, MD",
  "UUvF-rWmHipRjNtC13KQNpZQ": "IOG Fort Lauderdale, FL",
  "UUXGzRAIq_83ny7VR0Yx-S2Q": "IOG Jacksonville, FL",
  "UUhIy8JNN7n_P0inZ34h9YPw": "IOG Memphis, TN",
  "UUBUWWHliwV6DyVOYV5Hg99A": "IOG Buffalo, NY",
  "UCC91FjpDDnbrLUwTbObsWog": "IOG Rialto / West Coast, CA",
  "UU3-6xBpSX0wjVFMLg7tKfNw": "IOGIsrael (Q&A / Prayers)",
  
  // Regional Branch Playlists
  "PLs5a5c-bGaMfGByWnsUdX3RPOjTuwawXd": "IOG Atlanta, GA",
  "PLvdDyoGTWuM3ctavRXZeeuBJkM2QX2yxx": "IOG Atlanta, GA",
  "PL631559A636B66E18": "IOG Houston, TX",
  "PLvdDyoGTWuM0W1wP6GHh80vS_r5Y1bfV2": "IOG Los Angeles, CA",
  "PLvdDyoGTWuM0psGpdhk3leNG8B6V0ondm": "IOG Orlando, FL",
  "PLs5a5c-bGaMcWsp4rKAUPq5dXoBI59SdV": "IOG Florida",
};

export const PLAYLISTS = Object.keys(PLAYLIST_MAP);

/**
 * Parses the broadcast date of a lesson from title or YouTube publishedAt timestamp.
 */
export function parseLessonDate(title: string, publishedAt?: string): Date {
  const now = new Date();

  // Handle multi-day ranges like 03/29-30/19 or 03-29-30-19
  const rangeMatch = title.match(/\b(0?[1-9]|1[0-2])[\/\-](?:\d{1,2})[\-\/](?:\d{1,2})[\/\-](\d{2,4})\b/);
  if (rangeMatch) {
    const month = parseInt(rangeMatch[1], 10);
    let year = parseInt(rangeMatch[2], 10);
    if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;
    const d = new Date(year, month - 1, 1, 12, 0, 0);
    if (!isNaN(d.getTime()) && d.getTime() <= now.getTime() + 86400000) return d;
  }

  // Standard date matching M-D-YY or MM-DD-YYYY
  const dateMatch = title.match(/\b(0?[1-9]|1[0-2])[\-\/\.](0?[1-9]|[12]\d|3[01])[\-\/\.](20\d{2}|\d{2})\b/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1], 10);
    const day = parseInt(dateMatch[2], 10);
    let year = parseInt(dateMatch[3], 10);
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    const d = new Date(year, month - 1, day, 12, 0, 0);
    if (!isNaN(d.getTime()) && d.getTime() <= now.getTime() + 86400000) {
      return d;
    }
  }

  // Fallback to YouTube API publishedAt timestamp
  if (publishedAt) {
    const d = new Date(publishedAt);
    if (!isNaN(d.getTime()) && d.getTime() <= now.getTime() + 86400000) return d;
  }

  return now;
}

/**
 * Detects the specific IOG campus from the title prefix or defaults to playlist category.
 */
export function detectIOGCategory(title: string, defaultCategory: string): string {
  const t = title.toUpperCase();
  if (t.includes("BALTIMORE")) return "IOG Baltimore, MD";
  if (t.includes("JACKSONVILLE")) return "IOG Jacksonville, FL";
  if (t.includes("JACKSON")) return "IOG Jackson, MS";
  if (t.includes("FORT LAUDERDALE") || t.includes("FT. LAUDERDALE") || t.includes("FT LAUDERDALE")) return "IOG Fort Lauderdale, FL";
  if (t.includes("MEMPHIS")) return "IOG Memphis, TN";
  if (t.includes("ATLANTA") || t.includes("ATL")) return "IOG Atlanta, GA";
  if (t.includes("ORLANDO")) return "IOG Orlando, FL";
  if (t.includes("HOUSTON")) return "IOG Houston, TX";
  if (t.includes("DALLAS")) return "IOG Dallas, TX";
  if (t.includes("DETROIT")) return "IOG Detroit, MI";
  if (t.includes("PHOENIX")) return "IOG Phoenix, AZ";
  if (t.includes("ST. LOUIS") || t.includes("ST LOUIS")) return "IOG St. Louis, MO";
  if (t.includes("MINNEAPOLIS") || t.includes("MPLS")) return "IOG Minneapolis, MN";
  if (t.includes("WASHINGTON DC") || t.includes("WASHINGTON D.C.") || t.includes("IOG DC")) return "IOG Washington, D.C.";
  if (t.includes("BUFFALO")) return "IOG Buffalo, NY";
  if (t.includes("LOS ANGELES") || t.includes("RIALTO") || t.includes("IOG LA")) return "IOG Los Angeles, CA";
  if (t.includes("BATON ROUGE")) return "IOG Baton Rouge, LA";
  if (t.includes("MONTGOMERY")) return "IOG Montgomery, AL";
  if (t.includes("BIRMINGHAM")) return "IOG Birmingham, AL";
  if (t.includes("CHICAGO")) return "IOG Chicago (Main)";
  if (t.includes("Q&A") || t.includes("PRAYER")) return "IOG Q&A & Prayers";

  return defaultCategory;
}

export async function runYouTubeSync() {
  const apiKey = ENV.youtubeApiKey;
  if (!apiKey) {
    console.log("[YouTube Sync] Missing API Key, skipping sync.");
    return { success: false, message: "Missing YouTube API Key" };
  }

  const db = await getDb();
  if (!db) {
    console.log("[YouTube Sync] Database not connected, skipping sync.");
    return { success: false, message: "Database not connected" };
  }

  console.log(`[YouTube Sync] Starting synchronization of ${PLAYLISTS.length} channels & playlists...`);

  const existingUrls = new Set<string>();
  let totalNewAdded = 0;
  let totalUpdated = 0;

  for (const playlistId of PLAYLISTS) {
    try {
      let nextPageToken: string | undefined = undefined;
      let pageCount = 0;

      do {
        pageCount++;
        const pageQuery = nextPageToken ? `&pageToken=${nextPageToken}` : "";
        // Request both snippet and contentDetails to get the exact publishedAt date
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${apiKey}${pageQuery}`
        );
        
        if (!res.ok) {
          console.error(`[YouTube Sync] Error fetching playlist ${playlistId}: ${res.statusText}`);
          break;
        }

        const data: any = await res.json();
        if (!data.items || data.items.length === 0) break;

        const pageUrls = data.items.map((item: any) => {
          const videoId = item.snippet?.resourceId?.videoId || item.contentDetails?.videoId;
          return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
        }).filter(Boolean) as string[];

        if (pageUrls.length > 0) {
          const matchedRecords = await db.select({ videoUrl: studies.videoUrl, id: studies.id, createdAt: studies.createdAt })
            .from(studies)
            .where(and(
              eq(studies.userId, 1),
              inArray(studies.videoUrl, pageUrls)
            ));
          for (const r of matchedRecords) {
            if (r.videoUrl) {
              existingUrls.add(r.videoUrl);
            }
          }
        }

        const newStudies: any[] = [];
        for (const item of data.items) {
          const videoId = item.snippet?.resourceId?.videoId || item.contentDetails?.videoId;
          if (!videoId) continue;
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          
          const title = item.snippet?.title || "";
          if (title === "Private video" || title === "Deleted video") continue;

          const rawPublished = item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt;
          const lessonDate = parseLessonDate(title, rawPublished);
          const category = detectIOGCategory(title, PLAYLIST_MAP[playlistId] || "Teaching");
          const description = item.snippet?.description ? item.snippet.description.substring(0, 500) : "";
          const thumbnail = item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "";

          if (existingUrls.has(videoUrl)) {
            // Video exists: update date and category if needed
            await db.update(studies).set({
              createdAt: lessonDate,
              category,
              thumbnail: thumbnail || undefined,
            }).where(and(eq(studies.userId, 1), eq(studies.videoUrl, videoUrl)));
            totalUpdated++;
            continue;
          }

          newStudies.push({
            userId: 1,
            title: title,
            description: description,
            videoUrl: videoUrl,
            thumbnail: thumbnail,
            category: category,
            topic: "YouTube Sync",
            createdAt: lessonDate,
            updatedAt: new Date(),
          });

          existingUrls.add(videoUrl);
          totalNewAdded++;
        }

        if (newStudies.length > 0) {
          await db.insert(studies).values(newStudies);
        }

        nextPageToken = data.nextPageToken;
        // On regular background syncs, fetching the first 3 pages (150 newest videos) per channel is lightning fast
        if (pageCount >= 3 && totalNewAdded === 0) {
          break;
        }
      } while (nextPageToken);
      
    } catch (err) {
      console.error(`[YouTube Sync] Failed on playlist ${playlistId}:`, err);
    }
  }

  console.log(`[YouTube Sync] Complete. Added: ${totalNewAdded}, Updated: ${totalUpdated}.`);
  return { success: true, added: totalNewAdded, updated: totalUpdated };
}
