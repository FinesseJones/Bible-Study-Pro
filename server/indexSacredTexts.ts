import * as fs from "fs";
import * as path from "path";
import { getDb } from "./db";
import { studies } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const LIBRARY_PATH = "/Volumes/FinesseJones1 External 1/BibleLibrary/sacred-texts.com";

// Map directories to History categories
const CATEGORY_MAP: Record<string, string> = {
  "bib": "History: Bible & Prophecy",
  "jud": "History: Judaism",
  "chr": "History: Early Assembly",
  "afr": "History: African & Hebrew Connection",
  "ane": "History: Ancient Near East",
};

async function walk(dir: string, callback: (filePath: string) => Promise<void>) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      await walk(filePath, callback);
    } else if (file.endsWith(".htm") || file.endsWith(".html")) {
      await callback(filePath);
    }
  }
}

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  
  const h1Match = html.match(/<h1>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  
  return "Untitled Document";
}

function extractContent(html: string): string {
  // Simple regex to strip HTML tags and get body text
  let body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html;
  // Remove script and style tags
  body = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Remove other tags
  body = body.replace(/<[^>]+>/g, " ");
  // Unescape entities (basic)
  body = body.replace(/&nbsp;/g, " ");
  body = body.replace(/&amp;/g, "&");
  body = body.replace(/&lt;/g, "<");
  body = body.replace(/&gt;/g, ">");
  
  return body.trim().substring(0, 5000); // Store first 5000 chars
}

export async function indexSacredTexts() {
  const db = await getDb();
  if (!db) return;

  console.log("[Sacred Texts] Starting indexing...");

  // Load existing URLs from DB to avoid duplicate indexing and roundtrips
  const existingLessons = await db.select({ videoUrl: studies.videoUrl })
    .from(studies)
    .where(eq(studies.topic, "Sacred Texts Library"));
  
  const existingUrls = new Set(existingLessons.map(l => l.videoUrl).filter(Boolean));
  console.log(`[Sacred Texts] Found ${existingUrls.size} already indexed files in database.`);

  for (const [subDir, category] of Object.entries(CATEGORY_MAP)) {
    const fullPath = path.join(LIBRARY_PATH, subDir);
    if (!fs.existsSync(fullPath)) continue;

    console.log(`[Sacred Texts] Indexing ${category}...`);
    let count = 0;
    let added = 0;

    await walk(fullPath, async (filePath) => {
      const relativePath = path.relative(LIBRARY_PATH, filePath);
      const url = `https://sacred-texts.com/${relativePath}`;

      if (existingUrls.has(url)) {
        count++;
        return; // Already indexed!
      }

      const html = fs.readFileSync(filePath, "utf-8");
      const title = extractTitle(html);
      const content = extractContent(html);
      
      await db.insert(studies).values({
        userId: 1,
        title: title.substring(0, 255),
        category: category,
        topic: "Sacred Texts Library",
        description: content.substring(0, 1000), // Short description
        summary: content.substring(0, 5000), // Longer content for AI
        videoUrl: url, // Using videoUrl to store the original link
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      count++;
      added++;
      if (count % 100 === 0) console.log(`[Sacred Texts] Processed ${count} files, inserted ${added} new in ${category}...`);
    });

    console.log(`[Sacred Texts] Finished ${category}. Total processed: ${count}, New inserted: ${added}`);
  }

  console.log("[Sacred Texts] Indexing complete.");
}
