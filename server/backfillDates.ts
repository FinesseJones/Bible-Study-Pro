import { getDb } from "./db";
import { studies } from "../drizzle/schema";
import { parseLessonDate, detectIOGCategory } from "./youtubeSync";
import { eq } from "drizzle-orm";

export async function backfillStudyDates() {
  const db = await getDb();
  if (!db) {
    console.error("[Backfill] Database not connected");
    return;
  }

  console.log("[Backfill] Starting study dates & category repair...");
  const allStudies = await db.select({
    id: studies.id,
    title: studies.title,
    category: studies.category,
    createdAt: studies.createdAt
  }).from(studies);

  console.log(`[Backfill] Processing ${allStudies.length} studies...`);
  let updatedCount = 0;

  for (const s of allStudies) {
    const parsedDate = parseLessonDate(s.title);
    const newCategory = detectIOGCategory(s.title, s.category || "Teaching");

    // If date parsed from title differs or category updated
    const dateDiff = Math.abs(parsedDate.getTime() - new Date(s.createdAt).getTime());
    const needsDateUpdate = dateDiff > 24 * 60 * 60 * 1000; // diff > 1 day
    const needsCategoryUpdate = newCategory !== s.category;

    if (needsDateUpdate || needsCategoryUpdate) {
      await db.update(studies).set({
        createdAt: needsDateUpdate ? parsedDate : undefined,
        category: newCategory,
      }).where(eq(studies.id, s.id));
      updatedCount++;
    }
  }

  console.log(`[Backfill] ✅ Completed! Updated ${updatedCount} / ${allStudies.length} studies with true broadcast dates.`);
}
