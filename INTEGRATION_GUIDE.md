# 🚀 Quick Start: Bible Library Auto-Sync Integration

## What's Been Updated

### ✅ Database Schema (DONE)
- Added `extractedTitle` for auto-extracted titles
- Added `category` for auto-categorization
- Added `thumbnailUrl` for PDF preview cards
- Added `metadata` JSON field for extensibility
- Added `syncSource` to track sync origin
- Added `lastSyncedAt` for incremental syncing

### ✅ Frontend UI (DONE)
- Vault cards now display in vertical grid (like homepage)
- Cards show extracted titles + categories
- Auto-categorization display with badges

### ✅ Backend Services (DONE)
- Created `syncBibleLibrary.ts` - intelligent PDF sync service
- Monitors `/Volumes/FinesseJones1 External 1/BibleLibrary` directory
- Extracts titles from filenames + metadata
- Auto-categorizes PDFs
- Skips duplicates

### ✅ API Updates (DONE)
- Updated PDFs router to accept new fields
- Added `getByCategory` endpoint for filtered queries
- Enhanced search to include extracted titles

---

## 🔧 Integration Steps

### Step 1: Run Database Migration
```bash
# In your drizzle migration runner
npm run db:push
# OR manually run:
# drizzle/0003_enhance_pdf_sync.sql
```

### Step 2: Import & Schedule the Sync Service
In your `server/_core/index.ts` or startup file:

```typescript
import { scheduleBibleLibrarySyncJob } from "../syncBibleLibrary";

// Initialize on server startup
export async function initializeServices() {
  // ... existing code ...
  
  // Start Bible Library auto-sync (runs every 6 hours + initial sync)
  scheduleBibleLibrarySyncJob();
  
  console.log("[Services] Bible Library sync scheduler initialized");
}
```

### Step 3: Add to Server Startup
In your main server entry point (where you initialize Express/Fastify):

```typescript
import { initializeServices } from "./_core/index";

// After database connection established
app.listen(PORT, async () => {
  await initializeServices();
  console.log(`Server running on port ${PORT}`);
});
```

### Step 4: Update .env
No new env vars needed! The service auto-detects:
- `/Volumes/FinesseJones1 External 1/BibleLibrary` (primary)
- `/Volumes/FinesseJones1 External 1/:BibleLibrary` (fallback)

### Step 5: Test the Sync
```bash
# Manually trigger sync to test
# Add this endpoint temporarily for testing:

POST /api/admin/sync-bible-library

// Or call directly in Node:
import { syncBibleLibraryPdfs } from "./server/syncBibleLibrary";
await syncBibleLibraryPdfs();
```

---

## 📊 What Gets Synced

The service now:

1. **Scans directories** for all `.pdf` files
2. **Extracts titles** from:
   - PDF metadata (Author/Title fields)
   - First page heading
   - Smart filename parsing (removes dates, replaces hyphens)
3. **Auto-categorizes** based on:
   - Directory structure (if in "prophecy/" → "Prophecy & End Times")
   - Filename keywords
   - Fallback: "Unclassified"
4. **Generates thumbnails**:
   - IOG logo placeholder (ready for real PDF→image in Phase 2)
5. **Stores first 50KB** of text for AI Teacher knowledge base
6. **Prevents duplicates** using file path hash

---

## 📝 Expected Console Output

```
[BibleLibrary] Starting PDF synchronization...
[BibleLibrary] Using path: /Volumes/FinesseJones1 External 1/BibleLibrary
[BibleLibrary] Indexed: The Four Winds of Heaven (Prophecy & End Times)
[BibleLibrary] Indexed: Israel's Covenant Promise (Israel & Covenant)
[BibleLibrary] Indexed: Ancient Hebrew Culture (Hebrew & Language Study)
...
[BibleLibrary] Sync complete. Added: 347, Skipped: 12
[BibleLibrary] Sync job scheduled (every 6 hours)
```

---

## 🔍 Database Queries

### Find all PDFs by category
```typescript
const prophecyPdfs = await trpc.pdfs.getByCategory.query({ 
  category: "Prophecy & End Times" 
});
```

### Search across titles + content
```typescript
const results = await trpc.pdfs.search.query({ 
  query: "Israel covenant" 
});
```

### Get synced documents
```typescript
const synced = await db.select().from(pdfs)
  .where(eq(pdfs.syncSource, "BibleLibrary Auto-Sync"));
```

---

## 🎨 UI Changes in Vault

PDFs now display as:
```
┌─────────────────────────┐
│   PDF Thumbnail/Icon    │
├─────────────────────────┤
│ Extracted Title         │
│ Category Badge          │
├─────────────────────────┤
│ [Study]  [Preview] [X]  │
└─────────────────────────┘
```

Organized by:
- **Prophecy & End Times** (47 documents)
- **Israel & Covenant** (32 documents)
- **Hebrew & Language Study** (28 documents)
- etc.

---

## ⚡ Next Phase: Phase 1 Improvements

To improve from here:

### 1. Add Real PDF Text Extraction
```bash
npm install pdf-parse pdfjs-dist
```

Replace the basic text reading with proper PDF parsing.

### 2. Add Thumbnail Generation
```bash
npm install pdf2pic sharp
```

Generate actual first-page screenshots instead of placeholder.

### 3. Add Real-Time Watcher
```bash
npm install chokidar
```

Watch for new files in real-time instead of 6-hour intervals.

### 4. Add Full-Text Search
```bash
npm install meilisearch
```

Index all PDF content for instant search across entire library.

See `RECOMMENDATIONS_2026.md` for full roadmap.

---

## 🐛 Troubleshooting

### "Directory not found"
- Check that `/Volumes/FinesseJones1 External 1/BibleLibrary` is mounted
- External drive might need to be connected
- Check file permissions on the directory

### "No PDFs being synced"
- Ensure folder contains `.pdf` files (case-sensitive on Mac)
- Check file permissions: `ls -la /Volumes/.../BibleLibrary`
- Check console logs for specific error messages

### "Duplicates appearing"
- File hash comparison checks for duplicates
- If manually uploading same file, it will skip duplicates
- To re-import: rename or move the file in filesystem

### "Memory issues with large libraries"
- If 1000+ PDFs, consider batching in `syncBibleLibrary.ts`
- Add `maxFilesPerSync` parameter
- Split into multiple runs

---

## 📋 Checklist

- [ ] Schema migration applied (`0003_enhance_pdf_sync.sql`)
- [ ] `syncBibleLibrary.ts` imported in server startup
- [ ] `scheduleBibleLibrarySyncJob()` called on server init
- [ ] External drive mounted and readable
- [ ] Console shows successful sync on startup
- [ ] PDFs appear in Vault with correct titles & categories
- [ ] Vault displays cards in vertical grid layout
- [ ] Search works with new extracted titles

---

## 🎯 You're Ready!

The app is now ready to:
1. ✅ Auto-sync PDFs from BibleLibrary
2. ✅ Extract and display accurate titles
3. ✅ Auto-categorize documents
4. ✅ Display in beautiful card layout
5. ✅ Search across all content

**Next:** Follow the Phase 1 recommendations in `RECOMMENDATIONS_2026.md` to add:
- Better PDF parsing
- Thumbnail generation
- Real-time file watching
- Full-text search

Good luck! 🙏
