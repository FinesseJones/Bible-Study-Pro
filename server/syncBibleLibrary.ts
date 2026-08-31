import * as fs from "fs";
import * as path from "path";
import { getDb } from "./db";
import { pdfs, studies } from "../drizzle/schema";
import { eq, or, like } from "drizzle-orm";
// @ts-ignore
import pdf from "pdf-parse";
// @ts-ignore
import { fromPath } from "pdf2pic";
import chokidar from "chokidar";
import { invokeLLM } from "./_core/llm";

/**
 * Monitors and syncs PDFs from external BibleLibrary directories
 * Automatically extracts titles, clean text, categories, and generates thumbnails
 */

const BIBLE_LIBRARY_PATHS = [
  "/Volumes/FinesseJones1 External 1/BibleLibrary",
  "/Volumes/FinesseJones1 External 1/:BibleLibrary", // Legacy path
];

// Auto-categorization based on directory structure
const CATEGORY_MAP: Record<string, string> = {
  "prophecy": "Prophecy & End Times",
  "israel": "Israel & Covenant",
  "history": "Biblical History",
  "doctrine": "Doctrine & Theology",
  "commentary": "Commentaries",
  "apologetics": "Apologetics & Defense",
  "hebrew": "Hebrew & Language Study",
  "gentile": "Gentile Nations",
  "feasts": "Holy Feasts & Calendar",
  "spiritual": "Spiritual Growth",
  "teaching": "General Teaching",
  "study": "Study Materials",
  "journal": "Journal & Notes",
  "archive": "Archives",
};

function guessCategory(filePath: string, fileName: string): string {
  const lowPath = filePath.toLowerCase();
  
  for (const [key, category] of Object.entries(CATEGORY_MAP)) {
    if (lowPath.includes(key)) return category;
  }

  // Infer from filename keywords
  if (fileName.toLowerCase().includes("hebrew")) return "Hebrew & Language Study";
  if (fileName.toLowerCase().includes("prophecy")) return "Prophecy & End Times";
  if (fileName.toLowerCase().includes("israel")) return "Israel & Covenant";
  if (fileName.toLowerCase().includes("history")) return "Biblical History";
  if (fileName.toLowerCase().includes("commentary")) return "Commentaries";

  return "Unclassified";
}

let openRouterFailed = false;

/**
 * AI-Powered Categorization Engine (Phase 2.1)
 * Analyzes the first 1000 words of the PDF text to select the precise theological category
 */
async function aiCategorizePdf(
  textContent: string,
  fileName: string,
  fallbackCategory: string
): Promise<string> {
  if (openRouterFailed) {
    return fallbackCategory;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.log(`[BibleLibrary AI] OPENROUTER_API_KEY not found, defaulting to rule fallback "${fallbackCategory}" for "${fileName}"`);
    return fallbackCategory;
  }

  const cleanText = (textContent || "").trim();
  if (cleanText.length < 100 || cleanText.startsWith("File:")) {
    console.log(`[BibleLibrary AI] Document text too sparse, defaulting to rule fallback "${fallbackCategory}" for "${fileName}"`);
    return fallbackCategory;
  }

  try {
    const sampleText = cleanText.slice(0, 4000);
    const categoriesList = Object.values(CATEGORY_MAP);

    const systemPrompt = `You are an expert theological document classifier for Bible Study Pro, structured around the teachings of The Israel of God (Pastor Henry Buie).
Classify the provided document based on its filename and body text sample into exactly ONE of the official categories listed below:

${categoriesList.map(c => `- "${c}"`).join("\n")}

Respond ONLY with a JSON object in this format:
{
  "category": "Selected Category Name",
  "confidence": 0.95,
  "reason": "Brief theological justification"
}`;

    const userPrompt = `Document Filename: "${fileName}"
Content Sample:
"""
${sampleText}
"""

Categorize the document:`;

    const result = await invokeLLM({
      model: "google/gemini-2.5-flash",
      agentOverride: "openrouter",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      responseFormat: { type: "json_object" }
    });

    const content = result.choices?.[0]?.message?.content;
    const responseText = typeof content === "string" 
      ? content 
      : JSON.stringify(content || {});

    const parsed = JSON.parse(responseText);
    const selectedCategory = parsed.category;

    if (selectedCategory && categoriesList.includes(selectedCategory)) {
      console.log(`[BibleLibrary AI] Classified "${fileName}" -> "${selectedCategory}" (Confidence: ${parsed.confidence || "N/A"})`);
      return selectedCategory;
    }
    
    // Fuzzy matching
    const fuzzyMatch = categoriesList.find(c => c.toLowerCase() === selectedCategory?.toLowerCase());
    if (fuzzyMatch) {
      console.log(`[BibleLibrary AI] Fuzzy matched "${selectedCategory}" to official category "${fuzzyMatch}"`);
      return fuzzyMatch;
    }
  } catch (err: any) {
    console.error(`[BibleLibrary AI] AI categorization failed for "${fileName}", using fallback:`, err);
    if (err && (err.statusCode === 402 || err.message?.includes("credits") || err.message?.includes("Payment Required") || err.message?.includes("402"))) {
      console.warn("[BibleLibrary AI] OpenRouter out of credits or returned 402. Bypassing AI categorization for remaining files to avoid latency.");
      openRouterFailed = true;
    }
  }

  return fallbackCategory;
}

/**
 * Auto-linking PDFs to corresponding Studies/Video Lessons (Phase 3.1)
 * Compares titles, descriptions, and topics to match corresponding theological studies
 */
export function findMatchingStudy(
  pdfTitle: string,
  pdfText: string,
  studiesList: any[]
): number | null {
  if (studiesList.length === 0) return null;

  const cleanPdfTitle = pdfTitle.toLowerCase().replace(/[^\w\s]/g, "");
  const cleanPdfText = pdfText.toLowerCase();

  let bestMatchId: number | null = null;
  let bestScore = 0;

  for (const study of studiesList) {
    if (!study.title) continue;

    const cleanStudyTitle = study.title.toLowerCase().replace(/[^\w\s]/g, "");
    let score = 0;

    // 1. Exact title or subtitle match (highest priority)
    if (cleanPdfTitle === cleanStudyTitle) {
      score += 1.0;
    } else if (cleanPdfTitle.includes(cleanStudyTitle) || cleanStudyTitle.includes(cleanPdfTitle)) {
      score += 0.85;
    } else {
      // 2. Token overlap score between titles
      const pdfTokens = cleanPdfTitle.split(/\s+/).filter((t: string) => t.length > 3);
      const studyTokens = cleanStudyTitle.split(/\s+/).filter((t: string) => t.length > 3);
      
      let overlap = 0;
      for (const token of studyTokens) {
        if (pdfTokens.includes(token)) overlap++;
      }
      
      if (studyTokens.length > 0) {
        score += (overlap / Math.max(pdfTokens.length, studyTokens.length)) * 0.6;
      }
    }

    // 3. Mentions in content
    if (cleanPdfText.length > 100) {
      try {
        const escapedTitle = cleanStudyTitle.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const occurrences = (cleanPdfText.match(new RegExp(escapedTitle, "g")) || []).length;
        if (occurrences > 0) {
          score += Math.min(occurrences * 0.05, 0.2); // Cap at 0.2
        }
      } catch {
        // Safe regex fallback
      }

      // Check for matching topic/theme keywords
      if (study.topic) {
        const topicWords = study.topic.toLowerCase().split(/[\s,]+/);
        let topicMatches = 0;
        for (const word of topicWords) {
          if (word.length > 3 && cleanPdfText.includes(word)) {
            topicMatches++;
          }
        }
        if (topicWords.length > 0) {
          score += (topicMatches / topicWords.length) * 0.15;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatchId = study.id;
    }
  }

  // Threshold check - must be at least a 60% match confidence
  if (bestScore >= 0.60) {
    return bestMatchId;
  }

  return null;
}

export function extractTitleFromFileName(fileName: string): string {
  let title = fileName.replace(/\.(pdf|PDF)$/, "");
  title = title.replace(/^\d{4}-\d{2}-\d{2}[\s-]+/, "");
  title = title.replace(/[-_]/g, " ");
  title = title.replace(/\s+/g, " ").trim();
  
  return title.split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

async function generatePdfThumbnail(filePath: string): Promise<string | null> {
  try {
    const outputDir = path.join(process.cwd(), "client", "public", "thumbnails");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const fileName = path.basename(filePath, ".pdf");
    const options = {
      density: 100,
      saveFilename: fileName,
      savePath: outputDir,
      format: "png",
      width: 300,
      height: 400
    };
    
    const convert = fromPath(filePath, options);
    const result = await convert(1, false);
    
    const imageInfo = Array.isArray(result) ? result[0] : result;
    if (imageInfo && imageInfo.name) {
      return `/thumbnails/${imageInfo.name}`;
    }
  } catch (err) {
    // Graceful fallback to default logo
  }
  return "https://theisraelofgod.com/wp-content/uploads/2021/04/cropped-IOG-Logo-1-1.png";
}

async function walkDirectory(
  dir: string,
  callback: (filePath: string) => Promise<void>
) {
  if (!fs.existsSync(dir)) {
    console.log(`[BibleLibrary] Directory not found: ${dir}`);
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    if (entry.isDirectory()) {
      await walkDirectory(fullPath, callback);
    } else if (entry.name.toLowerCase().endsWith(".pdf")) {
      await callback(fullPath);
    }
  }
}

export async function syncBibleLibraryPdfs() {
  const db = await getDb();
  if (!db) {
    console.log("[BibleLibrary] Database not connected, skipping sync.");
    return;
  }

  console.log("[BibleLibrary] Starting PDF synchronization...");

  let totalAdded = 0;
  let totalSkipped = 0;

  const activePaths = BIBLE_LIBRARY_PATHS.filter(p => fs.existsSync(p));
  if (activePaths.length === 0) {
    console.log("[BibleLibrary] No BibleLibrary path found. Paths checked:", BIBLE_LIBRARY_PATHS);
    return;
  }

  console.log(`[BibleLibrary] Found active paths: ${activePaths.join(", ")}`);

  // Get existing PDFs to avoid duplicates and handle conflict updates (Phase 3.2)
  const existingPdfs = await db.select({ fileKey: pdfs.fileKey, fileSize: pdfs.fileSize, metadata: pdfs.metadata }).from(pdfs);
  const existingKeys = new Set(existingPdfs.map(p => p.fileKey));
  const recordMap = new Map(existingPdfs.map(p => [p.fileKey, p]));

  for (const activePath of activePaths) {
    console.log(`[BibleLibrary] Scanning directory: ${activePath}`);
    await walkDirectory(activePath, async (filePath) => {
      try {
        const fileName = path.basename(filePath);
        const parentPath = path.dirname(activePath);
        const fileKey = path.relative(parentPath, filePath);
        const dbFileKey = `biblelib/${fileKey}`;
        const stats = fs.statSync(filePath);

        // Conflict Resolution & Incremental Modification detection (Phase 3.2)
        if (existingKeys.has(dbFileKey)) {
          const record = recordMap.get(dbFileKey);
          const meta = (record as any)?.metadata as any;
          const currentModified = stats.mtime.toISOString();
          const prevModified = meta?.lastModified;

          if (record && stats.size === (record as any)?.fileSize && currentModified === prevModified) {
            totalSkipped++;
            return;
          }

          console.log(`[BibleLibrary] File modified on disk: ${fileName}. Performing conflict-resolution update...`);
          await syncSinglePdf(activePath, filePath, true);
          totalAdded++;
          return;
        }

        let textContent = "";
        let extractedTitle = extractTitleFromFileName(fileName);
        let pages = Math.ceil(stats.size / 5000);

        try {
          const buffer = fs.readFileSync(filePath);
          const data = await pdf(buffer);
          pages = data.numpages || pages;
          
          if (data.info?.Title && data.info.Title.trim().length > 3) {
            extractedTitle = data.info.Title.trim();
          } else if (data.text) {
            const lines = data.text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
            for (const line of lines) {
              if (line.length >= 5 && line.length <= 100 && !/^\d+$/.test(line)) {
                extractedTitle = line;
                break;
              }
            }
          }
          
          textContent = (data.text || "")
            .replace(/[^\w\s.-]/g, " ")
            .replace(/\s+/g, " ")
            .substring(0, 50000);
        } catch (parseErr) {
          console.log(`[BibleLibrary] Could not parse text using pdf-parse for ${fileName}, using fallback text`);
          textContent = `File: ${fileName} - Located at: ${activePath}`;
        }

        // Auto-categorization using AI (with fast rule fallback)
        const localCategory = guessCategory(filePath, fileName);
        const category = await aiCategorizePdf(textContent, fileName, localCategory);
        
        // Auto-linking to studies via a targeted, indexed-level MySQL LIKE query
        let matchedStudyId: number | null = null;
        try {
          const searchTitle = extractedTitle || "";
          const titleWords = searchTitle.split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
          let queryConditions: any[] = [];
          if (titleWords.length > 0) {
            queryConditions = titleWords.map(w => like(studies.title, `%${w}%`));
          } else if (searchTitle.length > 0) {
            queryConditions = [like(studies.title, `%${searchTitle}%`)];
          }

          const potentialMatches = queryConditions.length > 0
            ? await db.select({
                id: studies.id,
                title: studies.title,
                topic: studies.topic
              })
              .from(studies)
              .where(or(...queryConditions))
              .limit(30)
            : [];

          matchedStudyId = findMatchingStudy(extractedTitle, textContent, potentialMatches);
        } catch (matchErr) {
          console.warn(`[BibleLibrary] Targeted matching failed for "${extractedTitle}", skipping auto-link:`, matchErr);
        }
        const thumbnail = await generatePdfThumbnail(filePath);

        await db.insert(pdfs).values({
          userId: 1,
          fileName: fileName,
          extractedTitle: extractedTitle,
          category: category,
          fileKey: dbFileKey,
          fileUrl: `file://${filePath}`,
          fileSize: stats.size,
          mimeType: "application/pdf",
          thumbnailUrl: thumbnail,
          textContent: textContent,
          studyId: matchedStudyId || undefined,
          metadata: {
            pages: pages,
            relativePath: path.relative(activePath, filePath),
            lastModified: stats.mtime.toISOString(),
            libraryPath: activePath,
          } as any,
          syncSource: "BibleLibrary Auto-Sync",
          lastSyncedAt: new Date(),
        });

        totalAdded++;
        console.log(`[BibleLibrary] Indexed: ${extractedTitle} (${category})${matchedStudyId ? ` -> Auto-linked to Study ID ${matchedStudyId}` : ""}`);
      } catch (err) {
        console.error(`[BibleLibrary] Error processing file: ${filePath}`, err);
      }
    });
  }

  console.log(
    `[BibleLibrary] Sync complete. Added/Updated: ${totalAdded}, Skipped: ${totalSkipped}`
  );
}

/**
 * Watcher and incremental functions
 */
let watcher: chokidar.FSWatcher | null = null;

async function syncSinglePdf(activePath: string, filePath: string, allowUpdate: boolean = false) {
  const db = await getDb();
  if (!db) return;

  try {
    const fileName = path.basename(filePath);
    const parentPath = path.dirname(activePath);
    const fileKey = path.relative(parentPath, filePath);
    const dbFileKey = `biblelib/${fileKey}`;
    const stats = fs.statSync(filePath);

    let textContent = "";
    let extractedTitle = extractTitleFromFileName(fileName);
    let pages = Math.ceil(stats.size / 5000);

    try {
      const buffer = fs.readFileSync(filePath);
      const data = await pdf(buffer);
      pages = data.numpages || pages;
      
      if (data.info?.Title && data.info.Title.trim().length > 3) {
        extractedTitle = data.info.Title.trim();
      } else if (data.text) {
        const lines = data.text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        for (const line of lines) {
          if (line.length >= 5 && line.length <= 100 && !/^\d+$/.test(line)) {
            extractedTitle = line;
            break;
          }
        }
      }
      
      textContent = (data.text || "")
        .replace(/[^\w\s.-]/g, " ")
        .replace(/\s+/g, " ")
        .substring(0, 50000);
    } catch (parseErr) {
      console.log(`[BibleLibrary] Could not parse text using pdf-parse for ${fileName}, using fallback text`);
      textContent = `File: ${fileName} - Located at: ${activePath}`;
    }

    // Auto-categorization using AI (with fast rule fallback)
    const localCategory = guessCategory(filePath, fileName);
    const category = await aiCategorizePdf(textContent, fileName, localCategory);
    
    // Auto-linking to studies via a targeted, indexed-level MySQL LIKE query
    let matchedStudyId: number | null = null;
    try {
      const searchTitle = extractedTitle || "";
      const titleWords = searchTitle.split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
      let queryConditions: any[] = [];
      if (titleWords.length > 0) {
        queryConditions = titleWords.map(w => like(studies.title, `%${w}%`));
      } else if (searchTitle.length > 0) {
        queryConditions = [like(studies.title, `%${searchTitle}%`)];
      }

      const potentialMatches = queryConditions.length > 0
        ? await db.select({
            id: studies.id,
            title: studies.title,
            topic: studies.topic
          })
          .from(studies)
          .where(or(...queryConditions))
          .limit(30)
        : [];

      matchedStudyId = findMatchingStudy(extractedTitle, textContent, potentialMatches);
    } catch (matchErr) {
      console.warn(`[BibleLibrary Watcher] Targeted matching failed for "${extractedTitle}", skipping auto-link:`, matchErr);
    }
    const thumbnail = await generatePdfThumbnail(filePath);

    const existing = await db.select().from(pdfs).where(eq(pdfs.fileKey, dbFileKey)).limit(1);

    if (existing.length > 0) {
      if (allowUpdate) {
        await db.update(pdfs).set({
          fileName: fileName,
          extractedTitle: extractedTitle,
          category: category,
          fileSize: stats.size,
          thumbnailUrl: thumbnail,
          textContent: textContent,
          studyId: matchedStudyId || undefined,
          metadata: {
            pages: pages,
            relativePath: path.relative(activePath, filePath),
            lastModified: stats.mtime.toISOString(),
            libraryPath: activePath,
          } as any,
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        }).where(eq(pdfs.fileKey, dbFileKey));
        console.log(`[BibleLibrary Watcher] Updated: ${extractedTitle} (${category})${matchedStudyId ? ` -> Auto-linked to Study ID ${matchedStudyId}` : ""}`);
      }
    } else {
      await db.insert(pdfs).values({
        userId: 1,
        fileName: fileName,
        extractedTitle: extractedTitle,
        category: category,
        fileKey: dbFileKey,
        fileUrl: `file://${filePath}`,
        fileSize: stats.size,
        mimeType: "application/pdf",
        thumbnailUrl: thumbnail,
        textContent: textContent,
        studyId: matchedStudyId || undefined,
        metadata: {
          pages: pages,
          relativePath: path.relative(activePath, filePath),
          lastModified: stats.mtime.toISOString(),
          libraryPath: activePath,
        } as any,
        syncSource: "BibleLibrary Auto-Sync",
        lastSyncedAt: new Date(),
      });
      console.log(`[BibleLibrary Watcher] Indexed new file: ${extractedTitle} (${category})${matchedStudyId ? ` -> Auto-linked to Study ID ${matchedStudyId}` : ""}`);
    }
  } catch (err) {
    console.error(`[BibleLibrary Watcher] Error syncing file: ${filePath}`, err);
  }
}

async function removeSinglePdf(activePath: string, filePath: string) {
  const db = await getDb();
  if (!db) return;

  try {
    const parentPath = path.dirname(activePath);
    const fileKey = path.relative(parentPath, filePath);
    const dbFileKey = `biblelib/${fileKey}`;
    
    await db.delete(pdfs).where(eq(pdfs.fileKey, dbFileKey));
    console.log(`[BibleLibrary Watcher] Removed from database: ${fileKey}`);
  } catch (err) {
    console.error(`[BibleLibrary Watcher] Error deleting file from DB: ${filePath}`, err);
  }
}

function findActivePathForFile(filePath: string): string | null {
  return BIBLE_LIBRARY_PATHS.find(p => filePath.startsWith(p)) || null;
}

export function startBibleLibraryWatcher() {
  const activePaths = BIBLE_LIBRARY_PATHS.filter(p => fs.existsSync(p));
  if (activePaths.length === 0) {
    console.log("[BibleLibrary Watcher] No BibleLibrary path found. Watcher not started.");
    return;
  }

  console.log(`[BibleLibrary Watcher] Starting real-time directory watcher on: ${activePaths.join(", ")}`);
  
  watcher = chokidar.watch(activePaths, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
    depth: 99,
  });

  watcher
    .on("add", async (filePath) => {
      if (filePath.toLowerCase().endsWith(".pdf")) {
        console.log(`[BibleLibrary Watcher] File added: ${filePath}`);
        const activePath = findActivePathForFile(filePath);
        if (activePath) {
          await syncSinglePdf(activePath, filePath);
        }
      }
    })
    .on("change", async (filePath) => {
      if (filePath.toLowerCase().endsWith(".pdf")) {
        console.log(`[BibleLibrary Watcher] File changed: ${filePath}`);
        const activePath = findActivePathForFile(filePath);
        if (activePath) {
          await syncSinglePdf(activePath, filePath, true);
        }
      }
    })
    .on("unlink", async (filePath) => {
      if (filePath.toLowerCase().endsWith(".pdf")) {
        console.log(`[BibleLibrary Watcher] File deleted: ${filePath}`);
        const activePath = findActivePathForFile(filePath);
        if (activePath) {
          await removeSinglePdf(activePath, filePath);
        }
      }
    })
    .on("error", (error) => {
      console.error("[BibleLibrary Watcher] Error:", error);
    });
}

/**
 * Schedule periodic sync (call from cron or startup)
 */
export function scheduleBibleLibrarySyncJob() {
  // Initial sync on startup
  syncBibleLibraryPdfs()
    .then(() => {
      startBibleLibraryWatcher();
    })
    .catch(err =>
      console.error("[BibleLibrary] Initial sync error:", err)
    );

  // Periodic sync every 6 hours
  setInterval(() => {
    syncBibleLibraryPdfs().catch(err =>
      console.error("[BibleLibrary] Periodic sync error:", err)
    );
  }, 6 * 60 * 60 * 1000);

  console.log("[BibleLibrary] Sync job scheduled (every 6 hours) & watcher initialized");
}
