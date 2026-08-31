import { eq, and, like, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, users, studies, pdfs, cornellNotes, tags, studyTags, aiInteractions, milestones } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: any = null;
let _pool: mysql.Pool | null = null;
let _keepAliveTimer: ReturnType<typeof setInterval> | null = null;

async function createPool(): Promise<mysql.Pool> {
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Keep-alive: prevent Hetzner from dropping idle connections
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // Timeouts: fail fast instead of hanging the UI forever
    connectTimeout: 10000,        // 10s to establish connection
    // Reconnect on lost connection
    multipleStatements: false,
  });

  // Handle pool-level errors so they don't crash the process
  pool.on("connection", (conn) => {
    conn.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "PROTOCOL_CONNECTION_LOST" || err.code === "ECONNRESET") {
        console.warn("[Database] Connection lost — pool will reconnect automatically.");
      }
    });
  });

  return pool;
}

function startKeepAlive(pool: mysql.Pool) {
  // Ping every 30 seconds to prevent Hetzner from closing idle connections
  if (_keepAliveTimer) clearInterval(_keepAliveTimer);
  _keepAliveTimer = setInterval(async () => {
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
    } catch {
      // Connection lost — reset so getDb() recreates the pool on next call
      console.warn("[Database] Keep-alive ping failed — resetting pool.");
      _db = null;
      _pool = null;
      if (_keepAliveTimer) {
        clearInterval(_keepAliveTimer);
        _keepAliveTimer = null;
      }
    }
  }, 30000);
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = await createPool();

      // Verify connection is actually working before returning
      const conn = await _pool.getConnection();
      await conn.ping();
      conn.release();

      _db = drizzle(_pool);
      startKeepAlive(_pool);
      console.log("[Database] Connected and keep-alive active.");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _pool = null;
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Study queries
export async function getStudiesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(studies)
    .where(eq(studies.userId, userId))
    .orderBy(desc(studies.createdAt));
}

export async function getStudyById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(studies)
    .where(eq(studies.id, id))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function searchStudies(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  
  const searchPattern = `%${query}%`;
  return db.select().from(studies)
    .where(and(
      eq(studies.userId, userId),
      like(studies.title, searchPattern)
    ))
    .orderBy(desc(studies.createdAt));
}

export async function getStudiesByCategory(userId: number, category: string) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(studies)
    .where(and(
      eq(studies.userId, userId),
      eq(studies.category, category)
    ))
    .orderBy(desc(studies.createdAt));
}

// PDF queries
export async function getPdfsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(pdfs)
    .where(eq(pdfs.userId, userId))
    .orderBy(desc(pdfs.createdAt));
}

export async function getPdfsByStudy(studyId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(pdfs)
    .where(eq(pdfs.studyId, studyId));
}

export async function searchPdfContent(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  
  const searchPattern = `%${query}%`;
  return db.select().from(pdfs)
    .where(and(
      eq(pdfs.userId, userId),
      like(pdfs.textContent, searchPattern)
    ))
    .orderBy(desc(pdfs.createdAt));
}

// Cornell notes queries
export async function getCornellNotesByStudy(studyId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(cornellNotes)
    .where(eq(cornellNotes.studyId, studyId))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function getCornellNotesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(cornellNotes)
    .where(eq(cornellNotes.userId, userId))
    .orderBy(desc(cornellNotes.updatedAt));
}

// Tags queries
export async function getTagsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(desc(tags.createdAt));
}

// AI interactions queries
export async function getAIInteractionsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(aiInteractions)
    .where(eq(aiInteractions.userId, userId))
    .orderBy(desc(aiInteractions.createdAt));
}

// Milestones queries
export async function getMilestonesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(milestones)
    .where(eq(milestones.userId, userId))
    .orderBy(desc(milestones.createdAt));
}
