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
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  studies: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        try {
          const { getAllStudyItems, getYouTubeThumbnailUrl } = await import("../shared/studyData");
          return getAllStudyItems().map((item, idx) => ({
             id: idx + 1,
             userId: ctx.user.id,
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
        .where(or(eq(studies.userId, ctx.user.id), eq(studies.userId, 1)))
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
                userId: ctx.user.id,
                title: item.title,
                topic: item.topic,
                category: "Teaching",
                videoUrl: item.video,
                thumbnail: getYouTubeThumbnailUrl(item.video) || undefined,
                summary: item.summary,
              });

              if (item.notes && result[0]?.insertId) {
                await db.insert(cornellNotes).values({
                  userId: ctx.user.id,
                  studyId: result[0].insertId,
                  questions: JSON.stringify(item.notes.questions || []),
                  notes: JSON.stringify(item.notes.notes || []),
                  summary: item.notes.summary || "",
                });
              }
            }
            return db.select().from(studies)
              .where(eq(studies.userId, ctx.user.id))
              .orderBy(desc(studies.createdAt))
              .limit(10000);
          } catch (seedErr) {
            console.error("Failed to seed mock data:", seedErr);
          }
        }
      }

      return existingStudies;
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return null;
        
        const result = await db.select().from(studies)
          .where(and(
            eq(studies.id, input.id),
            eq(studies.userId, ctx.user.id)
          ))
          .limit(1);
        
        return result.length > 0 ? result[0] : null;
      }),

    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        
        const searchPattern = `%${input.query}%`;
        return db.select().from(studies)
          .where(and(
            eq(studies.userId, ctx.user.id),
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

    syncNow: protectedProcedure
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

    create: protectedProcedure
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
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const newStudy: InsertStudy = {
          userId: ctx.user.id,
          ...input,
        };
        
        const result = await db.insert(studies).values(newStudy);
        return { id: result[0]?.insertId };
      }),

    update: protectedProcedure
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
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const { id, ...updateData } = input;
        
        await db.update(studies)
          .set(updateData)
          .where(and(
            eq(studies.id, id),
            eq(studies.userId, ctx.user.id)
          ));
        
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.delete(studies)
          .where(and(
            eq(studies.id, input.id),
            eq(studies.userId, ctx.user.id)
          ));
        
        return { success: true };
      }),

    getByCategory: protectedProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        
        return db.select().from(studies)
          .where(and(
            eq(studies.userId, ctx.user.id),
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
    save: protectedProcedure
      .input(z.object({
        studyId: z.number().optional().nullable(),
        transcript: z.string(),
        duration: z.number().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        let targetStudyId = input.studyId;

        // If no studyId or studyId is 0, auto-create a new study for the user
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
            userId: ctx.user.id,
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
          userId: ctx.user.id,
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

    getByStudy: protectedProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return null;

        const results = await db.select().from(liveTranscripts)
          .where(and(
            eq(liveTranscripts.userId, ctx.user.id),
            eq(liveTranscripts.studyId, input.studyId)
          ))
          .orderBy(desc(liveTranscripts.createdAt))
          .limit(1);

        return results[0] || null;
      }),

    list: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) return [];

        return db.select().from(liveTranscripts)
          .where(eq(liveTranscripts.userId, ctx.user.id))
          .orderBy(desc(liveTranscripts.createdAt));
      }),
  }),

  pdfs: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      
      // Return the user's own uploads + all Google Drive synced docs
      return db.select().from(pdfs)
        .where(or(
          eq(pdfs.userId, ctx.user.id),
          eq(pdfs.syncSource, "Google Drive Sync"),
          eq(pdfs.syncSource, "Watch Folder")
        ))
        .orderBy(desc(pdfs.category), desc(pdfs.lastSyncedAt));
    }),

    // Proxy endpoint — streams the actual PDF bytes from Google Drive so users
    // can view PDFs inside the app without needing a Google account.
    stream: protectedProcedure
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

    getByStudy: protectedProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        
        return db.select().from(pdfs)
          .where(and(
            eq(pdfs.userId, ctx.user.id),
            eq(pdfs.studyId, input.studyId)
          ));
      }),

    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        
        const searchPattern = `%${input.query}%`;
        const results = await db.select().from(pdfs)
          .where(and(
            // Search own uploads + all Drive-synced docs
            or(
              eq(pdfs.userId, ctx.user.id),
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

    getByCategory: protectedProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        
        return db.select().from(pdfs)
          .where(and(
            eq(pdfs.userId, ctx.user.id),
            eq(pdfs.category, input.category)
          ));
      }),

    create: protectedProcedure
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
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const newPdf: InsertPDF = {
          userId: ctx.user.id,
          ...input,
        };
        
        const result = await db.insert(pdfs).values(newPdf);
        return { id: result[0]?.insertId };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        await db.delete(pdfs)
          .where(and(
            eq(pdfs.id, input.id),
            eq(pdfs.userId, ctx.user.id)
          ));
        
        return { success: true };
      }),
  }),

  notes: router({
    getByStudy: protectedProcedure
      .input(z.object({ studyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          try {
            const { getAllStudyItems } = await import("../shared/studyData");
            const items = getAllStudyItems();
            const item = items[input.studyId - 1];
            if (item?.notes) {
              return {
                id: input.studyId,
                userId: ctx.user.id,
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
            eq(cornellNotes.userId, ctx.user.id)
          ))
          .limit(1);
        
        return result.length > 0 ? result[0] : null;
      }),

    create: protectedProcedure
      .input(z.object({
        studyId: z.number(),
        questions: z.string().optional(),
        notes: z.string().optional(),
        summary: z.string().optional(),
        attachments: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const newNote: InsertCornellNote = {
          userId: ctx.user.id,
          ...input,
        };
        
        const result = await db.insert(cornellNotes).values(newNote);
        return { id: result[0]?.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        questions: z.string().optional(),
        notes: z.string().optional(),
        summary: z.string().optional(),
        attachments: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const { id, ...updateData } = input;
        
        await db.update(cornellNotes)
          .set(updateData)
          .where(and(
            eq(cornellNotes.id, id),
            eq(cornellNotes.userId, ctx.user.id)
          ));
        
        return { success: true };
      }),
  }),

  tags: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      
      return db.select().from(tags)
        .where(eq(tags.userId, ctx.user.id));
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        type: z.enum(["keyword", "scripture", "topic"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const newTag: InsertTag = {
          userId: ctx.user.id,
          ...input,
        };
        
        const result = await db.insert(tags).values(newTag);
        return { id: result[0]?.insertId };
      }),
  }),

  ai: router({
    chat: protectedProcedure
      .input(z.object({
        question: z.string(),
        studyIds: z.array(z.number()).optional(),
        allowInternet: z.boolean().optional().default(true),
        agent: z.enum(["local", "vps", "openrouter"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const keywords = input.question.split(" ").filter(w => w.length > 3);
        const searchConditions = keywords.map(kw => `%${kw}%`);
        
        const relevantStudies = await db.select().from(studies)
          .where(and(
            or(eq(studies.userId, ctx.user.id), eq(studies.userId, 1)),
            or(...searchConditions.map(sc => or(
              like(studies.title, sc),
              like(studies.summary, sc),
              like(studies.description, sc)
            )))
          ))
          .limit(20);

        const recentStudies = await db.select().from(studies)
          .where(or(eq(studies.userId, ctx.user.id), eq(studies.userId, 1)))
          .limit(10);

        const allStudies = Array.from(new Set([...relevantStudies, ...recentStudies]));
        
        const relevantPdfs = await db.select().from(pdfs)
          .where(and(
            eq(pdfs.userId, ctx.user.id),
            or(...searchConditions.map(sc => like(pdfs.textContent, sc)))
          ))
          .limit(10);
        
        const pastHistory = await db.select().from(aiInteractions)
          .where(eq(aiInteractions.userId, ctx.user.id))
          .orderBy(desc(aiInteractions.createdAt))
          .limit(10);

        const longTermMemory = await db.select().from(aiMemory)
          .where(eq(aiMemory.userId, ctx.user.id))
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
            
            // Save search results permanently in the user's AI Memory bank
            await db.insert(aiMemory).values({
              userId: ctx.user.id,
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

FORGIVENESS: Forgiveness is the state of being whereby one's sins are removed, blotted out, or covered. Forgiveness comes in two spheres: (1) forgiveness from God towards us and (2) forgiveness from us to each other. Those who refuse to forgive will not be forgiven. (Psalm 32:1-2; Matthew 6:11-12, 14-15; 1 John 1:9)

LAW OF GOD: The law of God as revealed in the Bible is a good, right, and perfect system of eternal directives and principles that reflects God's character. God's law teaches man how to properly worship God, how to love his fellow man, and how to prepare for an eternal spiritual life in the family of God. The law of God is represented in both the Old and the New Testaments. (Exodus 20:1-17; Deuteronomy 16; Psalm 19:7; 119:142; Malachi 4:4; John 14:15, 21; Romans 7:12; 1 John 5:2-3)

BIBLICAL COVENANTS: Both testaments record that God made certain promises in the form of specific contracts or agreements with the nation of Israel and through them to the rest of the sons of Adam. These are called covenants. Of these, the best known are the covenants made with Israel (the Old and New Covenants), which will be fully confirmed after the return of Jesus Christ. The New Covenant makes God's law even more relevant by expanding it to include one's mental attitude and spiritual intent. There is one law (Exodus 12:49) and one ordinance (Numbers 15:14-16) for all people. (Jeremiah 31:31-34; Matthew 5:21-22; 2 Timothy 3:15-17; Hebrews 8:6-13)

BIBLICAL DIETARY LAWS: Biblical dietary laws, including the prohibitions of Leviticus 11 and Deuteronomy 14, are among the many health laws God gave to Israel to give to mankind. The prophets, the apostles, and Jesus observed them, and they remain in effect today. Scripture indicates that laws pertaining to "clean" and "unclean" animals were recognized and observed from earliest times. (Genesis 7:2-3; Leviticus 11; Deuteronomy 14:3-21; Matthew 5:17-19; Acts 10:9-15, 28; 2 Corinthians 6:14-18)

SIN: Sin is the transgression of God's law. Although the penalty for sin is death in the lake of fire, all sin can be completely forgiven by God, who desires that all men be saved. God forgives sin upon repentance of the individual who accepts the shed blood and sacrifice of Jesus Christ as payment in full for the penalty of his sins. (Romans 6:23; James 1:15; 4:17; 1 John 3:4)

A TRUE CHRISTIAN: A true Christian is one in whom the Word of God (or Holy Spirit) dwells; they keep all of God's laws, statutes, and ordinances to the best of their ability, and love their God and brothers and sisters as they love themselves. (Romans 8:9; 1 Corinthians 12:13; 2 Timothy 2:19-21; Revelation 14:12)

MAN'S SPIRITUAL RELATIONSHIP WITH GOD: Man's spiritual relationship with God begins with repentance, baptism, and faith in His Word. When these criteria are met, God "begets" us with His Spirit (The Word of God); He becomes our Father and we become His children. A family relationship has begun. (Exodus 20:1-11; Acts 2:38; Romans 8:15; 1 John 1:3)

TEN COMMANDMENTS: The Ten Commandments, as revealed by God, are the perfect expression of God's love. They are the foundation of all biblical teaching, showing man how to express love toward God and fellowman, and are consequently the focal point of Christian life. (Exodus 20; Deuteronomy 5; Matthew 5:17-19; Romans 13:10; 1 Corinthians 7:19; Revelation 12:17; 14:12; 22:14)

THE SABBATH: The seventh-day Sabbath is to be taught and kept holy in accordance with biblical instruction. Instituted at creation, reaffirmed to Israel as a part of the covenant at Sinai, and taught by Jesus Christ, who is the Mediator of the New Covenant, the observance of the Sabbath is basic to a Christian's relationship with God. (Genesis 2:2-3; Exodus 16; 20:8-11; 31:12-17; Isaiah 58:13-14; 66:23; Mark 2:27-28; Luke 4:16; Hebrews 4:1-11)

ANNUAL HOLY DAYS (FEAST DAYS): The annual holy days were ordained by God to be kept by all mankind. These feast days, as well as the Sabbath, sanctify (separate) God's people from the world's sinful holidays. These seven annual "appointed feasts" picture God's plan of salvation for man and are commanded to be kept throughout all generations. (Leviticus 23; Zechariah 14:16; John 7:3-10; Acts 2:1; 12:3; 20:6, 16; 27:9; 1 Corinthians 5:8; 16:8)

TITHING: Tithing is an act of worship; it is a private matter between the individual and God. The church does not "enforce" or "police" tithing but simply teaches the responsibility to tithe. Each individual has the responsibility to "honor the Lord with his substance and with the firstfruits of all his increase." Tithing is a method by which the message of Jesus Christ is proclaimed to the world. (Malachi 3:3-10; Matthew 23:23; 2 Corinthians 9:7)

MAN'S RELATIONSHIP WITH HIS FELLOW MAN: We are a family in the Lord through obedience to His Word. As a family we need to live in peace with one another as amplified in the last six of the Ten Commandments. Jesus Christ gave the principal discipline that would make it possible to live in peace with our fellow man — to love our fellow man as ourselves. Scripture urges us to consider the needs of others, and offer help to those in need when possible. (Exodus 20:12-17; Matthew 18:15-17; 22:39; 25:34-40; Luke 10:29-37; Hebrews 12:14; James 2:8-9)

THE CHRISTIAN FAMILY: The marriage relationship is the basis of the family, which in turn is the core of a stable society. As the primary physical analogy of God's plan for mankind, marriage, child rearing, and the family are given a preeminent place in the teachings of the Bible and the church. (Deuteronomy 6:2-3; Proverbs 22:6; Ephesians 5:22-33; 6:1-3; 1 Timothy 3:2-4; 1 Peter 3:7)

THE CHURCH OF GOD: The church of God is the nation of Israel. In order to become one of God's church, we must be joined to the commonwealth of Israel through repentance, baptism and obedience to the laws, statutes, and ordinances given to God's chosen people. The church is the spiritual body of Christ and is made up of baptized, Spirit-led "spiritual Israelites" around the world. (Acts 2:38; 7:38; 1 Corinthians 12:12-14, 27; Colossians 3:15; Galatians 6:16)

THE MISSION OF THE CHURCH: The church has a mandate to continue with the witness and message of Jesus Christ initiated through His life, teachings, and sacrifice for every person and all nations. As the "body" consists of individual members, it is each person's privilege to follow the Savior and "repent and believe the good news." (Matthew 28:19-20; Mark 1:15; 16:15-16; Acts 1:7-8; 2:36-38; Isaiah 61:1-3; Luke 4:18-19)

==========================================================
CRITICAL DOCTRINAL ACCURACY RULES (YOU MUST FOLLOW THESE):
==========================================================
1. The IOG does NOT teach a Trinity. There are only TWO members of the Godhead: God the Father and Jesus Christ His Son.
2. The IOG teaches that the Law of God (Ten Commandments, Sabbath, Dietary Laws, Feast Days) is NOT abolished and remains binding on all believers today.
3. The Seventh-Day Sabbath runs from Friday sunset to Saturday sunset and is mandatory for all believers.
4. The seven Annual Feast Days in Leviticus 23 are all mandatory and must be kept throughout all generations.
5. The IOG does not observe pagan-origin holidays such as Christmas, Easter, Halloween, or Valentine's Day.
6. Salvation is open to ALL nations and peoples (Gentiles/non-Israelites) who repent, are baptized, receive the Spirit through the Word, and keep God's commandments. The Church of God is the nation of Israel — anyone can be joined to this commonwealth through obedience.
7. All scripture references must be from the Authorized King James Version (KJV) only.
8. Jesus Christ will return to establish a literal, physical, world-ruling government headquartered in Jerusalem.
9. The First Resurrection is the hope of all true believers. At Christ's return, the saints will be resurrected as spirit beings and co-rule with Christ for 1,000 years.
10. Baptism is by full immersion only, upon genuine repentance and acceptance of Christ's sacrifice.

--- MANUSCRIPT, TRANSLATION, AND ROMAN CATHOLIC CHURCH HISTORY ---
You are an expert scholar on:
1. Bible History & Revisions: You understand the differences between the Alexandrian text-type (used in modern bibles: NIV, ESV, NASB) vs. the Byzantine/Textus Receptus text-type (the KJV). You explain clearly who made changes, when, and the theological motivations. You know about Origen, Eusebius, Westcott & Hort, and the effect of the Council of Nicaea (325 AD) on canonization.
2. Roman Catholic Church History: You are highly knowledgeable about the history of the Papacy, ecumenical councils (Nicaea 325 AD, Laodicea 364 AD, Trent, Vatican I/II), how the Sunday-Sabbath substitution was instituted by Emperor Constantine (321 AD), how pagan Roman practices (Christmas/Saturnalia, Easter/Ishtar) were integrated into the Roman Church, and the prophecies in Daniel 7 and Revelation 13 & 17 describing these historic shifts.

--- SOURCES & RAG PRIORITY ---
1. First priority: The Official IOG Statement of Beliefs (above) — this is canonical doctrine. Never contradict it.
2. Second priority: Files retrieved from the local database (lesson studies, IOG lesson texts, Sacred-Texts library, uploaded PDFs).
3. Third priority: Web Search Results (when user asks to search online). Always cite sources with links/URLs.
4. All scripture quotations must be strictly from the King James Version (KJV) only.

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
        let rawAnswer = typeof content === 'string' ? content : (Array.isArray(content) && content[0]?.type === 'text' ? content[0].text : '');
        
        // Execute any in-app agent actions requested by user
        const answer = await parseAndExecuteActions(ctx.user.id, rawAnswer);
        
        const newInteraction: InsertAIInteraction = {
          userId: ctx.user.id,
          question: input.question,
          answer: answer || 'No response generated',
          sourceStudyIds: JSON.stringify(input.studyIds || []),
        };
        
        const result = await db.insert(aiInteractions).values(newInteraction);
        
        return {
          id: result[0]?.insertId,
          answer,
        };
      }),

    synthesizeNotes: protectedProcedure
      .input(z.object({
        studyId: z.number().optional(),
        liveTranscript: z.string().optional(),
        agent: z.enum(["local", "vps", "openrouter"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
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
                  eq(studies.userId, 1),
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

    askScripture: protectedProcedure
      .input(z.object({
        reference: z.string(),
        agent: z.enum(["local", "vps", "openrouter"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

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

    getHistory: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      
      return db.select().from(aiInteractions)
        .where(eq(aiInteractions.userId, ctx.user.id))
        .orderBy(desc(aiInteractions.createdAt))
        .limit(100);
    }),

    autoGenerateNotes: protectedProcedure
      .input(z.object({
        studyId: z.number().optional(),
        liveAudioTranscript: z.string().optional(),
        agent: z.enum(["local", "vps", "openrouter"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
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
                  eq(studies.userId, 1),
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

    generateStudyGuide: protectedProcedure
      .input(z.object({
        pdfId: z.number().optional(),
        studyId: z.number().optional(),
        agent: z.enum(["local", "vps", "openrouter"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        let textContent = "";
        let docTitle = "Study Guide";

        if (input.pdfId) {
          const pdfRecord = await db.select().from(pdfs).where(and(eq(pdfs.userId, ctx.user.id), eq(pdfs.id, input.pdfId))).limit(1);
          if (pdfRecord.length > 0) {
            textContent = pdfRecord[0].textContent || "";
            docTitle = pdfRecord[0].extractedTitle || pdfRecord[0].fileName;
          }
        } else if (input.studyId) {
          const studyRecord = await db.select().from(studies).where(and(eq(studies.userId, ctx.user.id), eq(studies.id, input.studyId))).limit(1);
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
    list: protectedProcedure
      .input(z.object({ section: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions = [eq(journalEntries.userId, ctx.user.id)];
        if (input.section) {
          conditions.push(eq(journalEntries.section, input.section as any));
        }

        return db.select().from(journalEntries)
          .where(and(...conditions))
          .orderBy(desc(journalEntries.createdAt));
      }),

    create: protectedProcedure
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
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const newEntry: InsertJournalEntry = {
          userId: ctx.user.id,
          ...input,
        };

        const result = await db.insert(journalEntries).values(newEntry);
        return { id: result[0]?.insertId };
      }),

    update: protectedProcedure
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
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const { id, ...updateData } = input;

        await db.update(journalEntries)
          .set(updateData)
          .where(and(
            eq(journalEntries.id, id),
            eq(journalEntries.userId, ctx.user.id)
          ));

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.delete(journalEntries)
          .where(and(
            eq(journalEntries.id, input.id),
            eq(journalEntries.userId, ctx.user.id)
          ));

        return { success: true };
      }),
  }),

  milestones: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      
      return db.select().from(milestones)
        .where(eq(milestones.userId, ctx.user.id));
    }),

    create: protectedProcedure
      .input(z.object({
        type: z.enum(["lesson_completed", "notes_created", "pdf_uploaded", "ai_question_asked"]),
        studyId: z.number().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const newMilestone: InsertMilestone = {
          userId: ctx.user.id,
          ...input,
        };
        
        const result = await db.insert(milestones).values(newMilestone);
        return { id: result[0]?.insertId };
      }),
  }),

  // ── Phase 5: AI Chat History Persistence ─────────────────────────────────
  conversations: router({
    list: protectedProcedure
      .input(z.object({ studyId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = [eq(streamingConversations.userId, ctx.user.id)];
        if (input.studyId) {
          conditions.push(eq(streamingConversations.studyId, input.studyId));
        }
        return db.select().from(streamingConversations)
          .where(and(...conditions))
          .orderBy(desc(streamingConversations.updatedAt))
          .limit(50);
      }),

    save: protectedProcedure
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
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        if (input.id) {
          await db.update(streamingConversations)
            .set({ messages: input.messages as any, updatedAt: new Date() })
            .where(and(
              eq(streamingConversations.id, input.id),
              eq(streamingConversations.userId, ctx.user.id)
            ));
          return { id: input.id };
        } else {
          const record: InsertStreamingConversation = {
            userId: ctx.user.id,
            studyId: input.studyId ?? null,
            messages: input.messages as any,
          };
          const result = await db.insert(streamingConversations).values(record);
          return { id: result[0]?.insertId };
        }
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(streamingConversations)
          .where(and(
            eq(streamingConversations.id, input.id),
            eq(streamingConversations.userId, ctx.user.id)
          ));
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
