/**
 * agentActions.ts
 * 
 * Tool execution engine allowing the in-app AI Teacher to perform real actions
 * in Bible Study Pro on behalf of the user (e.g. create Cornell notes, build new
 * study guides, add milestones, add journal reflections, trigger syncs, navigate/open screens).
 */

import { getDb } from "./db";
import { studies, cornellNotes, journalEntries, milestones, pdfs, InsertStudy, InsertCornellNote, InsertJournalEntry, InsertMilestone } from "../drizzle/schema";
import { eq, or, like, desc } from "drizzle-orm";
import { runYouTubeSync } from "./youtubeSync";
import { syncIOGLessons } from "./syncIOGLessons";
import { startWatchFolder } from "./watchFolder";

export interface AgentActionTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export const AGENT_TOOLS: AgentActionTool[] = [
  {
    name: "create_study",
    description: "Creates a new Bible study lesson/topic in the user's library.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the study lesson" },
        topic: { type: "string", description: "Main biblical topic (e.g. Sabbath, Dietary Law, Salvation, Prophecy)" },
        category: { type: "string", description: "Category (e.g. Sabbath & Law, Prophecy & History, Salvation, Holy Days)" },
        summary: { type: "string", description: "Concise summary of the lesson scriptures and doctrine" },
        description: { type: "string", description: "Detailed biblical notes and scripture breakdowns (KJV)" },
      },
      required: ["title", "summary"]
    }
  },
  {
    name: "create_cornell_note",
    description: "Creates and saves a structured Cornell Note in the user's study workspace with questions, notes, and summary.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title or topic for the Cornell Note" },
        questions: { type: "string", description: "Cue column questions, key terms, or scripture references" },
        notes: { type: "string", description: "Main note section detailing scriptural facts, historical records, and explanations" },
        summary: { type: "string", description: "Bottom summary synthesizing the key takeaways" },
      },
      required: ["title", "notes", "summary"]
    }
  },
  {
    name: "create_journal_entry",
    description: "Creates a personal spiritual journal entry or reflection in the user's Journal.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title for the journal entry" },
        content: { type: "string", description: "Reflective journal content with biblical grounding" },
      },
      required: ["title", "content"]
    }
  },
  {
    name: "create_milestone",
    description: "Adds a study milestone or learning goal to the user's roadmap.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the milestone (e.g. Read Book of Daniel, Memorize 10 Commandments)" },
        targetDate: { type: "string", description: "Target completion date (YYYY-MM-DD) or timeframe" },
      },
      required: ["title"]
    }
  },
  {
    name: "trigger_sync",
    description: "Triggers synchronization of YouTube uploads, Google Drive PDFs, or local watch folder.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "Which sync to run: 'youtube', 'drive', 'all', or 'folder'" }
      },
      required: ["target"]
    }
  },
  {
    name: "navigate_to",
    description: "Opens or redirects the user to a specific screen in the app (e.g. Vault, Notes, Live Study, History, Journal, Iron Sharpen Iron).",
    parameters: {
      type: "object",
      properties: {
        screen: { type: "string", description: "Target screen: 'vault' | 'notes' | 'live' | 'history' | 'journal' | 'iron' | 'library'" },
        label: { type: "string", description: "Friendly label for the screen button" }
      },
      required: ["screen"]
    }
  },
  {
    name: "open_study",
    description: "Finds and opens a specific Bible study/lesson in the Cornell Notes study workspace.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Title, topic, or keyword of the study to open" }
      },
      required: ["query"]
    }
  },
  {
    name: "open_pdf",
    description: "Finds and opens a PDF or document from the Scripture Vault in the study workspace.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filename or title of the PDF to open" }
      },
      required: ["query"]
    }
  },
  {
    name: "build_lesson_pdf",
    description: "Compiles and generates the official Israel of God Sabbath Lesson PDF document for a study with ordered KJV scriptures.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Title or topic of the study to build the lesson PDF for" }
      },
      required: ["query"]
    }
  }
];

export async function executeAgentAction(
  userId: number,
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; message: string; data?: any }> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database not connected" };

  try {
    switch (toolName) {
      case "create_study": {
        const newStudy: InsertStudy = {
          userId,
          title: args.title,
          topic: args.topic || "Bible Study",
          category: args.category || "General",
          summary: args.summary || "",
          description: args.description || "",
        };
        const res = await db.insert(studies).values(newStudy);
        const studyId = res[0]?.insertId;
        return {
          success: true,
          message: `Created new study "${args.title}" (ID: ${studyId}) in your Library.`,
          data: { action: "open_study", path: `/notes?studyId=${studyId}`, label: `Open Study: ${args.title}`, studyId }
        };
      }

      case "create_cornell_note": {
        let targetStudyId = 1;
        const existingStudy = await db.select().from(studies)
          .where(or(like(studies.title, `%${args.title}%`), eq(studies.userId, userId)))
          .limit(1);

        if (existingStudy.length > 0) {
          targetStudyId = existingStudy[0].id;
        } else {
          const res = await db.insert(studies).values({
            userId,
            title: args.title,
            topic: "Study Notes",
            category: "Notes",
            summary: args.summary?.substring(0, 255) || "",
          });
          targetStudyId = res[0]?.insertId || 1;
        }

        const newNote: InsertCornellNote = {
          userId,
          studyId: targetStudyId,
          questions: args.questions || "",
          notes: args.notes || "",
          summary: args.summary || "",
        };

        const resNote = await db.insert(cornellNotes).values(newNote);
        return {
          success: true,
          message: `Created Cornell Note for "${args.title}".`,
          data: { action: "open_notes", path: `/notes?studyId=${targetStudyId}`, label: `Open Notes: ${args.title}`, noteId: resNote[0]?.insertId }
        };
      }

      case "create_journal_entry": {
        const newEntry: InsertJournalEntry = {
          userId,
          title: args.title,
          content: args.content,
        };
        const res = await db.insert(journalEntries).values(newEntry);
        return {
          success: true,
          message: `Added journal entry "${args.title}" to your spiritual journal.`,
          data: { action: "navigate_to", path: "/journal", label: "Open Study Journal", entryId: res[0]?.insertId }
        };
      }

      case "create_milestone": {
        const newMilestone: InsertMilestone = {
          userId,
          title: args.title,
          targetDate: args.targetDate ? new Date(args.targetDate) : undefined,
          completed: false,
        };
        const res = await db.insert(milestones).values(newMilestone);
        return {
          success: true,
          message: `Added milestone "${args.title}" to your study roadmap.`,
          data: { action: "navigate_to", path: "/iron", label: "View Milestones", milestoneId: res[0]?.insertId }
        };
      }

      case "trigger_sync": {
        if (args.target === "youtube" || args.target === "all") {
          runYouTubeSync().catch(console.error);
        }
        if (args.target === "drive" || args.target === "all") {
          syncIOGLessons().catch(console.error);
        }
        if (args.target === "folder" || args.target === "all") {
          startWatchFolder();
        }
        return {
          success: true,
          message: `Triggered synchronization for: ${args.target}. New content will be indexed in background.`,
          data: { action: "sync_started" }
        };
      }

      case "navigate_to": {
        const screenMap: Record<string, { path: string; label: string }> = {
          vault: { path: "/vault", label: "Scripture Vault" },
          notes: { path: "/notes", label: "Cornell Notes" },
          live: { path: "/notes", label: "Live Study Session" },
          history: { path: "/history", label: "Heritage & History" },
          journal: { path: "/journal", label: "Study Journal" },
          iron: { path: "/iron", label: "Iron Sharpen Iron" },
          library: { path: "/", label: "Library Home" },
        };
        const target = screenMap[args.screen?.toLowerCase()] || { path: `/${args.screen}`, label: args.label || args.screen };
        return {
          success: true,
          message: `Navigating to ${target.label}.`,
          data: { action: "navigate_to", path: target.path, label: target.label }
        };
      }

      case "open_study": {
        const q = `%${args.query}%`;
        const matched = await db.select().from(studies)
          .where(or(like(studies.title, q), like(studies.topic, q), like(studies.summary, q)))
          .limit(1);

        if (matched.length > 0) {
          const s = matched[0];
          return {
            success: true,
            message: `Found study "${s.title}". Opening study workspace...`,
            data: { action: "open_study", path: `/notes?studyId=${s.id}`, label: `Open Study: ${s.title}`, studyId: s.id }
          };
        } else {
          return { success: false, message: `Could not find any study matching "${args.query}".` };
        }
      }

      case "open_pdf": {
        const q = `%${args.query}%`;
        const matched = await db.select().from(pdfs)
          .where(or(like(pdfs.fileName, q), like(pdfs.extractedTitle, q), like(pdfs.textContent, q)))
          .limit(1);

        if (matched.length > 0) {
          const p = matched[0];
          const path = `/notes?mode=explore&lessonTitle=${encodeURIComponent(p.extractedTitle || p.fileName)}&lessonUrl=${encodeURIComponent(p.fileUrl)}`;
          return {
            success: true,
            message: `Found document "${p.extractedTitle || p.fileName}". Opening in study workspace...`,
            data: { action: "open_pdf", path, label: `Open PDF: ${p.extractedTitle || p.fileName}` }
          };
        } else {
          return { success: false, message: `Could not find any PDF matching "${args.query}".` };
        }
      }

      case "build_lesson_pdf": {
        const q = `%${args.query}%`;
        const matched = await db.select().from(studies)
          .where(or(like(studies.title, q), like(studies.topic, q)))
          .limit(1);

        if (matched.length > 0) {
          const s = matched[0];
          const { buildSabbathLessonPdf } = await import("./sabbathPdfBuilder");
          const pdfResult = await buildSabbathLessonPdf(s.id, userId);
          return {
            success: true,
            message: `Compiled and built official Sabbath Lesson PDF for "${s.title}".`,
            data: { 
              action: "open_pdf", 
              path: `/notes?studyId=${s.id}`, 
              label: `Open Sabbath PDF: ${s.title}`, 
              pdfId: pdfResult.pdfId 
            }
          };
        } else {
          return { success: false, message: `Could not find study matching "${args.query}" to build PDF.` };
        }
      }

      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    console.error(`[Agent Action] Failed to execute ${toolName}:`, err);
    return { success: false, message: `Error executing action: ${err.message || String(err)}` };
  }
}

export const AGENT_ACTION_SYSTEM_PROMPT = `
--- IN-APP AGENT PERMISSIONS & CAPABILITIES ---
You have active permissions to perform actions, build study materials, and open screens/documents directly inside the user's Bible Study Pro app!
When the user asks you to:
- Open a screen (e.g. "open vault", "go to notes", "open live study", "open journal", "open history")
- Open a study or lesson (e.g. "open the study on...", "load the lesson on...")
- Open a PDF or document (e.g. "open the 4 Winds PDF", "open the statement of beliefs")
- Create or build items (e.g. "create a Cornell note on...", "add a study on...", "add a milestone for...", "create a journal entry about...", "sync my lessons")

You must both explain the biblical answer AND execute the action by outputting an action block at the end of your response:

\`\`\`action
{
  "action": "<action_name>",
  "args": { ... }
}
\`\`\`

Available actions:
1. navigate_to: args: { "screen": "vault" | "notes" | "live" | "history" | "journal" | "iron" | "library", "label": "string" }
2. open_study: args: { "query": "title or topic of study to open" }
3. open_pdf: args: { "query": "title or topic of PDF to open" }
4. create_cornell_note: args: { "title": "string", "questions": "string", "notes": "string", "summary": "string" }
5. create_study: args: { "title": "string", "topic": "string", "category": "string", "summary": "string", "description": "string" }
6. create_journal_entry: args: { "title": "string", "content": "string" }
7. create_milestone: args: { "title": "string", "targetDate": "YYYY-MM-DD" }
8. trigger_sync: args: { "target": "youtube" | "drive" | "folder" | "all" }

Always provide rich, biblically sound (KJV) content in the args, and your action will automatically execute in the user's app.
`;

export async function parseAndExecuteActions(userId: number, rawAnswer: string): Promise<string> {
  const actionRegex = /```(?:action|json)\s*\n?([\s\S]*?)\n?```|<action>([\s\S]*?)<\/action>/gi;
  let match;
  let finalAnswer = rawAnswer;
  const executedActions: { message: string; navTag?: string }[] = [];

  while ((match = actionRegex.exec(rawAnswer)) !== null) {
    const jsonStr = match[1] || match[2];
    try {
      const parsed = JSON.parse(jsonStr.trim());
      if (parsed.action && parsed.args) {
        const result = await executeAgentAction(userId, parsed.action, parsed.args);
        if (result.success) {
          let navTag: string | undefined;
          if (result.data?.path && result.data?.label) {
            navTag = `[[NAVIGATE:${result.data.path}:${result.data.label}]]`;
          }
          executedActions.push({ message: result.message, navTag });
        }
      }
    } catch {
      // ignore non-action json
    }
  }

  if (executedActions.length > 0) {
    finalAnswer = finalAnswer.replace(/```(?:action|json)\s*\n?\{\s*"action"[\s\S]*?\}\s*\n?```/gi, "").trim();
    finalAnswer += `\n\n---\n**🛠️ In-App Action Executed:**\n` + executedActions.map(a => `• ${a.message}${a.navTag ? ` ${a.navTag}` : ""}`).join("\n");
  }

  return finalAnswer;
}
