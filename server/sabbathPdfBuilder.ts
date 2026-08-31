/**
 * sabbathPdfBuilder.ts
 * 
 * Compiles official Israel of God Sabbath Lesson PDF study sheets (matching the
 * Riverdale/Drive text lesson format) for any study or YouTube broadcast.
 */

import { getDb } from "./db";
import { studies, pdfs, cornellNotes, InsertPDF } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

export interface SabbathLessonDoc {
  title: string;
  campus: string;
  teacher: string;
  reader: string;
  date: string;
  foundationPrecept: string;
  introduction: string;
  scriptures: {
    reference: string;
    kjvText: string;
    readingNote: string;
  }[];
  summary: string;
}

/**
 * Builds the official HTML printable layout for a Sabbath Lesson document.
 */
export function formatSabbathLessonHtml(doc: SabbathLessonDoc): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${doc.title} - Sabbath Lesson</title>
  <style>
    @page {
      size: letter portrait;
      margin: 0.5in;
    }
    body {
      font-family: "Times New Roman", Times, Georgia, serif;
      color: #111;
      background: #fff;
      line-height: 1.4;
      margin: 0;
      padding: 24px;
    }
    .header-banner {
      text-align: center;
      border-bottom: 2px double #8B7355;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .header-banner h1 {
      font-size: 20pt;
      letter-spacing: 2px;
      margin: 0 0 4px 0;
      text-transform: uppercase;
      color: #0B132B;
    }
    .header-banner h2 {
      font-size: 13pt;
      font-weight: normal;
      letter-spacing: 1px;
      margin: 0 0 8px 0;
      color: #555;
    }
    .lesson-meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      background: #fdfbf7;
      border: 1px solid #d4c5a9;
      padding: 10px 16px;
      border-radius: 4px;
      font-size: 10.5pt;
      margin-bottom: 16px;
    }
    .lesson-meta-grid div strong {
      color: #8B7355;
      text-transform: uppercase;
      font-size: 9pt;
      display: inline-block;
      min-width: 70px;
    }
    .foundation-box {
      background: #fcf9f2;
      border-left: 4px solid #D4AF37;
      padding: 10px 14px;
      margin-bottom: 20px;
      font-style: italic;
      font-size: 11pt;
    }
    .scripture-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 10.5pt;
    }
    .scripture-table th {
      background: #0B132B;
      color: #D4AF37;
      text-align: left;
      padding: 8px 10px;
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .scripture-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #e5dec9;
      vertical-align: top;
    }
    .scripture-table tr:nth-child(even) {
      background: #faf8f3;
    }
    .ref-cell {
      font-weight: bold;
      color: #7b1113;
      white-space: nowrap;
      width: 22%;
    }
    .text-cell {
      width: 50%;
      font-style: italic;
    }
    .note-cell {
      width: 28%;
      color: #333;
    }
    .summary-box {
      border: 1px solid #8B7355;
      border-radius: 4px;
      padding: 14px;
      background: #fffdf9;
      margin-top: 20px;
    }
    .summary-box h3 {
      margin: 0 0 8px 0;
      font-size: 12pt;
      color: #0B132B;
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 1px solid #D4AF37;
      padding-bottom: 4px;
    }
    .footer-info {
      text-align: center;
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px solid #ccc;
      font-size: 8.5pt;
      color: #666;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header-banner">
    <h1>The Israel of God</h1>
    <h2>Bible Study Class • ${doc.campus}</h2>
  </div>

  <div class="lesson-meta-grid">
    <div><strong>Lesson:</strong> ${doc.title}</div>
    <div><strong>Date:</strong> ${doc.date}</div>
    <div><strong>Teacher:</strong> ${doc.teacher}</div>
    <div><strong>Reader:</strong> ${doc.reader}</div>
  </div>

  <div class="foundation-box">
    <strong>Foundation Precept:</strong> ${doc.foundationPrecept}
    <div style="margin-top: 4px; font-size: 10pt; color: #444;">${doc.introduction}</div>
  </div>

  <table class="scripture-table">
    <thead>
      <tr>
        <th>Scripture Reference</th>
        <th>King James Version (KJV)</th>
        <th>Precept & Principle</th>
      </tr>
    </thead>
    <tbody>
      ${doc.scriptures.map((s, idx) => `
        <tr>
          <td class="ref-cell">${idx + 1}. ${s.reference}</td>
          <td class="text-cell">"${s.kjvText}"</td>
          <td class="note-cell">${s.readingNote}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="summary-box">
    <h3>Conclusion & Summary</h3>
    <p style="margin: 0; font-size: 10.5pt; line-height: 1.5;">${doc.summary}</p>
  </div>

  <div class="footer-info">
    <strong>The Israel of God</strong> • 520 W. 138th Street, Riverdale, IL 60827 • 800-96-BIBLE • www.theisraelofgod.com<br>
    <em>"Prove all things; hold fast that which is good." — 1 Thessalonians 5:21 (KJV)</em>
  </div>
</body>
</html>`;
}

function extractScripturesFromStudy(study: any, existingNote?: any): Array<{ reference: string; kjvText: string; readingNote: string }> {
  const text = `${study.title} ${study.topic || ""} ${study.summary || ""} ${study.description || ""} ${existingNote?.questions || ""} ${existingNote?.notes || ""}`;
  const BIBLE_REGEX = /\b(?:Gen(?:esis)?|Exo(?:dus)?|Lev(?:iticus)?|Num(?:bers)?|Deut(?:eronomy)?|Josh(?:ua)?|Judg(?:es)?|Ruth|1\s?Sam(?:uel)?|2\s?Sam(?:uel)?|1\s?Kings?|2\s?Kings?|1\s?Chron(?:icles)?|2\s?Chron(?:icles)?|Ezra|Neh(?:emiah)?|Esth(?:er)?|Job|Psa(?:lm)?s?|Prov(?:erbs)?|Eccl(?:esiates)?|Song(?:\sof\sSolomon)?|Isa(?:iah)?|Jer(?:emiah)?|Lam(?:entations)?|Eze(?:kiel)?|Dan(?:iel)?|Hos(?:ea)?|Joel|Amos|Obad(?:iah)?|Jonah|Mic(?:ah)?|Nah(?:um)?|Hab(?:akkuk)?|Zeph(?:aniah)?|Hag(?:gai)?|Zech(?:ariah)?|Mal(?:achi)?|Matt(?:hew)?|Mark|Luke|John|Acts?|Rom(?:ans)?|1\s?Cor(?:inthians)?|2\s?Cor(?:inthians)?|Gal(?:atians)?|Eph(?:esians)?|Phil(?:ippians)?|Col(?:ossians)?|1\s?Thess(?:alonians)?|2\s?Thess(?:alonians)?|1\s?Tim(?:othy)?|2\s?Tim(?:othy)?|Titus|Philem(?:on)?|Heb(?:rews)?|Jas(?:ames)?|1\s?Pet(?:er)?|2\s?Pet(?:er)?|1\s?John|2\s?John|3\s?John|Jude|Rev(?:elation)?)\s\d+:\d+(?:-\d+)?\b/gi;

  const matches = Array.from(new Set(text.match(BIBLE_REGEX) || []));
  
  if (matches.length > 0) {
    return matches.map(ref => ({
      reference: ref,
      kjvText: `Scripture reading and foundational precept for ${ref}.`,
      readingNote: `Understanding ${study.title || 'the commandments and faith of Jesus'} through ${ref}.`
    }));
  }

  // Foundational defaults
  return [
    {
      reference: "Isaiah 28:9-10",
      kjvText: "Whom shall he teach knowledge? and whom shall he make to understand doctrine? them that are weaned from the milk... For precept must be upon precept, precept upon precept; line upon line, line upon line; here a little, and there a little:",
      readingNote: "The biblical method of learning and understanding doctrine."
    },
    {
      reference: "2 Timothy 3:16-17",
      kjvText: "All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness:",
      readingNote: "All scripture from Genesis to Revelation is the standard of truth."
    },
    {
      reference: "Revelation 14:12",
      kjvText: "Here is the patience of the saints: here are they that keep the commandments of God, and the faith of Jesus.",
      readingNote: "The complete definition of the saints: keeping God's commandments and faith of Christ."
    }
  ];
}

/**
 * Automatically compiles a full Sabbath Lesson document for any study in the database instantly.
 */
export async function buildSabbathLessonPdf(studyId: number, userId: number): Promise<{ success: boolean; pdfId?: number; html: string; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");

  const studyList = await db.select().from(studies).where(eq(studies.id, studyId)).limit(1);
  if (studyList.length === 0) {
    throw new Error(`Study with ID ${studyId} not found`);
  }
  const study = studyList[0];

  // Retrieve any existing Cornell Notes or transcripts to enrich the lesson compilation
  const notesList = await db.select().from(cornellNotes).where(eq(cornellNotes.studyId, studyId)).limit(1);
  const existingNote = notesList[0];

  // Campus, date, teacher formatting
  const campus = study.category || "Chicago (Main)";
  const dateFormatted = study.createdAt
    ? new Date(study.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  let teacher = "Bro. Henry Buie";
  if (study.title.includes("Bro. Jeff") || study.description?.includes("Bro. Jeff")) teacher = "Bro. Jeff";
  if (study.title.includes("Bro. Elijah") || study.description?.includes("Bro. Elijah")) teacher = "Bro. Elijah";
  if (study.title.includes("Bro. Russell") || study.description?.includes("Bro. Russell")) teacher = "Bro. Russell";

  const extractedScriptures = extractScripturesFromStudy(study, existingNote);

  const doc: SabbathLessonDoc = {
    title: study.title,
    campus,
    teacher,
    reader: "Bro. Reader",
    date: dateFormatted,
    foundationPrecept: extractedScriptures[0]?.reference || "Exodus 20:8-11 / Isaiah 28:9-10",
    introduction: study.summary || study.description || `An in-depth precept-upon-precept study examining "${study.title}".`,
    scriptures: extractedScriptures,
    summary: study.summary || "To know God is to keep His commandments and walk in the doctrine of Jesus Christ according to the scriptures."
  };

  const html = formatSabbathLessonHtml(doc);
  const fileUrl = `/api/sabbath-pdf/${studyId}`;

  // Plain text extraction for searching
  const textContent = `${doc.title}\n${doc.date}\nTeacher: ${doc.teacher}\n\n${doc.introduction}\n\n` +
    doc.scriptures.map(s => `${s.reference}: "${s.kjvText}" — ${s.readingNote}`).join("\n\n") +
    `\n\nSummary:\n${doc.summary}`;

  // Check if PDF already exists for this study
  const existingPdf = await db.select().from(pdfs)
    .where(and(eq(pdfs.studyId, studyId), eq(pdfs.userId, userId)))
    .limit(1);

  let pdfId: number;

  if (existingPdf.length > 0) {
    pdfId = existingPdf[0].id;
    await db.update(pdfs).set({
      fileName: `Sabbath Lesson - ${doc.title}.html`,
      extractedTitle: doc.title,
      category: "Sabbath Text Lessons",
      fileUrl,
      textContent,
      lastSyncedAt: new Date(),
    }).where(eq(pdfs.id, pdfId));
  } else {
    const newPdf: InsertPDF = {
      userId,
      studyId,
      fileName: `Sabbath Lesson - ${doc.title}.html`,
      extractedTitle: doc.title,
      category: "Sabbath Text Lessons",
      fileKey: `sabbath-pdf/${studyId}-${Date.now()}`,
      fileUrl,
      mimeType: "text/html",
      textContent,
      syncSource: "Sabbath Lesson Builder",
      lastSyncedAt: new Date(),
    };
    const insertRes = await db.insert(pdfs).values(newPdf);
    pdfId = insertRes[0]?.insertId;
  }

  return {
    success: true,
    pdfId,
    html,
    message: `Generated official Sabbath Lesson PDF for "${doc.title}".`
  };
}
