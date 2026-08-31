import { getDb } from "./db";
import { studies, pdfs, pdfSyncLogs } from "../drizzle/schema";
import { eq, and, desc, or, like } from "drizzle-orm";
import * as crypto from "crypto";
// @ts-ignore
import pdf from "pdf-parse";
import { findMatchingStudy, extractTitleFromFileName } from "./syncBibleLibrary";

const IOG_LESSONS_2026 = [
  { name: "1-03-26-TheLawComparedToTheLaw-BWF.pdf", url: "https://drive.google.com/file/d/1njxzh9t4vAFhSM_9D6znTUzrQVyfNlxy/view" },
  { name: "1-10-26-the-baptism-BWF.pdf", url: "https://drive.google.com/file/d/1Im_2kUSbEa-5pAVLrbaRSLDdjJM62pOH/view" },
  { name: "1-17-26-TheWordofTheKingofIsrael-BWF.pdf", url: "https://drive.google.com/file/d/1s2MeXHVSCu7ravesss3AH3aSKD5Mgo0p/view" },
  { name: "1-24-26-Jesus-Israel-Quran-BWF.pdf", url: "https://drive.google.com/file/d/1KvBHYg3JqpUNDU3lSkDr8IlEZOO1CRnD/view" },
  { name: "1-31-26-TheLordsPrayer-BWF.pdf", url: "https://drive.google.com/file/d/1UqNuyRidP66lU1a2dXD9sbgxWrAwIF2w/view" },
  { name: "1st-7th-FeastofUnleavenedBread-2026-BWF.pdf", url: "https://drive.google.com/file/d/1F-5H9_O6fy2oYtok6HNTsG8bxn77Xn4V/view" },
  { name: "2-07-26-BlackHistory-Pt1-Color-BWF.pdf", url: "https://drive.google.com/file/d/1TNuG-AnewCpjKesa9kAr8wOuU_BSNfOQ/view" },
  { name: "2-14-26-BlackHistory-Pt2-Slavery-BWF.pdf", url: "https://drive.google.com/file/d/1HAZXLlNwf57JAhaLko7hYiSuFG4N_exu/view" },
  { name: "2-21-26-BlackHistory-Pt3-SpiritualDeathRes-BWF.pdf", url: "https://drive.google.com/file/d/1MoZ86QFsV6hrssudFhYrFcuft8c92XhC/view" },
  { name: "2-28-26-BlackHistory-Pt 4-PriestsofGod-BWF.pdf", url: "https://drive.google.com/file/d/1doueuxPeULyAGOMopYOV47q1JHSbrtYd/view" },
  { name: "3-07-26-BlackHistory-Pt 5-TheAdoption-BWF.pdf", url: "https://drive.google.com/file/d/1eJhVCvTZBxVHa8tUIzEs5Z43BEJpg7_s/view" },
  { name: "03-14-26-TheApocryphaOnTrial-IsItTheWordofGod-BWF.pdf", url: "https://drive.google.com/file/d/1E8dzwNk5Son_6fT6wFGBSPQPBd5mlSOC/view" },
  { name: "3-21-26-Servants-Tried-Corr-Blessed-BWF.pdf", url: "https://drive.google.com/file/d/1PVbJPiDvW4BA-xI8HPARxJmmmNZRWGam/view" },
  { name: "3-28-26-PromiseAndTimeOfFulfillment-BWf.pdf", url: "https://drive.google.com/file/d/1fI0216YyOgch22OCSkXUofQx64VoI0J_" },
  { name: "4-01-26-Passover-BWF.pdf", url: "https://drive.google.com/file/d/1PqycXbVFEntu8106v0WRXz80hz-woK_D/view" },
  { name: "4-04-26-Easter-PaganFestivalNotHoly-BWF.pdf", url: "https://drive.google.com/file/d/13Ojjp48GwCG73L2h9vFyD3G7sN4Cm32H/view" },
  { name: "4-11-26-TheBigSwitch-BWF.pdf", url: "https://drive.google.com/file/d/1SS8XfRc21XPhPAUMwaw5SpADkf1vPe5s/view" },
  { name: "4-18-26-IsraelCaptiveBabylontoBabylon-BWF.pdf", url: "https://drive.google.com/file/d/1TBWIs561_QSCNqXHwgOllqMXkdi5ADX2/view" },
];

export function signRS256(payload: object, privateKey: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${base64Header}.${base64Payload}`);
  const signature = sign.sign(privateKey, "base64url");
  return `${base64Header}.${base64Payload}.${signature}`;
}

export async function getGoogleAccessToken(credentials: any): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
    exp,
    iat,
  };
  const normalizedKey = credentials.private_key.replace(/\\n/g, "\n");
  const jwt = signRS256(payload, normalizedKey);

  const res = await fetch(credentials.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth failed: ${res.statusText} - ${text}`);
  }

  const data: any = await res.json();
  return data.access_token;
}

export function getGoogleDriveFileId(url: string): string | null {
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return null;
}

export async function downloadGoogleDriveFile(fileId: string, accessToken: string): Promise<Buffer> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to download Google Drive file ${fileId}: ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function syncIOGLessons() {
  const db = await getDb();
  if (!db) {
    console.log("[IOG Sync] Database not connected, skipping sync.");
    return;
  }

  console.log("[IOG Sync] Starting Google Drive synchronization...");

  // Initialize a sync log entry in the database
  let logId: number | undefined;
  try {
    const insertLog = await db.insert(pdfSyncLogs).values({
      userId: 1,
      syncSource: "Google Drive Sync",
      status: "running",
      filesProcessed: 0,
      filesAdded: 0,
      filesFailed: 0,
      startedAt: new Date(),
    });
    logId = insertLog[0]?.insertId ?? (insertLog as any)?.insertId;
    if (!logId) {
      const latestLogs = await db.select().from(pdfSyncLogs).orderBy(desc(pdfSyncLogs.id)).limit(1);
      if (latestLogs.length > 0) {
        logId = latestLogs[0].id;
      }
    }
  } catch (logErr) {
    console.error("[IOG Sync] Failed to create sync log entry:", logErr);
  }

  // Load and authenticate Google Drive if credentials exist
  let accessToken: string | null = null;
  let clientEmail = "";
  if (process.env.GOOGLE_DRIVE_CREDENTIALS) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS);
      clientEmail = credentials.client_email || "";
      accessToken = await getGoogleAccessToken(credentials);
      console.log(`[IOG Sync] Google Drive authenticated successfully for: ${clientEmail}`);
    } catch (authErr) {
      console.error("[IOG Sync] Google Drive authentication failed. Fallback to offline index mode:", authErr);
    }
  } else {
    console.log("[IOG Sync] Missing GOOGLE_DRIVE_CREDENTIALS in environment. Fallback to offline index mode.");
  }

  let processedCount = 0;
  let addedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errorLogs: string[] = [];

  if (accessToken) {
    try {
      // Step 1: Query all folders accessible to the Service Account to build folder map
      const foldersMap = new Map<string, { name: string; parentId?: string }>();
      let nextFolderPageToken: string | undefined = undefined;

      console.log("[IOG Sync] Scanning Google Drive for folders...");
      do {
        const qFolders = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
        const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qFolders)}&fields=files(id,name,parents)&pageSize=1000${nextFolderPageToken ? `&pageToken=${nextFolderPageToken}` : ""}`;
        const folderRes = await fetch(folderUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        
        if (!folderRes.ok) {
          const errText = await folderRes.text();
          throw new Error(`Failed to fetch folders: ${folderRes.statusText} - ${errText}`);
        }

        const folderData: any = await folderRes.json();
        for (const file of folderData.files || []) {
          foldersMap.set(file.id, {
            name: file.name,
            parentId: file.parents?.[0]
          });
        }
        nextFolderPageToken = folderData.nextPageToken;
      } while (nextFolderPageToken);

      console.log(`[IOG Sync] Found ${foldersMap.size} folders accessible to Service Account.`);

      // Category mapper helper based on folders
      function getCategoryForFile(parentIds?: string[]): string {
        if (!parentIds || parentIds.length === 0) return "Unclassified";
        const directParentId = parentIds[0];
        const folderInfo = foldersMap.get(directParentId);
        
        if (!folderInfo) return "Unclassified";
        if (folderInfo.name.toLowerCase().includes("sync") || folderInfo.name.toLowerCase() === "drive") {
          return "General Study";
        }
        return folderInfo.name;
      }

      // Step 2: Query for all PDF, Google Doc, and text documents
      const filesList: any[] = [];
      let nextFilePageToken: string | undefined = undefined;
      console.log("[IOG Sync] Discovering documents in Google Drive...");

      const qFiles = "(mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'text/markdown') and trashed = false";
      
      do {
        const fileUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qFiles)}&fields=files(id,name,mimeType,size,parents,modifiedTime,createdTime,webViewLink,thumbnailLink)&pageSize=1000${nextFilePageToken ? `&pageToken=${nextFilePageToken}` : ""}`;
        const fileRes = await fetch(fileUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

        if (!fileRes.ok) {
          const errText = await fileRes.text();
          throw new Error(`Failed to fetch files: ${fileRes.statusText} - ${errText}`);
        }

        const fileData: any = await fileRes.json();
        if (fileData.files) {
          filesList.push(...fileData.files);
        }
        nextFilePageToken = fileData.nextPageToken;
      } while (nextFilePageToken);

      console.log(`[IOG Sync] Found ${filesList.length} documents on Google Drive to process.`);

      if (filesList.length > 0) {
        // Fetch only required columns to check for changes and avoid heavy text payloads
        const existingPdfs = await db.select({
          fileKey: pdfs.fileKey,
          metadata: pdfs.metadata,
        }).from(pdfs).where(eq(pdfs.syncSource, "Google Drive Sync"));
        const existingMap = new Map(existingPdfs.map(p => [p.fileKey, p]));

        for (const file of filesList) {
          processedCount++;
          try {
            const fileKey = `google-drive/${file.id}`;
            const existingRecord = existingMap.get(fileKey);
            const driveModified = file.modifiedTime ? new Date(file.modifiedTime).toISOString() : "";
            const prevModified = (existingRecord as any)?.metadata ? ((existingRecord as any).metadata as any).lastModified : "";

            // Incremental Sync Check: Skip if unmodified
            if (existingRecord && driveModified && driveModified === prevModified) {
              skippedCount++;
              continue;
            }

            console.log(`[IOG Sync] Processing file [${processedCount}/${filesList.length}]: "${file.name}" (Mime: ${file.mimeType})...`);
            
            let textContent = "";
            let fileBuffer: Buffer | null = null;
            let fileSize = file.size ? parseInt(file.size) : 0;

            // Step 3: Download & Parse based on MIME type
            if (file.mimeType === "application/pdf") {
              fileBuffer = await downloadGoogleDriveFile(file.id, accessToken);
              fileSize = fileBuffer.length;
              try {
                const parseData = await pdf(fileBuffer);
                textContent = (parseData.text || "")
                  .replace(/[^\w\s.-]/g, " ")
                  .replace(/\s+/g, " ")
                  .substring(0, 50000);
              } catch (pdfErr: any) {
                console.error(`[IOG Sync] Failed to parse PDF ${file.name}:`, pdfErr);
                textContent = `File: ${file.name} - Google Drive ID: ${file.id} (PDF Parsing Failed)`;
                errorLogs.push(`Failed parsing PDF "${file.name}": ${pdfErr.message || pdfErr}`);
              }
            } else if (file.mimeType === "application/vnd.google-apps.document") {
              // Google Docs: Call files.export to plain text
              const exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
              const exportRes = await fetch(exportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
              if (exportRes.ok) {
                textContent = await exportRes.text();
                fileSize = Buffer.byteLength(textContent);
                textContent = textContent
                  .replace(/[^\w\s.-]/g, " ")
                  .replace(/\s+/g, " ")
                  .substring(0, 50000);
              } else {
                console.error(`[IOG Sync] Failed to export Google Doc ${file.name}: ${exportRes.statusText}`);
                textContent = `File: ${file.name} - Google Drive ID: ${file.id} (Google Doc Export Failed)`;
                errorLogs.push(`Failed exporting Google Doc "${file.name}": ${exportRes.statusText}`);
              }
            } else if (file.mimeType === "text/plain" || file.mimeType === "text/markdown") {
              // Plain text / markdown files
              fileBuffer = await downloadGoogleDriveFile(file.id, accessToken);
              fileSize = fileBuffer.length;
              textContent = fileBuffer.toString("utf8")
                .replace(/[^\w\s.-]/g, " ")
                .replace(/\s+/g, " ")
                .substring(0, 50000);
            }

            // Step 4: Metadata extraction & study linking
            const cleanTitle = extractTitleFromFileName(file.name);
            const category = getCategoryForFile(file.parents);
            
            // Auto-link to studies via a targeted, indexed-level MySQL LIKE query
            let matchedStudyId: number | null = null;
            try {
              const searchTitle = cleanTitle || "";
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

              matchedStudyId = findMatchingStudy(cleanTitle, textContent, potentialMatches);
            } catch (matchErr) {
              console.warn(`[IOG Sync] Targeted matching failed for "${cleanTitle}", skipping auto-link:`, matchErr);
            }
            const fileUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
            // Use Google's auto-generated thumbnail if available, else a styled icon placeholder
            const thumbUrl = file.thumbnailLink
              ? file.thumbnailLink.replace(/=s\d+$/, "=s400") // request a larger size
              : "https://theisraelofgod.com/wp-content/uploads/2021/04/cropped-IOG-Logo-1-1.png";

            const documentMeta = {
              googleDriveFileId: file.id,
              parents: file.parents,
              mimeType: file.mimeType,
              lastModified: driveModified,
              createdTime: file.createdTime || "",
              lastSyncedAt: new Date().toISOString()
            };

            // Step 5: Save/Update in Database
            if (existingRecord) {
              await db.update(pdfs).set({
                fileName: file.name,
                extractedTitle: cleanTitle,
                category: category,
                fileSize: fileSize,
                fileUrl: fileUrl,
                thumbnailUrl: thumbUrl,
                textContent: textContent,
                studyId: matchedStudyId || undefined,
                metadata: documentMeta as any,
                updatedAt: new Date(),
                lastSyncedAt: new Date(),
              }).where(eq(pdfs.fileKey, fileKey));
              console.log(`[IOG Sync] Updated document: "${cleanTitle}" inside category "${category}"`);
            } else {
              await db.insert(pdfs).values({
                userId: 1,
                fileName: file.name,
                extractedTitle: cleanTitle,
                category: category,
                fileKey: fileKey,
                fileUrl: fileUrl,
                fileSize: fileSize,
                mimeType: file.mimeType === "application/pdf" ? "application/pdf" : "text/plain",
                thumbnailUrl: thumbUrl,
                textContent: textContent,
                studyId: matchedStudyId || undefined,
                metadata: documentMeta as any,
                syncSource: "Google Drive Sync",
                lastSyncedAt: new Date(),
              });
              console.log(`[IOG Sync] Indexed new document: "${cleanTitle}" inside category "${category}"`);
            }

            addedCount++;
          } catch (fileErr: any) {
            console.error(`[IOG Sync] Error syncing file ID ${file.id}:`, fileErr);
            failedCount++;
            errorLogs.push(`Failed syncing file ID ${file.id}: ${fileErr.message || fileErr}`);
          }
        }
      }
    } catch (crawlErr: any) {
      console.error("[IOG Sync] Google Drive crawling encountered a fatal error:", crawlErr);
      errorLogs.push(`Fatal crawl error: ${crawlErr.message || crawlErr}`);
      failedCount++;
    }
  }

  // Step 6: Fallback offline index loop (for 18 Sabbath lessons from 2026 list)
  console.log("[IOG Sync] Running offline list checks...");
  
  // Batch fetch existing fallback studies to avoid N+1 queries
  const existingOfflineStudies = await db.select({ id: studies.id, videoUrl: studies.videoUrl })
    .from(studies)
    .where(eq(studies.topic, "2026 Lesson Text"));
  const offlineStudiesMap = new Map(existingOfflineStudies.map(s => [s.videoUrl, s.id]));

  // Batch fetch existing fallback PDFs to avoid N+1 queries
  const existingOfflinePdfs = await db.select({ fileKey: pdfs.fileKey })
    .from(pdfs)
    .where(eq(pdfs.category, "IOG Lesson Text"));
  const offlinePdfsSet = new Set(existingOfflinePdfs.map(p => p.fileKey));

  for (const lesson of IOG_LESSONS_2026) {
    try {
      let studyId: number | undefined = offlineStudiesMap.get(lesson.url) as number | undefined;
      const studyTitle = lesson.name.replace("-BWF.pdf", "").replace(/-/g, " ");
      
      if (!studyId) {
        const insertResult = await db.insert(studies).values({
          userId: 1,
          title: studyTitle,
          category: "IOG Lesson Text",
          topic: "2026 Lesson Text",
          videoUrl: lesson.url,
          thumbnail: "https://theisraelofgod.com/wp-content/uploads/2021/04/cropped-IOG-Logo-1-1.png",
          description: `Official text lesson from The Israel of God (Pastor Henry Buie) for the 2026 calendar year.`,
          summary: `This is a PDF text lesson titled "${lesson.name}". It is part of the weekly Sabbath lessons taught by The Israel of God.`,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        studyId = insertResult[0]?.insertId;
        if (studyId) {
          console.log(`[IOG Sync] Created fallback study: "${studyTitle}" (ID: ${studyId})`);
          offlineStudiesMap.set(lesson.url, studyId);
        }
      }

      if (!studyId) continue;

      const fileId = getGoogleDriveFileId(lesson.url);
      if (!fileId) continue;

      const fileKey = `google-drive/${fileId}`;
      const hasPdf = offlinePdfsSet.has(fileKey);

      // Only sync if the PDF is not already indexed by the main crawl
      if (!hasPdf && accessToken) {
        console.log(`[IOG Sync] Syncing fallback PDF: "${lesson.name}"...`);
        const pdfBuffer = await downloadGoogleDriveFile(fileId, accessToken);
        
        let textContent = "";
        let pages = 1;

        try {
          const data = await pdf(pdfBuffer);
          pages = data.numpages || 1;
          textContent = (data.text || "")
            .replace(/[^\w\s.-]/g, " ")
            .replace(/\s+/g, " ")
            .substring(0, 50000);
        } catch (parseErr) {
          textContent = `File: ${lesson.name} - Google Drive ID: ${fileId}`;
        }

        await db.insert(pdfs).values({
          userId: 1,
          studyId: studyId,
          fileName: lesson.name,
          extractedTitle: studyTitle,
          category: "IOG Lesson Text",
          fileKey: fileKey,
          fileUrl: lesson.url,
          fileSize: pdfBuffer.length,
          mimeType: "application/pdf",
          thumbnailUrl: "https://theisraelofgod.com/wp-content/uploads/2021/04/cropped-IOG-Logo-1-1.png",
          textContent: textContent,
          metadata: {
            pages: pages,
            googleDriveFileId: fileId,
            lastSyncedAt: new Date().toISOString()
          } as any,
          syncSource: "Google Drive Sync",
          lastSyncedAt: new Date(),
        });
        console.log(`[IOG Sync] Indexed fallback PDF: "${studyTitle}"`);
        addedCount++;
        offlinePdfsSet.add(fileKey);
      }
    } catch (err: any) {
      console.error(`[IOG Sync] Fallback check failed for "${lesson.name}":`, err);
      errorLogs.push(`Failed offline check for "${lesson.name}": ${err.message || err}`);
    }
  }

  // Update synchronization log status to complete
  if (logId) {
    try {
      const finalStatus = failedCount > 0 ? "partial-error" : "success";
      await db.update(pdfSyncLogs).set({
        status: finalStatus,
        filesProcessed: processedCount,
        filesAdded: addedCount,
        filesFailed: failedCount,
        errorLog: errorLogs.length > 0 ? errorLogs.join("\n") : null,
        completedAt: new Date(),
      }).where(eq(pdfSyncLogs.id, logId));
    } catch (logErr) {
      console.error("[IOG Sync] Failed to update sync log entry:", logErr);
    }
  }

  console.log(`[IOG Sync] Crawl complete. Synced/Updated: ${addedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
}
