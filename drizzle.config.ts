import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
  tablesFilter: [
    "users",
    "studies",
    "pdfs",
    "cornell_notes",
    "tags",
    "study_tags",
    "ai_interactions",
    "ai_memory",
    "milestones",
    "journal_entries",
    "live_transcripts",
    "streaming_conversations",
    "pdf_sync_logs"
  ]
});
