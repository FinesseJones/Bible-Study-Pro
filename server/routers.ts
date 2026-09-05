import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { studies, pdfs, cornellNotes, tags, studyTags, aiInteractions, aiMemory, milestones, journalEntries, liveTranscripts, streamingConversations, InsertStudy, InsertPDF, InsertCornellNote, InsertTag, InsertAIInteraction, InsertMilestone, InsertJournalEntry, InsertLiveTranscript, InsertStreamingConversation } from "../drizzle/schema";
import { eq, and, or, like, desc, sql, isNotNull } from "drizzle-orm";
import { getGoogleAccessToken, downloadGoogleDriveFile, syncIOGLessons } from "./syncIOGLessons";
import { runYouTubeSync } from "./youtubeSync";
import { invokeLLM, createSSEStream } from "./_core/llm";
import { searchWeb } from "./_core/search";
import { storagePut } from "./storage";
import { AGENT_ACTION_SYSTEM_PROMPT, parseAndExecuteActions } from "./agentActions";
import { buildSabbathLessonPdf } from "./sabbathPdfBuilder";
import { lookupStrongs } from "../shared/strongsData";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user || { id: 1, name: "Student of the Word", email: "student@biblestudypro.app", role: "admin" }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  studies: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id || 1;
      const db = await getDb();
      if (!db) {
        try {
          const { getAllStudyItems, getYouTubeThumbnailUrl } = await import("../shared/studyData");
          return getAllStudyItems().map((item, idx) => ({
             id: idx + 1,
             userId,
             title: item.title,
             topic: item.topic || "",
             category: "Teaching",
             description: "",
             videoUrl: item.video,
             thumbnail: getYouTubeThumbnailUrl(item.video) || "",
             summary: item.summary || "",
             createdAt: new Date(),
             updatedAt: new Date(),
          }));
        } catch (err) {
          console.error("TRPC Studies List Fallback Error:", err);
          throw new Error("Failed to fetch studies list");
        }
      }
      
      const existingStudies = await db.select().from(studies)
        .where(or(eq(studies.userId, userId), eq(studies.userId, 1)))
        .orderBy(desc(studies.createdAt))
        .limit(10000);

      if (process.env.NODE_ENV === "development") {
        const countResult = await db.select({ count: sql`count(*)` }).from(studies);
        const totalCount = Number(countResult[0]?.count || 0);

        if (totalCount < 30) {
          try {
            const { getAllStudyItems, getYouTubeThumbnailUrl } = await import("../shared/studyData");
            const mockData = getAllStudyItems();
            
            for (const item of mockData) {
              const result = await db.insert(studies).values({
                userId,
                title: item.title,
                topic: item.topic,
                category: "Teaching",
                videoUrl: item.video,
                thumbnail: getYouTubeThumbnailUrl(item.video) || undefined,
                summary: item.summary,
              });

              if (item.notes && result[0]?.insertId) {
                await db.insert(cornellNotes).values({
                  userId,
                  studyId: result[0].insertId,
                  questions: JSON.stringify(item.notes.questions || []),
                  notes: JSON.stringify(item.notes.notes || []),
                  summary: item.notes.summary || "",
                });
              }
            }
            return db.select().from(studies)
              .where(or(eq(studies.userId, userId), eq(studies.userId, 1)))
              .orderBy(desc(studies.createdAt))
              .limit(10000);
          } catch (seedErr) {
            console.error("Failed to seed mock data:", seedErr);
          }
        }
      }

      return existingStudies;
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) return null;
        
        const result = await db.select().from(studies)
          .where(and(
            eq(studies.id, input.id),
            or(eq(studies.userId, userId), eq(studies.userId, 1))
          ))
          .limit(1);
        
        return result.length > 0 ? result[0] : null;
      }),

    search: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) return [];
        
        const searchPattern = `%${input.query}%`;
        return db.select().from(studies)
          .where(and(
            or(eq(studies.userId, userId), eq(studies.userId, 1)),
            or(
              like(studies.title, searchPattern),
              like(studies.topic, searchPattern),
              like(studies.description, searchPattern),
              like(studies.summary, searchPattern),
            ),
          ))
          .orderBy(desc(studies.createdAt))
          .limit(100);
      }),

    syncNow: publicProcedure
      .mutation(async () => {
        const [ytRes] = await Promise.allSettled([
          runYouTubeSync(),
          syncIOGLessons(),
        ]);
        const ytData = ytRes.status === "fulfilled" && typeof ytRes.value === "object" ? (ytRes.value as any) : null;
        return {
          success: true,
          message: `Synchronized ${ytData?.added || 0} new lessons, updated ${ytData?.updated || 0} existing lessons.`,
          added: ytData?.added || 0,
          updated: ytData?.updated || 0,
        };
      }),

    create: publicProcedure
      .input(z.object({
        title: z.string(),
        topic: z.string().optional(),
        category: z.string().optional(),
        description: z.string().optional(),
        videoUrl: z.string().optional(),
        thumbnail: z.string().optional(),
        summary: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const newStudy: InsertStudy = {
          userId,
          ...input,
        };
        
        const result = await db.insert(studies).values(newStudy);
        return { id: result[0]?.insertId };
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        topic: z.string().optional(),
        category: z.string().optional(),
        description: z.string().optional(),
        videoUrl: z.string().optional(),
        thumbnail: z.string().optional(),
        summary: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const { id, ...updateData } = input;
        
        await db.update(studies)
          .set(updateData)
          .where(and(
            eq(studies.id, id),
            or(eq(studies.userId, userId), eq(studies.userId, 1))
          ));
        
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.delete(studies)
          .where(and(
            eq(studies.id, input.id),
            or(eq(studies.userId, userId), eq(studies.userId, 1))
          ));
        
        return { success: true };
      }),

    getByCategory: publicProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) return [];
        
        return db.select().from(studies)
          .where(and(
            or(eq(studies.userId, userId), eq(studies.userId, 1)),
            eq(studies.category, input.category)
          ));
      }),

    generateSabbathPdf: publicProcedure
      .input(z.object({ studyId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        return buildSabbathLessonPdf(input.studyId, userId);
      }),
  }),

  strongs: router({
    lookup: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        return lookupStrongs(input.query);
      }),
  }),

  liveTranscripts: router({
    save: publicProcedure
      .input(z.object({
        studyId: z.number().optional().nullable(),
        transcript: z.string(),
        duration: z.number().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        let targetStudyId = input.studyId;

        if (!targetStudyId || targetStudyId === 0) {
          const now = new Date();
          const options: Intl.DateTimeFormatOptions = { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
          };
          const formattedDate = now.toLocaleDateString('en-US', options);
          const studyTitle = `Live Study - ${formattedDate}`;

          const newStudy: InsertStudy = {
            userId,
            title: studyTitle,
            category: "Live Session",
          };

          const studyResult = await db.insert(studies).values(newStudy);
          targetStudyId = studyResult[0]?.insertId;
          if (!targetStudyId) {
            throw new Error("Failed to auto-create study for live session");
          }
        }

        const newLiveTranscript: InsertLiveTranscript = {
          userId,
          studyId: targetStudyId,
          transcript: input.transcript,
          duration: input.duration || null,
        };

        const transcriptResult = await db.insert(liveTranscripts).values(newLiveTranscript);

        return {
          id: transcriptResult[0]?.insertId,
          studyId: targetStudyId,
        };
      }),

    getByStudy: publicProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) return null;

        const results = await db.select().from(liveTranscripts)
          .where(and(
            or(eq(liveTranscripts.userId, userId), eq(liveTranscripts.userId, 1)),
            eq(liveTranscripts.studyId, input.studyId)
          ))
          .orderBy(desc(liveTranscripts.createdAt))
          .limit(1);

        return results[0] || null;
      }),

    list: publicProcedure
      .query(async ({ ctx }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) return [];

        return db.select().from(liveTranscripts)
          .where(or(eq(liveTranscripts.userId, userId), eq(liveTranscripts.userId, 1)))
          .orderBy(desc(liveTranscripts.createdAt));
      }),
  }),

  pdfs: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id || 1;
      const db = await getDb();
      if (!db) return [];
      
      return db.select().from(pdfs)
        .where(or(
          eq(pdfs.userId, userId),
          eq(pdfs.userId, 1),
          eq(pdfs.syncSource, "Google Drive Sync"),
          eq(pdfs.syncSource, "Watch Folder")
        ))
        .orderBy(desc(pdfs.category), desc(pdfs.lastSyncedAt));
    }),

    stream: publicProcedure
      .input(z.object({ fileId: z.string() }))
      .query(async ({ input }) => {
        if (!process.env.GOOGLE_DRIVE_CREDENTIALS) {
          return { error: "Google Drive credentials not configured", base64: null };
        }
        try {
          const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS);
          const token = await getGoogleAccessToken(credentials);
          const buf = await downloadGoogleDriveFile(input.fileId, token);
          return { base64: buf.toString("base64"), error: null };
        } catch (e: any) {
          return { error: e.message || "Failed to fetch PDF", base64: null };
        }
      }),

    getByStudy: publicProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) return [];
        
        return db.select().from(pdfs)
          .where(and(
            or(eq(pdfs.userId, userId), eq(pdfs.userId, 1)),
            eq(pdfs.studyId, input.studyId)
          ));
      }),

    search: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) return [];
        
        const searchPattern = `%${input.query}%`;
        const results = await db.select().from(pdfs)
          .where(and(
            or(
              eq(pdfs.userId, userId),
              eq(pdfs.userId, 1),
              eq(pdfs.syncSource, "Google Drive Sync"),
              eq(pdfs.syncSource, "Watch Folder")
            ),
            or(
              like(pdfs.fileName, searchPattern),
              like(pdfs.extractedTitle, searchPattern),
              like(pdfs.textContent, searchPattern),
            ),
          ))
          .orderBy(desc(pdfs.lastSyncedAt));

        return results.map(pdf => {
          let matchSnippet = "";
          if (pdf.textContent) {
            const queryWords = input.query.split(" ").filter(w => w.length > 2);
            let foundIndex = -1;
            for (const word of [input.query, ...queryWords]) {
              const idx = pdf.textContent.toLowerCase().indexOf(word.toLowerCase());
              if (idx !== -1) {
                foundIndex = idx;
                break;
              }
            }

            if (foundIndex !== -1) {
              const start = Math.max(0, foundIndex - 80);
              const end = Math.min(pdf.textContent.length, foundIndex + input.query.length + 80);
              matchSnippet = pdf.textContent.substring(start, end);
              if (start > 0) matchSnippet = "..." + matchSnippet;
              if (end < pdf.textContent.length) matchSnippet += "...";
            } else {
              matchSnippet = pdf.textContent.substring(0, 160) + (pdf.textContent.length > 160 ? "..." : "");
            }
          }

          return {
            ...pdf,
            matchSnippet,
          };
        });
      }),

    getByCategory: publicProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) return [];
        
        return db.select().from(pdfs)
          .where(and(
            or(eq(pdfs.userId, userId), eq(pdfs.userId, 1)),
            eq(pdfs.category, input.category)
          ));
      }),

    create: publicProcedure
      .input(z.object({
        fileName: z.string(),
        extractedTitle: z.string().optional(),
        category: z.string().optional(),
        fileKey: z.string(),
        fileUrl: z.string(),
        fileSize: z.number().optional(),
        studyId: z.number().optional(),
        textContent: z.string().optional(),
        thumbnailUrl: z.string().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
        syncSource: z.string().optional(),
        lastSyncedAt: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const newPdf: InsertPDF = {
          userId,
          ...input,
        };
        
        const result = await db.insert(pdfs).values(newPdf);
        return { id: result[0]?.insertId };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.delete(pdfs)
          .where(and(
            eq(pdfs.id, input.id),
            or(eq(pdfs.userId, userId), eq(pdfs.userId, 1))
          ));
        
        return { success: true };
      }),
  }),

  notes: router({
    getByStudy: publicProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) {
          try {
            const { getAllStudyItems } = await import("../shared/studyData");
            const items = getAllStudyItems();
            const item = items[input.studyId - 1];
            if (item?.notes) {
              return {
                id: input.studyId,
                userId,
                studyId: input.studyId,
                questions: JSON.stringify(item.notes.questions || []),
                notes: JSON.stringify(item.notes.notes || []),
                summary: item.notes.summary || "",
                attachments: "[]",
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            }
            return null;
          } catch (err) {
            console.error("TRPC Notes GetByStudy Fallback Error:", err);
            return null;
          }
        }
        
        const result = await db.select().from(cornellNotes)
          .where(and(
            eq(cornellNotes.studyId, input.studyId),
            or(eq(cornellNotes.userId, userId), eq(cornellNotes.userId, 1))
          ))
          .limit(1);
        
        return result.length > 0 ? result[0] : null;
      }),

    save: publicProcedure
      .input(z.object({
        studyId: z.number(),
        questions: z.string().optional(),
        notes: z.string().optional(),
        summary: z.string().optional(),
        attachments: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const existing = await db.select().from(cornellNotes)
          .where(and(
            eq(cornellNotes.studyId, input.studyId),
            or(eq(cornellNotes.userId, userId), eq(cornellNotes.userId, 1))
          ))
          .limit(1);

        if (existing.length > 0) {
          await db.update(cornellNotes)
            .set({
              questions: input.questions,
              notes: input.notes,
              summary: input.summary,
              attachments: input.attachments,
              updatedAt: new Date(),
            })
            .where(eq(cornellNotes.id, existing[0].id));
          return { id: existing[0].id };
        } else {
          const newNote: InsertCornellNote = {
            userId,
            ...input,
          };
          const result = await db.insert(cornellNotes).values(newNote);
          return { id: result[0]?.insertId };
        }
      }),

    create: publicProcedure
      .input(z.object({
        studyId: z.number(),
        questions: z.string().optional(),
        notes: z.string().optional(),
        summary: z.string().optional(),
        attachments: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const newNote: InsertCornellNote = {
          userId,
          ...input,
        };
        
        const result = await db.insert(cornellNotes).values(newNote);
        return { id: result[0]?.insertId };
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        questions: z.string().optional(),
        notes: z.string().optional(),
        summary: z.string().optional(),
        attachments: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const { id, ...updateData } = input;
        
        await db.update(cornellNotes)
          .set(updateData)
          .where(and(
            eq(cornellNotes.id, id),
            or(eq(cornellNotes.userId, userId), eq(cornellNotes.userId, 1))
          ));
        
        return { success: true };
      }),
  }),

  tags: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id || 1;
      const db = await getDb();
      if (!db) return [];
      
      return db.select().from(tags)
        .where(or(eq(tags.userId, userId), eq(tags.userId, 1)));
    }),

    create: publicProcedure
      .input(z.object({
        name: z.string(),
        type: z.enum(["keyword", "scripture", "topic"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const newTag: InsertTag = {
          userId,
          ...input,
        };
        
        const result = await db.insert(tags).values(newTag);
        return { id: result[0]?.insertId };
      }),
  }),

  ai: router({
    chat: publicProcedure
      .input(z.object({
        question: z.string(),
        studyIds: z.array(z.number()).optional(),
        allowInternet: z.boolean().optional().default(true),
        agent: z.enum(["local", "vps", "openrouter"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const keywords = input.question.split(" ").filter(w => w.length > 3);
        const searchConditions = keywords.map(kw => `%${kw}%`);
        
        const relevantStudies = await db.select().from(studies)
          .where(and(
            or(eq(studies.userId, userId), eq(studies.userId, 1)),
            or(...searchConditions.map(sc => or(
              like(studies.title, sc),
              like(studies.summary, sc),
              like(studies.description, sc)
            )))
          ))
          .limit(20);

        const recentStudies = await db.select().from(studies)
          .where(or(eq(studies.userId, userId), eq(studies.userId, 1)))
          .limit(10);

        const allStudies = Array.from(new Set([...relevantStudies, ...recentStudies]));
        
        const relevantPdfs = await db.select().from(pdfs)
          .where(and(
            or(eq(pdfs.userId, userId), eq(pdfs.userId, 1)),
            or(...searchConditions.map(sc => like(pdfs.textContent, sc)))
          ))
          .limit(10);
        
        const pastHistory = await db.select().from(aiInteractions)
          .where(or(eq(aiInteractions.userId, userId), eq(aiInteractions.userId, 1)))
          .orderBy(desc(aiInteractions.createdAt))
          .limit(10);

        const longTermMemory = await db.select().from(aiMemory)
          .where(or(eq(aiMemory.userId, userId), eq(aiMemory.userId, 1)))
          .orderBy(desc(aiMemory.importance))
          .limit(10);

        const memoryKnowledge = [
          ...pastHistory.map(h => `PAST Q: ${h.question}\nPAST A: ${h.answer}`),
          ...longTermMemory.map(m => `INSIGHT: ${m.insight}`)
        ].join('\n---\n');

        let deepRetrieval: any[] = [];
        if (keywords.length > 0) {
          deepRetrieval = await db.select().from(studies)
            .where(or(...keywords.map(kw => or(like(studies.title, `%${kw}%`), like(studies.summary, `%${kw}%`)))))
            .limit(30);
        }

        const deepKnowledge = deepRetrieval
          .map(s => `TITLE: ${s.title}\nCATEGORY: ${s.category}\nCONTENT: ${s.summary || s.description || 'No description'}`)
          .join('\n---\n');

        const studyKnowledge = allStudies
          .map(s => `TITLE: ${s.title}\nCATEGORY: ${s.category}`)
          .join(', ');

        const pdfKnowledge = relevantPdfs.length > 0
          ? relevantPdfs.map(p => `PDF: ${p.fileName}\nCONTENT: ${p.textContent?.substring(0, 5000) || 'No text extracted'}`).join('\n---\n')
          : '';

        const historyKnowledge = `
HISTORY: The Creation of the Hebrew Nation (Abraham's Covenant ~2000 BC) — The Most High chose Abraham and made an everlasting covenant with his seed, establishing the twelve tribes of Israel as the chosen people. Gen 17:7.
HISTORY: The Exodus & The Law of Moses (~1446 BC) — The children of Israel were delivered from Egypt. The Law was given at Sinai covering dietary laws, feast days, and righteous ordinances. Deut 7:6.
HISTORY: The United Kingdom — David & Solomon (~1010–930 BC) — King David unified the twelve tribes. Solomon built the Temple. The Davidic covenant promises an eternal throne fulfilled through Yahawashi. 2 Sam 7:16.
HISTORY: The Babylonian Captivity & Scattering (586 BC) — Israel was scattered into captivity fulfilling prophecy. The IOG teaches this began the worldwide scattering of the Hebrew people.
HISTORY: The Ministry of Yahawashi (Christ) (~4 BC – 33 AD) — Yahawashi came as the Messiah of Israel, specifically for the lost sheep of the house of Israel. Matt 15:24, Matt 1:21.
HISTORY: The Trans-Atlantic Slave Trade (1500s–1865 AD) — The IOG identifies enslaved Africans transported to the Americas via ships as Hebrew Israelites, fulfilling Deuteronomy 28:68.
HISTORY: The Israel of God (Present Day) — An organization in Riverdale, Illinois led by Pastor Henry Buie teaching that Black, Hispanic, and Native American peoples are the true biblical Israelites. Hosea 4:6.
HISTORY: The Gathering of Israel (End Times) — Prophesied restoration of scattered Israel from the four corners of the earth. Isaiah 11:11–12.
`;

        const isSearchRequest = /\b(online|search|lookup|google|website|internet|research|browse|cites|citations|find)\b/i.test(input.question);
        let webSearchContext = "";
        
        if (isSearchRequest && db) {
          console.log(`[AI TRPC Search] Running web query for: ${input.question}`);
          try {
            const results = await searchWeb(input.question);
            webSearchContext = `--- WEB SEARCH RESULTS & CITATIONS ---\n${results}\n--- END OF SEARCH ---\n\n`;
            
            await db.insert(aiMemory).values({
              userId,
              insight: `Research findings for query: "${input.question}"\n\nResults:\n${results}`,
              context: `Web Search - ${new Date().toISOString()}`,
              importance: 5,
            });
          } catch (searchErr) {
            console.error("[AI TRPC Search] Error during research lookup:", searchErr);
          }
        }

        const fullKnowledgeBase = [memoryKnowledge, deepKnowledge, studyKnowledge, historyKnowledge, pdfKnowledge].filter(Boolean).join('\n\n=====\n\n');

        const response = await invokeLLM({
          agentOverride: input.agent,
          messages: [
            {
              role: "system",
              content: `You are the AI Teacher for Bible Study Pro. You are a highly professional, academic, unbiased AI researcher with deep contextual critical thinking skills. You keep all analyses strictly grounded in historical facts and the Authorized King James Version (KJV) biblical text.

Your primary mission is to teach and explain the scriptures and history accurately, grounded in the official doctrine of The Israel of God (IOG) ministry led by Pastor Henry Buie in Riverdale, Illinois.

==========================================================
THE ISRAEL OF GOD — OFFICIAL STATEMENT OF BELIEFS
(Source: Official IOG Statement of Beliefs document, 10 pages)
==========================================================

OVERVIEW: The Israel of God is a Bible Study class. Its purpose is to teach the uncut word of God according to the Prophets (Old Testament) and Apostles (New Testament). The IOG observes the Lord's Sabbath Day and all of the Lord's Feast Days as outlined in Leviticus 23. They observe the Lord's Dietary Law as outlined in Leviticus 11. They teach and observe the Royal Law, which are the Ten Commandments. They believe in the Resurrection. They believe that Jesus is the King of Israel, He will rule over the House of Jacob forever, and that He is the God of all people, and that His house "shall be a house of prayer for all people." All doctrinal tenants, practices, teachings, and beliefs are based on the Word of God, the Holy Bible. God's people believe that they are to live by every word that proceeds out of the mouth of God (Matthew 4:4).

GOD: God is the eternal, all-powerful, supreme creator and sustainer of the entire universe. God is one, composed of spirit and comprising a family presently consisting of two spirit beings with all power: God the Father and Jesus Christ the Son. God is a loving, kind, merciful God who wants to share His magnificent existence by reproducing Himself through man. (Gen 1:1-2, 26-27; Isaiah 57:15; John 1:1-2, 18; 3:16; Romans 1:20; Colossians 1:12-20; Hebrews 1:1-2; 1 John 3:1-2)

BIBLE: The whole Bible is the divinely inspired Word of God containing His plan of salvation and the record of His participation in history. The Bible is God's revelation of knowledge that man cannot discover for himself. It is the foundation of knowledge, and man's instruction manual of life. The Old and New Testaments comprise God's written Word, which forms the basis of a true Christian as taught by the church. (Deuteronomy 8:3; Proverbs 1:23; Matthew 4:4; John 17:17; 2 Timothy 3:14-17; 2 Peter 1:20-21)

JESUS CHRIST: Jesus of Nazareth is the Christ, the Son of God, The Holy One of Israel. He was the prophesied Messiah of the Old Testament, described in the New Testament as being God in the Flesh. As the second member of the Godhead, He has existed throughout eternity as the "Word." He divested Himself of power and majesty, and became a human being to die for the sins of all mankind as our loving and merciful Savior. He was resurrected by God the Father, and ascended to heaven to become our High Priest. Jesus Christ shall return to establish the Kingdom of God on earth, and rule as King of Kings with His saints forever in Jerusalem. (Isaiah 9:6-7; John 1:1-14; Acts 2:32-33; Philippians 2:5-11; Hebrews 4:14-15; Revelation 20:4)

THE HOLY SPIRIT: The Holy Spirit is NOT the third part of the "Trinity." There are currently only TWO members in the Godhead: The Father and His Son, Jesus Christ. The Holy Spirit can be manifested to man in many forms. One form is an Angel sent from God to bring to remembrance what Jesus has told us in His Holy Word. The Word that the Angel brings to man is the power, thoughts, and spiritual extension of God. God begets true Christians as His sons and daughters through this Spirit (God's Word). It strengthens a Christian spiritually, converts his mind, and serves as an earnest, or beginning, of the transformation to obtain eternal life. (Genesis 1:2; John 14:26; 15:26; 16:13-15; Hebrews 1:13-14)

SALVATION: Salvation is the means by which God, through Christ, saves man from the penalty of sin and gives him eternal life through obedience to His Word. This process includes one's calling, repentance, baptism, and receiving of the Holy Spirit, life of faith and obedience, and final birth into God's Kingdom as a spirit being. Salvation is a freely given gift from God established by the law through grace, with our ultimate reward given according to our works. (Matthew 16:27; 24:13; John 3:16-17; Acts 2:38; Romans 6:23; Ephesians 2:1-9; Revelation 3:10-12)

FAITH: Faith is the sure knowledge that God exists, and that He will accomplish those things He has promised in His Word. Faith is necessary for salvation. (Habakkuk 2:4; Romans 1:17; 10:17; Hebrews 11:1-40; James 2:20-26)

REPENTANCE: Repentance is the act of acknowledging one's sins, and resolving to fully obey God and adhere to His Word. It begins when God opens one's mind to see himself in comparison with God and His law. True repentance is the first step toward reconciliation with God, and thereby toward ultimate salvation. (Acts 2:38; 3:19-21; 8:22; 1 John 3:4)

BAPTISM: The ceremony of water baptism is performed by immersion, for the forgiveness of sins, upon true repentance and acceptance of Christ's sacrifice. After this action, one receives the baptism of the Holy Spirit through the "Washing of the water by the word." Baptism symbolizes the renunciation of the past sinful way of life, the burial of the old man in a watery grave, and the emergence of a new, Spirit-led man living with Christ's mind, laws and statutes. (Matthew 3:13-16; Acts 2:38; Romans 6:1-11; Colossians 2:6-12)

KINGDOM OF JESUS: The Kingdom of Jesus is a future world-ruling government to be set up on earth with headquarters in Jerusalem. Those found worthy to be raised in the First Resurrection will rule and reign with Him for a thousand years. Satan will be bound for a thousand years as Jesus teaches His law. (Psalm 2:7-9; Isaiah 2:2-5; 11:1-12; Revelation 20:4-6)

KINGDOM OF GOD: The Kingdom of God is the family of God ruling as the government of God. It is a future world-ruling government to be first established by Christ with Jesus as King and the resurrected spirit-composed saints in positions of co-rulership with Him. The Kingdom of God shall be established on earth forever. (1 Corinthians 15:24-28; Revelation 5:10; 20:4)

GOSPEL: The gospel is the message preached by the prophets, apostles, and Christ about God's coming Kingdom, the restoration of His government on earth, and how mankind can enter that Kingdom. The primary purpose and commission of the Lord's church (which is Israel) is to go and teach all nations, baptizing them in the name of Jesus Christ for the remission of sins. (Matthew 4:23; 24:14; 28:19-20; Romans 1:1-4; Revelation 14:6-7)

PROPHECY: Prophecy is God's testimony to his people, revealing His purpose and plan for mankind. God declares the end from the beginning. No prophecy is subject to personal or private interpretation. Fulfilled prophecy builds faith in God and His Word. A false prognostication attributed to God is a violation of the Third Commandment. (Isaiah 46:9-11; Jeremiah 23:23-32; 2 Timothy 2:15; Revelation 19:9-10)

THE FIRST AND SECOND RESURRECTION: The hope of all mankind and the promise to the Christian is the resurrection from the dead. The Bible refers to (1) the resurrection of Jesus Christ; (2) the "first resurrection" of the saints at the return of Christ; (3) the resurrection of the dead not found worthy in the first resurrection. All raised will be given a spiritual body, but not all will inherit the Kingdom of God — some will be cast into the Lake of Fire (the "second death"). (Daniel 12:1-3; John 5:28-29; 1 Corinthians 15:20; 1 Thessalonians 4:13-17; Revelation 20:4-6,12-14)

JUDGMENT: The time of one's judgment is the time of his opportunity for salvation, extending from one's calling by God until his death or the resurrection at Christ's return. Those who qualify for God's Kingdom shall inherit eternal life, and those who deliberately reject God's way shall be consumed in the lake of fire. (Daniel 12:2-3; Matthew 25:34; Revelation 20:11-15; 21:8)

CRITICAL DOCTRINAL ACCURACY RULES:
1. The IOG does NOT teach a Trinity. There are only TWO members of the Godhead: God the Father and Jesus Christ His Son.
2. The Law of God (Ten Commandments, Sabbath, Dietary Laws, Feast Days) is NOT abolished and remains binding on all believers today.
3. The Seventh-Day Sabbath runs from Friday sunset to Saturday sunset and is mandatory for all believers.
4. The seven Annual Feast Days in Leviticus 23 are all mandatory and must be kept throughout all generations.
5. All scripture references must be from the Authorized King James Version (KJV) only.

--- WEB SEARCH RESULTS & MEMORY ---
${webSearchContext}

--- LOCAL KNOWLEDGE BASE ---
${fullKnowledgeBase}
--- END OF KNOWLEDGE ---

${AGENT_ACTION_SYSTEM_PROMPT}`,
            },
            {
              role: "user",
              content: input.question,
            },
          ],
        });

        const content = response.choices[0]?.message.content;
        let answer = typeof content === 'string' ? content : '';

        try {
          answer = await parseAndExecuteActions(userId, answer);
        } catch (actErr) {
          console.error("[Agent Action Error]:", actErr);
        }

        const result = await db.insert(aiInteractions).values({
          userId,
          question: input.question,
          answer,
        });
        
        return {
          id: result[0]?.insertId,
          answer,
        };
      }),

    synthesizeNotes: publicProcedure
      .input(z.object({
        studyId: z.number().optional(),
        liveTranscript: z.string().optional(),
        agent: z.enum(["local", "vps", "openrouter"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not connected");

        let sourceMaterial = "";
        let studyTitle = "";

        if (input.studyId) {
          const study = await db.select().from(studies).where(eq(studies.id, input.studyId)).limit(1);
          if (study[0]) {
            studyTitle = study[0].title;
            sourceMaterial += `STUDY TITLE: ${study[0].title}\nSUMMARY: ${study[0].summary || study[0].description || ""}\n`;
            
            const keywords = studyTitle.split(" ").filter(k => k.length > 4);
            if (keywords.length > 0) {
              const relatedTexts = await db.select().from(studies)
                .where(and(
                  or(eq(studies.userId, userId), eq(studies.userId, 1)),
                  or(
                    eq(studies.category, "IOG Lesson Text"),
                    like(studies.category, "History:%")
                  ),
                  or(...keywords.map(kw => like(studies.title, `%${kw}%`)))
                ))
                .limit(3);
              
              if (relatedTexts.length > 0) {
                sourceMaterial += "\nOFFICIAL SOURCE TEXTS FOUND:\n";
                sourceMaterial += relatedTexts.map(t => `TEXT TITLE: ${t.title}\nCONTENT: ${t.summary || t.description}`).join("\n---\n");
              }
            }
          }
        }

        if (input.liveTranscript) {
          sourceMaterial += `\nLIVE LESSON TRANSCRIPT:\n${input.liveTranscript}\n`;
        }

        const prompt = `You are a meticulous Bible study assistant for The Israel of God (Pastor Henry Buie).
Your task is to generate comprehensive Cornell Notes based on the source material provided.

SOURCE MATERIAL:
${sourceMaterial}

Return a JSON object with:
{
  "questions": ["Key theological question 1?", "Key theological question 2?", "Key theological question 3?"],
  "notes": ["Detailed theological point 1 with scripture references...", "Detailed theological point 2...", "Detailed theological point 3..."],
  "summary": "A comprehensive 3-4 sentence summary of the lesson's main theological points and their significance."
}

IMPORTANT: Generate at least 3 questions and 5 detailed note points. Include KJV scripture references where applicable.`;

        const response = await invokeLLM({
          agentOverride: input.agent,
          messages: [
            { role: "system", content: "You are an expert Israel of God study assistant. Always return pure, valid JSON with no markdown wrapping." },
            { role: "user", content: prompt }
          ],
          responseFormat: { type: "json_object" }
        });
        
        try {
          const answer = response.choices[0]?.message.content;
          const parsed = JSON.parse(typeof answer === 'string' ? answer : '{}');
          return {
            questions: parsed.questions || [],
            notes: parsed.notes || [],
            summary: parsed.summary || "",
          };
        } catch (e) {
          console.error("Failed to parse AI response:", response);
          throw new Error("AI generated invalid format");
        }
      }),

    askScripture: publicProcedure
      .input(z.object({
        reference: z.string(),
        agent: z.enum(["local", "vps", "openrouter"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await invokeLLM({
          agentOverride: input.agent,
          messages: [
            {
              role: "system",
              content: "You are a Bible study assistant. Provide the full KJV text for the requested scripture reference, followed by a brief IOG-aligned commentary. Keep responses concise.",
            },
            {
              role: "user",
              content: `Provide the KJV text and brief commentary for: ${input.reference}`,
            },
          ],
          maxTokens: 2000,
        });

        const content = response.choices[0]?.message.content;
        const answer = typeof content === 'string' ? content : '';

        return { reference: input.reference, text: answer };
      }),

    getHistory: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id || 1;
      const db = await getDb();
      if (!db) return [];
      
      return db.select().from(aiInteractions)
        .where(or(eq(aiInteractions.userId, userId), eq(aiInteractions.userId, 1)))
        .orderBy(desc(aiInteractions.createdAt))
        .limit(100);
    }),

    autoGenerateNotes: publicProcedure
      .input(z.object({
        studyId: z.number().optional(),
        liveAudioTranscript: z.string().optional(),
        agent: z.enum(["local", "vps", "openrouter"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not connected");

        let sourceMaterial = "";
        let studyTitle = "";

        if (input.studyId) {
          const study = await db.select().from(studies).where(eq(studies.id, input.studyId)).limit(1);
          if (study[0]) {
            studyTitle = study[0].title;
            sourceMaterial += `STUDY TITLE: ${study[0].title}\nSUMMARY: ${study[0].summary || study[0].description || ""}\n`;
            
            const keywords = studyTitle.split(" ").filter(k => k.length > 4);
            if (keywords.length > 0) {
              const relatedTexts = await db.select().from(studies)
                .where(and(
                  or(eq(studies.userId, userId), eq(studies.userId, 1)),
                  or(
                    eq(studies.category, "IOG Lesson Text"),
                    like(studies.category, "History:%")
                  ),
                  or(...keywords.map(kw => like(studies.title, `%${kw}%`)))
                ))
                .limit(3);
              
              if (relatedTexts.length > 0) {
                sourceMaterial += "\nOFFICIAL SOURCE TEXTS FOUND:\n";
                sourceMaterial += relatedTexts.map(t => `TEXT TITLE: ${t.title}\nCONTENT: ${t.summary || t.description}`).join("\n---\n");
              }
            }
          }
        }

        if (input.liveAudioTranscript) {
          sourceMaterial += `\nLIVE LESSON TRANSCRIPT:\n${input.liveAudioTranscript}\n`;
        }

        const prompt = `You are a meticulous Bible study assistant for The Israel of God (Pastor Henry Buie).
Your task is to generate highly accurate Cornell Notes based on the source material provided.
The notes must reflect IOG doctrine and historical accuracy.

SOURCE MATERIAL:
${sourceMaterial}

Return a JSON object with:
{
  "questions": ["Key question 1?", "Key question 2?"],
  "notes": ["Detailed point 1 based on text...", "Detailed point 2 based on text..."],
  "summary": "A comprehensive summary of the lesson's main points."
}`;

        const response = await invokeLLM({
          agentOverride: input.agent,
          messages: [
            { role: "system", content: "You are an expert Israel of God study assistant. Always return pure JSON." },
            { role: "user", content: prompt }
          ],
          responseFormat: { type: "json_object" }
        });
        
        try {
          const answer = response.choices[0]?.message.content;
          return JSON.parse(typeof answer === 'string' ? answer : '{}');
        } catch (e) {
          console.error("Failed to parse AI response:", response);
          throw new Error("AI generated invalid format");
        }
      }),

    generateStudyGuide: publicProcedure
      .input(z.object({
        pdfId: z.number().optional(),
        studyId: z.number().optional(),
        agent: z.enum(["local", "vps", "openrouter"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        let textContent = "";
        let docTitle = "Study Guide";

        if (input.pdfId) {
          const pdfRecord = await db.select().from(pdfs).where(and(or(eq(pdfs.userId, userId), eq(pdfs.userId, 1)), eq(pdfs.id, input.pdfId))).limit(1);
          if (pdfRecord.length > 0) {
            textContent = pdfRecord[0].textContent || "";
            docTitle = pdfRecord[0].extractedTitle || pdfRecord[0].fileName;
          }
        } else if (input.studyId) {
          const studyRecord = await db.select().from(studies).where(and(or(eq(studies.userId, userId), eq(studies.userId, 1)), eq(studies.id, input.studyId))).limit(1);
          if (studyRecord.length > 0) {
            textContent = studyRecord[0].summary || studyRecord[0].description || "";
            docTitle = studyRecord[0].title;
          }
        }

        if (!textContent) {
          throw new Error("No text content found to generate a study guide.");
        }

        const prompt = `You are an expert theologian and study guide writer for Bible Study Pro, teaching the scriptures in alignment with the doctrine of The Israel of God (Pastor Henry Buie).
Based on the text content below, generate a comprehensive study guide, key breakdown points, discussion questions, and memorization flashcards.

DOCUMENT TITLE: "${docTitle}"
DOCUMENT CONTENT SAMPLE:
${textContent.slice(0, 15000)}

Return a structured JSON object containing:
{
  "summary": "A deep theological summary and overview of the document (3-5 paragraphs).",
  "keyPoints": [
    "Key theological breakdown point 1",
    "Key theological breakdown point 2",
    "Key theological breakdown point 3"
  ],
  "discussionQuestions": [
    "Discussion question 1?",
    "Discussion question 2?",
    "Discussion question 3?"
  ],
  "flashcards": [
    { "front": "Concept/Question", "back": "Detailed biblical explanation" }
  ]
}`;

        const response = await invokeLLM({
          agentOverride: input.agent,
          messages: [
            { role: "system", content: "You are an expert study guide creator. Always return a structured JSON response." },
            { role: "user", content: prompt }
          ],
          responseFormat: { type: "json_object" }
        });

        try {
          const answer = response.choices[0]?.message.content;
          return JSON.parse(typeof answer === 'string' ? answer : '{}');
        } catch (e) {
          console.error("Failed to parse AI response:", response);
          throw new Error("AI generated invalid format");
        }
      }),
  }),

  journal: router({
    list: publicProcedure
      .input(z.object({ section: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) return [];

        const conditions = [or(eq(journalEntries.userId, userId), eq(journalEntries.userId, 1))];
        if (input.section) {
          conditions.push(eq(journalEntries.section, input.section as any));
        }

        return db.select().from(journalEntries)
          .where(and(...conditions))
          .orderBy(desc(journalEntries.createdAt));
      }),

    create: publicProcedure
      .input(z.object({
        section: z.enum(["Sabbath", "Daily", "Prayer", "Feast", "Memory", "History"]),
        title: z.string(),
        scripture: z.string().optional(),
        notes: z.string().optional(),
        prayer: z.string().optional(),
        tags: z.string().optional(),
        handwritingData: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const newEntry: InsertJournalEntry = {
          userId,
          ...input,
        };

        const result = await db.insert(journalEntries).values(newEntry);
        return { id: result[0]?.insertId };
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        scripture: z.string().optional(),
        notes: z.string().optional(),
        prayer: z.string().optional(),
        tags: z.string().optional(),
        handwritingData: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const { id, ...updateData } = input;

        await db.update(journalEntries)
          .set(updateData)
          .where(and(
            eq(journalEntries.id, id),
            or(eq(journalEntries.userId, userId), eq(journalEntries.userId, 1))
          ));

        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.delete(journalEntries)
          .where(and(
            eq(journalEntries.id, input.id),
            or(eq(journalEntries.userId, userId), eq(journalEntries.userId, 1))
          ));

        return { success: true };
      }),
  }),

  milestones: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.id || 1;
      const db = await getDb();
      if (!db) return [];
      
      return db.select().from(milestones)
        .where(or(eq(milestones.userId, userId), eq(milestones.userId, 1)));
    }),

    create: publicProcedure
      .input(z.object({
        type: z.enum(["lesson_completed", "notes_created", "pdf_uploaded", "ai_question_asked"]),
        studyId: z.number().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const newMilestone: InsertMilestone = {
          userId,
          ...input,
        };
        
        const result = await db.insert(milestones).values(newMilestone);
        return { id: result[0]?.insertId };
      }),
  }),

  conversations: router({
    list: publicProcedure
      .input(z.object({ studyId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) return [];
        const conditions = [or(eq(streamingConversations.userId, userId), eq(streamingConversations.userId, 1))];
        if (input.studyId) {
          conditions.push(eq(streamingConversations.studyId, input.studyId));
        }
        return db.select().from(streamingConversations)
          .where(and(...conditions))
          .orderBy(desc(streamingConversations.updatedAt))
          .limit(50);
      }),

    save: publicProcedure
      .input(z.object({
        id: z.number().optional(),
        studyId: z.number().optional(),
        messages: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
          timestamp: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        if (input.id) {
          await db.update(streamingConversations)
            .set({ messages: input.messages as any, updatedAt: new Date() })
            .where(and(
              eq(streamingConversations.id, input.id),
              or(eq(streamingConversations.userId, userId), eq(streamingConversations.userId, 1))
            ));
          return { id: input.id };
        } else {
          const record: InsertStreamingConversation = {
            userId,
            studyId: input.studyId ?? null,
            messages: input.messages as any,
          };
          const result = await db.insert(streamingConversations).values(record);
          return { id: result[0]?.insertId };
        }
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id || 1;
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(streamingConversations)
          .where(and(
            eq(streamingConversations.id, input.id),
            or(eq(streamingConversations.userId, userId), eq(streamingConversations.userId, 1))
          ));
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
