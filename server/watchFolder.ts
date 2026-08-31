/**
 * watchFolder.ts
 * 
 * Watches ~/Documents/Bible Study Pro/ for new files and automatically indexes
 * them into the database so they appear in the Vault and are searchable by the AI.
 * 
 * Folder structure you can use:
 *   ~/Documents/Bible Study Pro/               → category: "My Documents"
 *   ~/Documents/Bible Study Pro/History/       → category: "Biblical History"
 *   ~/Documents/Bible Study Pro/Hebrew/        → category: "Hebrew & Language Study"
 *   ~/Documents/Bible Study Pro/Lessons/       → category: "Lesson Notes"
 *   ~/Documents/Bible Study Pro/<Any Name>/    → category: that folder name
 * 
 * Supported file types: .pdf, .txt, .md, .doc, .docx
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
// @ts-ignore
import pdf from "pdf-parse";
import { getDb } from "./db";
import { pdfs } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// The root watch folder — lives in the user's Documents
export const WATCH_FOLDER = path.join(os.homedir(), "Documents", "Bible Study Pro");

// Supported file extensions
const SUPPORTED_EXTENSIONS = new Set([".pdf", ".txt", ".md", ".doc", ".docx"]);

// Map subfolder names to clean category labels shown in the Vault
const CATEGORY_MAP: Record<string, string> = {
  history: "Biblical History",
  biblical: "Biblical History",
  hebrew: "Hebrew & Language Study",
  language: "Hebrew & Language Study",
  lessons: "Lesson Notes",
  lesson: "Lesson Notes",
  notes: "Lesson Notes",
  archives: "Archives",
  study: "Study Materials",
  research: "Study Materials",
};

function resolveCategory(filePath: string): string {
  const relative = path.relative(WATCH_FOLDER, filePath);
  const parts = relative.split(path.sep);
  if (parts.length >= 2) {
    const folderName = parts[0].toLowerCase().replace(/[^a-z]/g, "");
    return CATEGORY_MAP[folderName] || parts[0]; // use mapped name or raw folder name
  }
  return "My Documents";
}

async function extractText(filePath: string, ext: string): Promise<string> {
  try {
    if (ext === ".pdf") {
      const buf = fs.readFileSync(filePath);
      if (buf.length < 10) return "";
      const data = await pdf(buf);
      return (data.text || "").substring(0, 80000);
    }
    if ([".txt", ".md"].includes(ext)) {
      return fs.readFileSync(filePath, "utf8").substring(0, 80000);
    }
    // .doc/.docx — just store the filename for searchability, no binary parse
    return "";
  } catch {
    return "";
  }
}

async function indexFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return;

  // Skip hidden/system files
  const base = path.basename(filePath);
  if (base.startsWith(".") || base.startsWith("~$")) return;

  const db = await getDb();
  if (!db) return;

  // Use a stable fileKey so we can upsert without duplicates
  const fileKey = `watch-folder:${crypto.createHash("sha1").update(filePath).digest("hex")}`;

  try {
    const stat = fs.statSync(filePath);
    const category = resolveCategory(filePath);
    const cleanTitle = base.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

    // Extract text content
    const textContent = await extractText(filePath, ext);

    // Build a local file:// URL so the app can open it
    const fileUrl = `file://${filePath}`;

    // Check if already indexed
    const existing = await db.select({ id: pdfs.id }).from(pdfs)
      .where(eq(pdfs.fileKey, fileKey))
      .limit(1);

    if (existing.length > 0) {
      // Update existing record (content may have changed)
      await db.update(pdfs).set({
        fileName: base,
        extractedTitle: cleanTitle,
        category,
        fileSize: stat.size,
        fileUrl,
        textContent,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(pdfs.fileKey, fileKey));
      console.log(`[Watch Folder] Updated: "${cleanTitle}" → ${category}`);
    } else {
      // Insert new record
      await db.insert(pdfs).values({
        userId: 1,
        fileName: base,
        extractedTitle: cleanTitle,
        category,
        fileKey,
        fileUrl,
        fileSize: stat.size,
        mimeType: ext === ".pdf" ? "application/pdf" : "text/plain",
        textContent,
        syncSource: "Watch Folder",
        lastSyncedAt: new Date(),
      });
      console.log(`[Watch Folder] Indexed new file: "${cleanTitle}" → ${category}`);
    }
  } catch (err) {
    console.error(`[Watch Folder] Failed to index "${filePath}":`, err);
  }
}

async function removeFile(filePath: string) {
  const db = await getDb();
  if (!db) return;
  const fileKey = `watch-folder:${crypto.createHash("sha1").update(filePath).digest("hex")}`;
  try {
    await db.delete(pdfs).where(eq(pdfs.fileKey, fileKey));
    console.log(`[Watch Folder] Removed: "${path.basename(filePath)}"`);
  } catch {}
}

/** Scan the entire watch folder on startup to catch any files added while app was closed */
async function scanAll(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanAll(full); // recurse into subfolders
    } else if (entry.isFile()) {
      await indexFile(full);
    }
  }
}

/** Start watching the folder for live changes */
export function startWatchFolder() {
  // Create the folder (and a README) if it doesn't exist yet
  if (!fs.existsSync(WATCH_FOLDER)) {
    fs.mkdirSync(WATCH_FOLDER, { recursive: true });

    // Create helpful subfolders
    for (const sub of ["History", "Hebrew & Language", "Lesson Notes", "Archives"]) {
      fs.mkdirSync(path.join(WATCH_FOLDER, sub), { recursive: true });
    }

    // Write a README so the user knows what it's for
    fs.writeFileSync(
      path.join(WATCH_FOLDER, "HOW TO USE THIS FOLDER.txt"),
      [
        "BIBLE STUDY PRO — SYNC FOLDER",
        "================================",
        "",
        "Drop any PDF, Word doc, or text file into this folder (or a subfolder)",
        "and it will automatically appear in your Scripture Vault within seconds.",
        "",
        "SUBFOLDERS:",
        "  History/           → Biblical History section in Vault",
        "  Hebrew & Language/ → Hebrew & Language Study section",
        "  Lesson Notes/      → Lesson Notes section",
        "  Archives/          → Archives section",
        "  (any new folder)   → Creates a new section automatically",
        "",
        "SUPPORTED FILE TYPES: PDF, TXT, MD, DOC, DOCX",
        "",
        "The AI Teacher can answer questions about anything in this folder.",
      ].join("\n")
    );

    console.log(`[Watch Folder] Created sync folder at: ${WATCH_FOLDER}`);
  }

  // Scan all existing files first (catches files added while app was off)
  console.log(`[Watch Folder] Scanning existing files in: ${WATCH_FOLDER}`);
  scanAll(WATCH_FOLDER).catch(console.error);

  // Watch for live changes using Node's recursive fs.watch
  const watcher = fs.watch(WATCH_FOLDER, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const fullPath = path.join(WATCH_FOLDER, filename);
    const ext = path.extname(filename).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(ext)) return;
    if (path.basename(filename).startsWith(".")) return;

    // Small delay to let the file finish writing before we read it
    setTimeout(async () => {
      if (fs.existsSync(fullPath)) {
        await indexFile(fullPath);
      } else {
        // File was deleted
        await removeFile(fullPath);
      }
    }, 1500);
  });

  watcher.on("error", (err) => {
    console.error("[Watch Folder] Watcher error:", err);
  });

  console.log(`[Watch Folder] ✅ Watching: ${WATCH_FOLDER}`);
  return watcher;
}
