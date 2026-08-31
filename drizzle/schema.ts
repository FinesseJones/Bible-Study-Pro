import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const studies = mysqlTable("studies", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  topic: varchar("topic", { length: 128 }),
  category: varchar("category", { length: 64 }),
  description: text("description"),
  videoUrl: varchar("videoUrl", { length: 512 }),
  thumbnail: varchar("thumbnail", { length: 512 }),
  summary: text("summary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Study = typeof studies.$inferSelect;
export type InsertStudy = typeof studies.$inferInsert;

export const pdfs = mysqlTable("pdfs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  studyId: int("studyId").references(() => studies.id),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  extractedTitle: varchar("extractedTitle", { length: 255 }),
  category: varchar("category", { length: 128 }).default("Unclassified"),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 512 }).notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 64 }).default("application/pdf"),
  thumbnailUrl: varchar("thumbnailUrl", { length: 512 }),
  textContent: text("textContent"),
  metadata: json("metadata"),
  syncSource: varchar("syncSource", { length: 256 }),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PDF = typeof pdfs.$inferSelect;
export type InsertPDF = typeof pdfs.$inferInsert;

export const cornellNotes = mysqlTable("cornell_notes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  studyId: int("studyId").notNull().references(() => studies.id),
  questions: text("questions"),
  notes: text("notes"),
  summary: text("summary"),
  attachments: text("attachments"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CornellNote = typeof cornellNotes.$inferSelect;
export type InsertCornellNote = typeof cornellNotes.$inferInsert;

export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["keyword", "scripture", "topic"]).default("keyword"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

export const studyTags = mysqlTable("study_tags", {
  id: int("id").autoincrement().primaryKey(),
  studyId: int("studyId").notNull().references(() => studies.id),
  tagId: int("tagId").notNull().references(() => tags.id),
});

export type StudyTag = typeof studyTags.$inferSelect;
export type InsertStudyTag = typeof studyTags.$inferInsert;

export const aiInteractions = mysqlTable("ai_interactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sourceStudyIds: varchar("sourceStudyIds", { length: 1024 }),
  generatedPdfUrl: varchar("generatedPdfUrl", { length: 512 }),
  relatedVideoUrls: varchar("relatedVideoUrls", { length: 1024 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AIInteraction = typeof aiInteractions.$inferSelect;
export type InsertAIInteraction = typeof aiInteractions.$inferInsert;

export const milestones = mysqlTable("milestones", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  type: mysqlEnum("type", ["lesson_completed", "notes_created", "pdf_uploaded", "ai_question_asked"]).notNull(),
  studyId: int("studyId").references(() => studies.id),
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Milestone = typeof milestones.$inferSelect;
export type InsertMilestone = typeof milestones.$inferInsert;

export const aiMemory = mysqlTable("ai_memory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  insight: text("insight").notNull(),
  context: text("context"),
  importance: int("importance").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AIMemory = typeof aiMemory.$inferSelect;
export type InsertAIMemory = typeof aiMemory.$inferInsert;

export const journalEntries = mysqlTable("journal_entries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  section: mysqlEnum("section", ["Sabbath", "Daily", "Prayer", "Feast", "Memory", "History"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  scripture: varchar("scripture", { length: 255 }),
  notes: text("notes"),
  prayer: text("prayer"),
  tags: varchar("tags", { length: 512 }),
  handwritingData: text("handwritingData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type JournalEntry = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = typeof journalEntries.$inferInsert;

export const liveTranscripts = mysqlTable("live_transcripts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  studyId: int("studyId").references(() => studies.id),
  transcript: text("transcript").notNull(),
  duration: int("duration"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LiveTranscript = typeof liveTranscripts.$inferSelect;
export type InsertLiveTranscript = typeof liveTranscripts.$inferInsert;

export const streamingConversations = mysqlTable("streaming_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  studyId: int("studyId").references(() => studies.id),
  messages: json("messages").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StreamingConversation = typeof streamingConversations.$inferSelect;
export type InsertStreamingConversation = typeof streamingConversations.$inferInsert;

export const pdfSyncLogs = mysqlTable("pdf_sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  syncSource: varchar("syncSource", { length: 256 }),
  filesProcessed: int("filesProcessed"),
  filesAdded: int("filesAdded"),
  filesFailed: int("filesFailed"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  status: mysqlEnum("status", ["running", "success", "partial-error", "failed"]).default("running").notNull(),
  errorLog: text("errorLog"),
});

export type PDFSyncLog = typeof pdfSyncLogs.$inferSelect;
export type InsertPDFSyncLog = typeof pdfSyncLogs.$inferInsert;
