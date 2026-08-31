/**
 * sabbathPdfBuilder.ts
 * 
 * Dynamic Multi-Page Israel of God Sabbath Lesson PDF study sheet builder & document engine.
 * Supports video broadcast lower-third cover banner, dynamic multi-page flow, and in-app editing.
 */

import { getDb } from "./db";
import { studies, pdfs, cornellNotes, InsertPDF } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface SabbathLessonSection {
  heading?: string;
  scriptureRef?: string;
  scriptureText?: string;
  notes?: string[];
  calloutWord?: string;
}

export interface SabbathLessonPage {
  pageNumber: number;
  totalPages?: number;
  leftColumn: SabbathLessonSection[];
  rightColumn: SabbathLessonSection[];
  conclusionCallout?: string;
  metaFooter?: {
    previousDates?: string;
    prayerList?: string;
    pictureCredits?: string;
  };
  isNotesPage?: boolean;
}

export interface SabbathLessonDocInput {
  title: string;
  campus: string;
  teacher: string;
  reader: string;
  date: string;
  prayerReference: string;
  prayerText: string;
  bannerImageUrl?: string | null;
  sections: SabbathLessonSection[];
  conclusionCallout?: string;
  previousDates?: string;
  prayerList?: string;
  pictureCredits?: string;
  includeNotesPage?: boolean;
}

export interface SabbathLessonDoc {
  title: string;
  campus: string;
  teacher: string;
  reader: string;
  date: string;
  prayerReference: string;
  prayerText: string;
  bannerImageUrl?: string | null;
  totalPages: number;
  pages: SabbathLessonPage[];
}

/**
 * Extracts high-res thumbnail / lower-third image from YouTube lesson URL.
 */
export function getYouTubeThumbnail(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/|shorts\/))([\w-]{11})/i);
  if (match && match[1]) {
    return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
  }
  return null;
}

/**
 * Computes layout weight for dynamic letter column capacity.
 */
function computeSectionWeight(sec: SabbathLessonSection): number {
  let w = 0;
  if (sec.heading) w += 35;
  if (sec.calloutWord) w += 45;
  if (sec.scriptureRef) w += 22;
  if (sec.scriptureText) {
    w += Math.ceil(sec.scriptureText.length / 52) * 16;
  }
  if (sec.notes && sec.notes.length > 0) {
    w += 18;
    for (const note of sec.notes) {
      w += 15 + Math.ceil(note.length / 48) * 14;
    }
  }
  return Math.max(w, 40);
}

/**
 * Smart dynamic flow paginator for Israel of God Sabbath Lessons.
 * Automatically distributes scriptures and notes across 1..N pages.
 */
export function paginateSabbathLesson(input: SabbathLessonDocInput): SabbathLessonDoc {
  const pages: SabbathLessonPage[] = [];
  let currentPageNumber = 1;
  let currentLeft: SabbathLessonSection[] = [];
  let currentRight: SabbathLessonSection[] = [];
  let currentLeftWeight = 0;
  let currentRightWeight = 0;

  // Page 1 has Cover Banner (~170px) and Prayer Box (~70px), subsequent pages have full column height
  const getColCapacity = (pageNum: number) => pageNum === 1 ? 460 : 660;

  const sections = [...input.sections];

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const secWeight = computeSectionWeight(sec);
    const colCap = getColCapacity(currentPageNumber);

    // Try Left column first
    if (currentLeftWeight + secWeight <= colCap || (currentLeft.length === 0 && currentRight.length === 0)) {
      currentLeft.push(sec);
      currentLeftWeight += secWeight;
    } 
    // Try Right column
    else if (currentRightWeight + secWeight <= colCap || currentRight.length === 0) {
      currentRight.push(sec);
      currentRightWeight += secWeight;
    } 
    // Both columns full -> push page and start next page
    else {
      pages.push({
        pageNumber: currentPageNumber,
        leftColumn: currentLeft,
        rightColumn: currentRight,
      });
      currentPageNumber++;
      currentLeft = [sec];
      currentRight = [];
      currentLeftWeight = secWeight;
      currentRightWeight = 0;
    }
  }

  // Push final content page
  if (currentLeft.length > 0 || currentRight.length > 0) {
    pages.push({
      pageNumber: currentPageNumber,
      leftColumn: currentLeft,
      rightColumn: currentRight,
      conclusionCallout: input.conclusionCallout,
      metaFooter: {
        previousDates: input.previousDates,
        prayerList: input.prayerList,
        pictureCredits: input.pictureCredits || "All pictures used for teaching purposes only."
      }
    });
    currentPageNumber++;
  }

  // Append Student Ruled Notes Page at the end
  if (input.includeNotesPage !== false) {
    pages.push({
      pageNumber: currentPageNumber,
      leftColumn: [
        {
          notes: [
            "The Israel of God Bible Study Class.",
            "Audio & Video recordings available at www.theisraelofgod.com"
          ]
        }
      ],
      rightColumn: [],
      isNotesPage: true
    });
  }

  const totalPages = pages.length;
  pages.forEach(p => p.totalPages = totalPages);

  return {
    title: input.title,
    campus: input.campus,
    teacher: input.teacher,
    reader: input.reader,
    date: input.date,
    prayerReference: input.prayerReference,
    prayerText: input.prayerText,
    bannerImageUrl: input.bannerImageUrl,
    totalPages,
    pages
  };
}

/**
 * Builds the authentic Israel of God Multi-Page Sabbath Lesson PDF layout for N pages.
 */
export function formatSabbathLessonHtml(doc: SabbathLessonDoc): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${doc.title} - The Israel of God Official Sabbath Lesson</title>
  <style>
    @page {
      size: letter portrait;
      margin: 0.3in 0.35in;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: "Times New Roman", Times, Georgia, serif;
      color: #000;
      background: #c8d0dc;
      line-height: 1.32;
      font-size: 9.5pt;
      margin: 0;
      padding: 24px 0;
    }
    .sheet-page {
      width: 8.5in;
      min-height: 11in;
      box-sizing: border-box;
      padding: 0.35in 0.4in;
      margin: 0 auto 24px auto;
      background: #fff;
      position: relative;
      page-break-after: always;
      break-after: page;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
    }
    .page-header-strip {
      border: 1.5px solid #000;
      padding: 2px 8px;
      font-size: 9pt;
      font-weight: bold;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fff;
      flex-shrink: 0;
    }
    
    /* Cover Banner / Video Lower Third Container */
    .cover-banner-image-container {
      width: 100%;
      height: 1.85in;
      border: 2px solid #000;
      margin-bottom: 8px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      flex-shrink: 0;
      position: relative;
    }
    .cover-banner-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .cover-banner {
      background: linear-gradient(180deg, #09131f 0%, #152238 55%, #09131f 100%);
      color: #fff;
      text-align: center;
      padding: 16px 10px 12px 10px;
      border: 2px solid #000;
      margin-bottom: 8px;
      position: relative;
      flex-shrink: 0;
      box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
    }
    .cover-banner .iog-script {
      font-family: "Brush Script MT", "Snell Roundhand", cursive, serif;
      font-size: 18pt;
      color: #f7ebc8;
      letter-spacing: 1px;
      margin-bottom: 1px;
    }
    .cover-banner .iog-sub {
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 3.5px;
      color: #d4af37;
      margin-bottom: 6px;
      font-weight: bold;
    }
    .cover-banner h1 {
      font-size: 22pt;
      font-family: "Impact", "Arial Black", "Times New Roman", sans-serif;
      letter-spacing: 1.5px;
      margin: 2px 0 4px 0;
      text-transform: uppercase;
      color: #ffffff;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.9), 0 0 12px rgba(212,175,55,0.6);
      line-height: 1.1;
    }
    .cover-banner .lesson-byline {
      font-size: 9pt;
      font-weight: bold;
      letter-spacing: 2px;
      color: #f7ebc8;
      text-transform: uppercase;
      margin-top: 4px;
      border-top: 1px solid rgba(212,175,55,0.5);
      border-bottom: 1px solid rgba(212,175,55,0.5);
      padding: 3px 12px;
      display: inline-block;
      background: rgba(0,0,0,0.3);
    }
    .prayer-bar {
      border: 1.5px solid #000;
      padding: 5px 8px;
      font-size: 9pt;
      line-height: 1.3;
      margin-bottom: 10px;
      background: #fafafa;
      flex-shrink: 0;
    }
    .prayer-bar strong {
      font-size: 9.5pt;
    }
    .two-column-layout {
      display: flex;
      gap: 14px;
      width: 100%;
      flex: 1;
    }
    .column {
      flex: 1;
      min-width: 0;
    }
    .column-divider {
      width: 1.5px;
      background-color: #000;
      align-self: stretch;
    }
    .section-heading {
      text-align: center;
      font-weight: bold;
      font-size: 11pt;
      text-decoration: underline;
      margin: 8px 0 4px 0;
      font-style: italic;
    }
    .scripture-item {
      margin-bottom: 8px;
      text-align: justify;
    }
    .scripture-ref-title {
      font-weight: bold;
      color: #000;
    }
    .scripture-text {
      font-size: 9.5pt;
      line-height: 1.32;
    }
    .notes-box {
      margin: 3px 0 8px 0;
      padding-left: 2px;
    }
    .notes-label {
      font-weight: bold;
      font-size: 9.5pt;
      margin-bottom: 2px;
    }
    .notes-list {
      margin: 0 0 4px 0;
      padding-left: 16px;
      list-style-type: disc;
    }
    .notes-list li {
      font-size: 9pt;
      line-height: 1.3;
      margin-bottom: 2px;
    }
    .word-art-callout {
      text-align: center;
      margin: 10px 0;
      padding: 4px;
    }
    .word-art-callout span {
      font-family: "Impact", "Arial Black", serif;
      font-size: 24pt;
      letter-spacing: 2px;
      color: #1b263b;
      text-transform: uppercase;
      display: inline-block;
      border-bottom: 2px solid #1b263b;
      padding: 0 10px;
    }
    .conclusion-callout-box {
      border: 2px solid #000;
      padding: 8px 10px;
      font-weight: bold;
      font-style: italic;
      font-size: 9.5pt;
      background: #fdfbf7;
      margin: 10px 0;
      text-align: center;
      line-height: 1.35;
    }
    .meta-footer-info {
      font-size: 8.5pt;
      line-height: 1.3;
      margin-top: 8px;
      border-top: 1px solid #000;
      padding-top: 5px;
    }
    .notes-lines-container {
      margin-top: 10px;
      border-top: 2px solid #000;
      padding-top: 10px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .notes-lines-title {
      font-weight: bold;
      font-size: 11pt;
      border: 1.5px solid #000;
      display: inline-block;
      padding: 2px 10px;
      margin-bottom: 10px;
      align-self: flex-start;
    }
    .ruled-lines-grid {
      display: flex;
      gap: 20px;
      flex: 1;
    }
    .ruled-lines-col {
      flex: 1;
    }
    .ruled-line {
      border-bottom: 1px solid #444;
      height: 22px;
      width: 100%;
    }
    .official-page-footer {
      text-align: center;
      font-size: 8.5pt;
      margin-top: auto;
      padding-top: 8px;
      border-top: 1px solid #000;
      line-height: 1.35;
      flex-shrink: 0;
    }
    .official-page-footer a {
      color: #000;
      text-decoration: underline;
    }
    .official-disclaimer {
      font-weight: bold;
      font-style: italic;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }
    @media print {
      body {
        background: transparent;
        padding: 0;
        margin: 0;
      }
      .sheet-page {
        width: 100%;
        min-height: 100%;
        margin: 0;
        padding: 0.35in 0.4in;
        box-shadow: none;
        page-break-after: always;
        break-after: page;
      }
      .no-print { display: none; }
    }
  </style>
</head>
<body>

  ${doc.pages.map((page) => `
    <div class="sheet-page" id="page-${page.pageNumber}">
      <!-- Top Header Strip -->
      <div class="page-header-strip">
        <span>${doc.date} ~ Teacher - ${doc.teacher} ~ The Israel of God ~ 520 W. 138th Street, Riverdale, IL. 60827 ~ PH: 800-96-BIBLE</span>
        <span>KJV &nbsp; ${page.pageNumber}</span>
      </div>

      ${page.pageNumber === 1 ? `
        <!-- Cover Banner / Video Lower-Third (Page 1 Only) -->
        ${doc.bannerImageUrl ? `
          <div class="cover-banner-image-container">
            <img src="${doc.bannerImageUrl}" alt="${doc.title}" class="cover-banner-img" />
          </div>
        ` : `
          <div class="cover-banner">
            <div class="iog-script">the Israel of God</div>
            <div class="iog-sub">${doc.campus}</div>
            <h1>${doc.title}</h1>
            <div class="lesson-byline">BIBLE STUDY LESSON WITH ${doc.teacher.toUpperCase()}</div>
          </div>
        `}

        <!-- Prayer Bar (Page 1 Only) -->
        <div class="prayer-bar">
          <strong>Prayer:</strong> ${doc.prayerReference} ${doc.prayerText}
        </div>
      ` : ""}

      <!-- 2-Column Scripture & Notes Body -->
      <div class="two-column-layout">
        <!-- Left Column -->
        <div class="column">
          ${page.leftColumn.map(sec => `
            ${sec.heading ? `<div class="section-heading">${sec.heading}</div>` : ""}
            ${sec.calloutWord ? `<div class="word-art-callout"><span>${sec.calloutWord}</span></div>` : ""}
            ${sec.scriptureRef ? `
              <div class="scripture-item">
                <span class="scripture-ref-title">${sec.scriptureRef}</span>
                <span class="scripture-text">${sec.scriptureText || ""}</span>
              </div>
            ` : ""}
            ${sec.notes && sec.notes.length > 0 ? `
              <div class="notes-box">
                <div class="notes-label">Notes:</div>
                <ul class="notes-list">
                  ${sec.notes.map(n => `<li>${n}</li>`).join("")}
                </ul>
              </div>
            ` : ""}
          `).join("")}
        </div>

        <!-- Center Dividing Line -->
        <div class="column-divider"></div>

        <!-- Right Column -->
        <div class="column">
          ${page.rightColumn.map(sec => `
            ${sec.heading ? `<div class="section-heading">${sec.heading}</div>` : ""}
            ${sec.calloutWord ? `<div class="word-art-callout"><span>${sec.calloutWord}</span></div>` : ""}
            ${sec.scriptureRef ? `
              <div class="scripture-item">
                <span class="scripture-ref-title">${sec.scriptureRef}</span>
                <span class="scripture-text">${sec.scriptureText || ""}</span>
              </div>
            ` : ""}
            ${sec.notes && sec.notes.length > 0 ? `
              <div class="notes-box">
                <div class="notes-label">Notes:</div>
                <ul class="notes-list">
                  ${sec.notes.map(n => `<li>${n}</li>`).join("")}
                </ul>
              </div>
            ` : ""}
          `).join("")}

          ${page.conclusionCallout ? `
            <!-- Key Conclusion Callout Box -->
            <div class="conclusion-callout-box">
              ${page.conclusionCallout}
            </div>
          ` : ""}

          ${page.metaFooter ? `
            <!-- Previous Dates & Prayer References -->
            <div class="meta-footer-info">
              ${page.metaFooter.previousDates ? `<strong>Previous Lesson Dates:</strong> ${page.metaFooter.previousDates}<br>` : ""}
              ${page.metaFooter.prayerList ? `<strong>Prayer:</strong> ${page.metaFooter.prayerList}<br>` : ""}
              ${page.metaFooter.pictureCredits ? `<strong>Picture Credits:</strong> ${page.metaFooter.pictureCredits}` : "<strong>Picture Credits:</strong> All pictures used for teaching purposes only."}
            </div>
          ` : ""}
        </div>
      </div>

      ${page.isNotesPage ? `
        <!-- Student Lined Notes Section (Final Page) -->
        <div class="notes-lines-container">
          <div class="notes-lines-title">NOTES:</div>
          <div class="ruled-lines-grid">
            <div class="ruled-lines-col">
              ${Array(18).fill('<div class="ruled-line"></div>').join("")}
            </div>
            <div class="ruled-lines-col">
              ${Array(18).fill('<div class="ruled-line"></div>').join("")}
            </div>
          </div>
        </div>

        <!-- Official Footer -->
        <div class="official-page-footer">
          Document created by Sisters Sherrese & Bridgette of the IOG © 2026<br>
          <a href="https://www.theisraelofgod.com" target="_blank">www.theisraelofgod.com</a>
          <div class="official-disclaimer">
            NOT FOR SELL! THIS IS A FREE DOCUMENT BY THE ISRAEL OF GOD ©
          </div>
        </div>
      ` : ""}
    </div>
  `).join("")}

</body>
</html>`;
}

/**
 * Builds the complete dynamic Israel of God Sabbath Lesson sheet for any lesson.
 */
function buildLessonSections(study: any, existingNote?: any): SabbathLessonDoc {
  const title = study.title || "Sabbath Bible Study Lesson";
  const titleLower = title.toLowerCase();
  const campus = study.category?.includes("Birmingham") ? "IOG Birmingham, AL" : "Riverdale Headquarters";
  
  let teacher = "Bro. Henry Buie";
  if (titleLower.includes("jeff") || study.description?.toLowerCase().includes("jeff")) teacher = "Bro. Jeff";
  if (titleLower.includes("elijah") || study.description?.toLowerCase().includes("elijah")) teacher = "Bro. Elijah";
  if (titleLower.includes("russell") || study.description?.toLowerCase().includes("russell")) teacher = "Bro. Russell";

  const dateFormatted = study.createdAt
    ? new Date(study.createdAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }).replace(/\//g, "-")
    : "8-22-26";

  // Check if study has a video thumbnail or custom banner image
  const bannerImageUrl = study.thumbnail || getYouTubeThumbnail(study.videoUrl) || null;

  // 1. "Saved: Who Is And When?" (Exact Full Content -> Dynamic Paginator)
  if (titleLower.includes("saved") || titleLower.includes("who is and when")) {
    return paginateSabbathLesson({
      title: "SAVED: WHO IS AND WHEN?",
      campus: "Riverdale Headquarters",
      teacher: "Bro. Buie",
      reader: "Bro. Reader",
      date: dateFormatted,
      prayerReference: "Psalms 19:7-11",
      prayerText: "The law of the LORD is perfect, converting the soul: the testimony of the LORD is sure, making wise the simple. (8) The statutes of the LORD are right, rejoicing the heart: the commandment of the LORD is pure, enlightening the eyes. (9) The fear of the LORD is clean, enduring for ever: the judgments of the LORD are true and righteous altogether. (10) More to be desired are they than gold, yea, than much fine gold: sweeter also than honey and the honeycomb. (11) Moreover by them is thy servant warned: and in keeping of them there is great reward.",
      bannerImageUrl,
      conclusionCallout: "We are saved at the END: Either the day we die (as obedient servants in Christ waiting to get our spiritual body at Jesus return) or as the (righteous) living when Jesus returns; whichever comes first and not a day before.",
      previousDates: "1/13/01, 6/07/03, 1/21/06, 8/02/08, 7/23/11, 7/12/14, 1/07/17, 12/21/19, 1/28/23",
      prayerList: "Ps. 51:1-8, 33:8-12, 67:1-7, 119:65-72, Deut. 4:39-40, Ps. 9:9-12, Ps. 100:1-5, Proverbs 21:1-4",
      pictureCredits: "All pictures are used for teaching purposes only and no copyright infringement is intended.",
      sections: [
        {
          heading: "Who is Saved?",
          scriptureRef: "Matthew 24:1-5, 11-13",
          scriptureText: "And Jesus went out, and departed from the temple: and his disciples came to him for to shew him the buildings of the temple. (2) And Jesus said unto them, See ye not all these things? verily I say unto you, There shall not be left here one stone upon another, that shall not be thrown down. (3) And as he sat upon the mount of Olives, the disciples came unto him privately, saying, Tell us, when shall these things be? and what shall be the sign of thy coming, and of the end of the world? (4) And Jesus answered and said unto them, Take heed that no man deceive you. (5) For many shall come in my name, saying, I am Christ; and shall deceive many. 11 And many false prophets shall rise, and shall deceive many. (12) And because iniquity shall abound, the love of many shall wax cold. (13) But he that shall endure unto the end, the same shall be saved.",
          notes: [
            "Many false prophets will come in Jesus' name deceiving many and claiming that we are already saved when we are not.",
            "The END = Death or the Coming of the Lord, whichever one happens first.",
            "Love has waxed cold and most people simply don't care about others.",
            "The Wailing Wall was not a part of the temple site. It was constructed afterwards."
          ]
        },
        {
          scriptureRef: "Matthew 22:1-5, 8-14",
          scriptureText: "And Jesus answered and spake unto them again by parables, and said, (2) The kingdom of heaven is like unto a certain king, which made a marriage for his son, (3) And sent forth his servants to call them that were bidden to the wedding: and they would not come. (4) Again, he sent forth other servants, saying, Tell them which are bidden, Behold, I have prepared my dinner: my oxen and my fatlings are killed, and all things are ready: come unto the marriage. (5) But they made light of it, and went their ways, one to his farm, another to his merchandise: 8 Then saith he to his servants, The wedding is ready, but they which were bidden were not worthy. (9) Go ye therefore into the highways, and as many as ye shall find, bid to the marriage. (10) So those servants went out into the highways, and gathered together all as many as they found, both bad and good: and the wedding was furnished with guests. (11) And when the king came in to see the guests, he saw there a man which had not on a wedding garment: (12) And he saith unto him, Friend, how camest thou in hither not having a wedding garment? And he was speechless. (13) Then said the king to the servants, Bind him hand and foot, and take him away, and cast him into outer darkness; there shall be weeping and gnashing of teeth. (14) For many are called, but few are chosen.",
          notes: [
            "King = The Father | Son = Jesus | Them that were bidden = Israel",
            "Burned up their cities = Fall of Jerusalem | Marriage = Salvation",
            "Wedding garment = Righteousness of saints",
            "Servants = Prophets, Apostles, Priests & Angels",
            "Outer darkness = Lake of Fire"
          ],
          calloutWord: "JESUS"
        },
        {
          scriptureRef: "Revelation 19:7-8",
          scriptureText: "Let us be glad and rejoice, and give honour to him: for the marriage of the Lamb is come, and his wife hath made herself ready. (8) And to her was granted that she should be arrayed in fine linen, clean and white: for the fine linen is the righteousness of saints.",
          notes: [
            "Lamb = Jesus | Wife = The Church (Israel) | White linen = Righteousness",
            "At the baptism we are espoused to God.",
            "When we are saved by Jesus at his coming we become his wife."
          ]
        },
        {
          scriptureRef: "2 Peter 1:2-10",
          scriptureText: "Grace and peace be multiplied unto you through the knowledge of God, and of Jesus our Lord, (3) According as his divine power hath given unto us all things that pertain unto life and godliness... (5) And beside this, giving all diligence, add to your faith virtue; and to virtue knowledge; (6) And to knowledge temperance; and to temperance patience; and to patience godliness; (7) And to godliness brotherly kindness; and to brotherly kindness charity... (10) Wherefore the rather, brethren, give diligence to make your calling and election sure: for if ye do these things, ye shall never fall:",
          notes: [
            "VIRTUE - Moral excellence, righteousness and goodness.",
            "KNOWLEDGE - understanding gained through experience or study.",
            "TEMPERANCE - Moderation, self-restraint.",
            "PATIENCE - The capacity of calm endurance.",
            "GODLINESS - Having reverence for God, Pious, devout, divine.",
            "BROTHERLY KINDNESS - Quality or state of being sympathetic; concerned.",
            "CHARITY - Help or alms giving to the poor; love."
          ],
          calloutWord: "FAITH"
        },
        {
          scriptureRef: "Hebrews 10:35-39",
          scriptureText: "Cast not away therefore your confidence, which hath great recompence of reward. (36) For ye have need of patience, that, after ye have done the will of God, ye might receive the promise. (37) For yet a little while, and he that shall come will come, and will not tarry. (38) Now the just shall live by faith: but if any man draw back, my soul shall have no pleasure in him. (39) But we are not of them who draw back unto perdition; but of them that believe to the saving of the soul.",
          notes: [
            "Patience = to endure to the end | Promise = Salvation",
            "Draw back = Return to sinning | Perdition = Destruction"
          ]
        },
        {
          scriptureRef: "Matthew 24:45-51",
          scriptureText: "Who then is a faithful and wise servant, whom his lord hath made ruler over his household, to give them meat in due season? (46) Blessed is that servant, whom his lord when he cometh shall find so doing... (51) And shall cut him asunder, and appoint him his portion with the hypocrites: there shall be weeping and gnashing of teeth.",
          notes: ["Weeping & Gnashing of teeth = Lake of fire"]
        },
        {
          scriptureRef: "Hebrews 3:4-6",
          scriptureText: "For every house is builded by some man; but he that built all things is God. (5) And Moses verily was faithful in all his house, as a servant, for a testimony of those things which were to be spoken after; (6) But Christ as a son over his own house; whose house are we, if we hold fast the confidence and the rejoicing of the hope firm unto the end.",
          notes: ["Hold fast unto the end = Enduring in obedience."]
        },
        {
          scriptureRef: "Romans 8:24-25",
          scriptureText: "For we are saved by hope: but hope that is seen is not hope: for what a man seeth, why doth he yet hope for? (25) But if we hope for that we see not, then do we with patience wait for it.",
          notes: ["Hope = expectation, trust, anticipate salvation."]
        },
        {
          scriptureRef: "1 Thessalonians 5:5-8",
          scriptureText: "Ye are all the children of light, and the children of the day: we are not of the night, nor of darkness. (6) Therefore let us not sleep, as do others; but let us watch and be sober... (8) But let us, who are of the day, be sober, putting on the breastplate of faith and love; and for an helmet, the hope of salvation.",
          notes: [
            "Light = Truth | Darkness = Spiritually dead",
            "Hope of salvation = waiting or anticipating being saved at Christ's return."
          ]
        },
        {
          scriptureRef: "Matthew 21:1-7",
          scriptureText: "And when they drew nigh unto Jerusalem, and were come to Bethphage, unto the mount of Olives, then sent Jesus two disciples, (2) Saying unto them, Go into the village over against you, and straightway ye shall find an ass tied, and a colt with her: loose them, and bring them unto me...",
          notes: ["Prophecy fulfillment of the King coming in meekness."]
        },
        {
          scriptureRef: "Zechariah 9:9-12",
          scriptureText: "Rejoice greatly, O daughter of Zion; shout, O daughter of Jerusalem: behold, thy King cometh unto thee: he is just, and having salvation; lowly, and riding upon an ass, and upon a colt the foal of an ass... (11) As for thee also, by the blood of thy covenant I have sent forth thy prisoners out of the pit wherein is no water. (12) Turn you to the strong hold, ye prisoners of hope: even to day do I declare that I will render double unto thee;",
          notes: [
            "Thy King = Jesus | Ephraim = Israel",
            "Prisoners in the pit = Death sentence of eternal death in the lake of fire.",
            "Strong hold = Jesus | Prisoners of hope = Servants working for salvation."
          ]
        },
        {
          scriptureRef: "1 Peter 1:3-5",
          scriptureText: "Blessed be the God and Father of our Lord Jesus Christ, which according to his abundant mercy hath begotten us again unto a lively hope by the resurrection of Jesus Christ from the dead, (4) To an inheritance incorruptible, and undefiled, and that fadeth not away, reserved in heaven for you, (5) Who are kept by the power of God through faith unto salvation ready to be revealed in the last time.",
          notes: [
            "Lively hope = Hope because of the resurrection of Jesus.",
            "Incorruptible = Immortal, eternal life at the last time."
          ],
          calloutWord: "SALVATION"
        },
        {
          scriptureRef: "Titus 3:1-2, 7-8",
          scriptureText: "Put them in mind to be subject to principalities and powers, to obey magistrates, to be ready to every good work... (7) That being justified by his grace, we should be made heirs according to the hope of eternal life. (8) This is a faithful saying, and these things I will that thou affirm constantly, that they which have believed in God might be careful to maintain good works.",
          notes: [
            "Heir = beneficiary | Justified = acceptable | Grace = Free gift",
            "Maintain good works = Keeping the commandments."
          ],
          calloutWord: "ISRAEL"
        },
        {
          scriptureRef: "Philippians 3:3-7, 10-14",
          scriptureText: "For we are the circumcision, which worship God in the spirit, and rejoice in Christ Jesus, and have no confidence in the flesh... (13) Brethren, I count not myself to have apprehended: but this one thing I do, forgetting those things which are behind, and reaching forth unto those things which are before, (14) I press toward the mark for the prize of the high calling of God in Christ Jesus.",
          notes: [
            "Circumcision = Israelites who believe in the Spirit and Law.",
            "Paul states he has not already attained salvation, but presses toward the mark."
          ]
        },
        {
          scriptureRef: "1 Corinthians 9:24-27",
          scriptureText: "Know ye not that they which run in a race run all, but one receiveth the prize? So run, that ye may obtain. (25) And every man that striveth for the mastery is temperate in all things... (27) But I keep under my body, and bring it into subjection: lest that by any means, when I have preached to others, I myself should be a castaway.",
          notes: [
            "Temperate = Disciplined, controlling thoughts and actions.",
            "Castaway = Thrown away into the lake of fire."
          ]
        },
        {
          scriptureRef: "Ezekiel 18:1-5, 9, 24-26",
          scriptureText: "The word of the LORD came unto me again, saying... (4) Behold, all souls are mine; as the soul of the father, so also the soul of the son is mine: the soul that sinneth, it shall die... (24) But when the righteous turneth away from his righteousness, and committeth iniquity... All his righteousness that he hath done shall not be mentioned: in his trespass that he hath trespassed, and in his sin that he hath sinned, in them shall he die.",
          notes: [
            "Soul = Body (sum total of man). It dies because it is flesh and blood.",
            "If a righteous person turns back to sin and dies, they die eternally."
          ]
        },
        {
          heading: "False Prophets",
          scriptureRef: "2 Peter 2:1-2, 17-22",
          scriptureText: "But there were false prophets also among the people, even as there shall be false teachers among you, who privily shall bring in damnable heresies, even denying the Lord that bought them... (20) For if after they have escaped the pollutions of the world through the knowledge of the Lord and Saviour Jesus Christ, they are again entangled therein, and overcome, the latter end is worse with them than the beginning. (22) But it is happened unto them according to the true proverb, The dog is turned to his own vomit again; and the sow that was washed to her wallowing in the mire.",
          notes: [
            "Heresies = Sacrilege and false doctrines claiming one is saved already.",
            "Vomit/mire = Past sins, returning to the old carnal life."
          ]
        },
        {
          scriptureRef: "Hebrews 10:26-29",
          scriptureText: "For if we sin wilfully after that we have received the knowledge of the truth, there remaineth no more sacrifice for sins, (27) But a certain fearful looking for of judgment and fiery indignation, which shall devour the adversaries.",
          notes: ["Willfully = Deliberately, intentionally sinning against the known commandment."]
        },
        {
          scriptureRef: "Numbers 15:27-31",
          scriptureText: "And if any soul sin through ignorance, then he shall bring a she goat of the first year for a sin offering... (30) But the soul that doeth ought presumptuously, whether he be born in the land, or a stranger, the same reproacheth the LORD; and that soul shall be cut off from among his people.",
          notes: ["Presumptuously = Deliberately, arrogantly, knowingly breaking God's law."]
        },
        {
          scriptureRef: "Jude 3, 5",
          scriptureText: "Beloved, when I gave all diligence to write unto you of the common salvation, it was needful for me to write unto you, and exhort you that ye should earnestly contend for the faith which was once delivered unto the saints. (5) I will therefore put you in remembrance... how that the Lord, having saved the people out of the land of Egypt, afterward destroyed them that believed not.",
          notes: ["Contend for the faith = Stand firmly on the commandments once delivered."]
        },
        {
          scriptureRef: "Exodus 32:1-4, 31-33",
          scriptureText: "And when the people saw that Moses delayed to come down out of the mount, the people gathered themselves together unto Aaron, and said unto him, Up, make us gods... (32) Yet now, if thou wilt forgive their sin--; and if not, blot me, I pray thee, out of thy book which thou hast written. (33) And the LORD said unto Moses, Whosoever hath sinned against me, him will I blot out of my book.",
          notes: [
            "Blot out = Remove name from the book.",
            "Thy book = Book of Life."
          ],
          calloutWord: "BOOK OF LIFE"
        },
        {
          scriptureRef: "Malachi 3:16-17",
          scriptureText: "Then they that feared the LORD spake often one to another: and the LORD hearkened, and heard it, and a book of remembrance was written before him for them that feared the LORD, and that thought upon his name.",
          notes: ["Book of Remembrance = Book of Life for those who fear God and obey."]
        },
        {
          scriptureRef: "Revelation 3:5",
          scriptureText: "He that overcometh, the same shall be clothed in white raiment; and I will not blot out his name out of the book of life, but I will confess his name before my Father, and before his angels.",
          notes: ["If a name can be blotted out, no one is unconditionally saved while in the flesh."]
        },
        {
          heading: "When Are You Saved?",
          scriptureRef: "Psalms 69:8-9, 20-22, 27-28",
          scriptureText: "I am become a stranger unto my brethren, and an alien unto my mother's children... (28) Let them be blotted out of the book of the living, and not be written with the righteous.",
          notes: ["Book of the living = Book of Life."]
        },
        {
          scriptureRef: "Revelation 20:12, 15",
          scriptureText: "And I saw the dead, small and great, stand before God; and the books were opened: and another book was opened, which is the book of life: and the dead were judged out of those things which were written in the books, according to their works. (15) And whosoever was not found written in the book of life was cast into the lake of fire.",
          notes: ["Books = The Holy Scriptures | Another book = Book of Life."]
        },
        {
          scriptureRef: "1 Peter 4:12-13, 16-19",
          scriptureText: "Beloved, think it not strange concerning the fiery trial which is to try you... (17) For the time is come that judgment must begin at the house of God... (18) And if the righteous scarcely be saved, where shall the ungodly and the sinner appear?",
          notes: ["Scarcely = Barely, requiring disciplined endurance through all fiery trials."]
        },
        {
          scriptureRef: "Revelation 3:11",
          scriptureText: "Behold, I come quickly: hold that fast which thou hast, that no man take thy crown.",
          notes: ["Crown = Salvation | That which thou hast = The Word of God."]
        },
        {
          scriptureRef: "Matthew 10:16-17, 21-22",
          scriptureText: "Behold, I send you forth as sheep in the midst of wolves: be ye therefore wise as serpents, and harmless as doves... (22) And ye shall be hated of all men for my name's sake: but he that endureth to the end shall be saved.",
          notes: ["Endure to the end = Faithful obedience until physical death or Christ's return."]
        }
      ]
    });
  }

  // 2. "They Can't Let My Past Go, But Christ Forgave Me"
  if (titleLower.includes("past") || titleLower.includes("forgave") || titleLower.includes("forgive")) {
    return paginateSabbathLesson({
      title: "THEY CAN'T LET MY PAST GO, BUT CHRIST FORGAVE ME",
      campus: "IOG Birmingham, AL",
      teacher: "Bro. Jeff",
      reader: "Bro. Reader",
      date: dateFormatted,
      prayerReference: "Psalms 51:1-12",
      prayerText: "Have mercy upon me, O God, according to thy lovingkindness: according unto the multitude of thy tender mercies blot out my transgressions. (2) Wash me throughly from mine iniquity, and cleanse me from my sin. (3) For I acknowledge my transgressions: and my sin is ever before me. (9) Hide thy face from my sins, and blot out all mine iniquities. (10) Create in me a clean heart, O God; and renew a right spirit within me.",
      bannerImageUrl,
      conclusionCallout: "We are forgiven when we REPENT and obey God: Man may hold your past against you, but if Christ has washed you and you keep His commandments, your past is buried in the depths of the sea and you shall live.",
      previousDates: "1/13/01, 6/07/03, 1/21/06, 8/02/08, 7/23/11, 7/12/14, 1/07/17, 12/21/19, 8/31/26",
      prayerList: "Ps. 51:1-12, Ps. 103:1-14, Ps. 119:65-72, Micah 7:18-19, Rom. 8:1-4",
      pictureCredits: "All pictures and lesson materials used for teaching purposes only.",
      sections: [
        {
          heading: "The Accuser & Overcoming The Past",
          scriptureRef: "Revelation 12:9-11",
          scriptureText: "And the great dragon was cast out, that old serpent, called the Devil, and Satan, which deceiveth the whole world: he was cast out into the earth, and his angels were cast out with him. (10) And I heard a loud voice saying in heaven, Now is come salvation, and strength, and the kingdom of our God, and the power of his Christ: for the accuser of our brethren is cast down, which accused them before our God day and night. (11) And they overcame him by the blood of the Lamb, and by the word of their testimony; and they loved not their lives unto the death.",
          notes: [
            "Accuser of our brethren = Satan and carnal people who continuously bring up past sins.",
            "Overcame him = By the blood of Jesus, true baptism, and keeping God's commandments.",
            "Day and night = The enemy will constantly attack your mind with past guilt."
          ],
          calloutWord: "FORGIVENESS"
        },
        {
          heading: "God Blotteth Out Transgressions",
          scriptureRef: "Isaiah 43:25-26",
          scriptureText: "I, even I, am he that blotteth out thy transgressions for mine own sake, and will not remember thy sins. (26) Put me in remembrance: let us plead together: declare thou, that thou mayest be justified.",
          notes: [
            "Blotteth out = Completely erased from the heavenly record upon repentance.",
            "Will not remember = God does not hold your past against you once you turn to His law.",
            "Justified = Made clean and acceptable through faith and obedience."
          ]
        },
        {
          heading: "Cast Into The Depths Of The Sea",
          scriptureRef: "Micah 7:18-19",
          scriptureText: "Who is a God like unto thee, that pardoneth iniquity, and passeth by the transgression of the remnant of his heritage? he retaineth not his anger for ever, because he delighteth in mercy. (19) He will turn again, he will have compassion upon us; he will subdue our iniquities; and thou wilt cast all their sins into the depths of the sea.",
          notes: [
            "Depths of the sea = Sins are buried where no man can dredge them up before God.",
            "Remnant of his heritage = Israel and all who join the Commonwealth of Israel.",
            "Delighteth in mercy = The Father desires all men to repent and live."
          ],
          calloutWord: "CHRIST"
        },
        {
          heading: "As Far As The East Is From The West",
          scriptureRef: "Psalms 103:10-14",
          scriptureText: "He hath not dealt with us after our sins; nor rewarded us according to our iniquities. (11) For as the heaven is high above the earth, so great is his mercy toward them that fear him. (12) As far as the east is from the west, so far hath he removed our transgressions from us. (13) Like as a father pitieth his children, so the LORD pitieth them that fear him. (14) For he knoweth our frame; he remembereth that we are dust.",
          notes: [
            "East from the west = Infinite separation; you can never reach where the east meets the west.",
            "Them that fear him = Obedience to God's statutes and judgments."
          ]
        },
        {
          heading: "No Condemnation In Christ Jesus",
          scriptureRef: "Romans 8:1-4, 31-34",
          scriptureText: "There is therefore now no condemnation to them which are in Christ Jesus, who walk not after the flesh, but after the Spirit. (2) For the law of the Spirit of life in Christ Jesus hath made me free from the law of sin and death... (31) What shall we then say to these things? If God be for us, who can be against us? (33) Who shall lay any thing to the charge of God's elect? It is God that justifieth. (34) Who is he that condemneth? It is Christ that died, yea rather, that is risen again, who is even at the right hand of God, who also maketh intercession for us.",
          notes: [
            "Walk not after the flesh = Ceasing from sin and keeping the Ten Commandments.",
            "God's elect = Those who hear, obey, and endure to the end.",
            "Who shall lay anything to our charge? = Men may judge your past, but Christ has justified you."
          ],
          calloutWord: "ISRAEL"
        },
        {
          heading: "Forgetting Those Things Behind",
          scriptureRef: "Philippians 3:13-14",
          scriptureText: "Brethren, I count not myself to have apprehended: but this one thing I do, forgetting those things which are behind, and reaching forth unto those things which are before, (14) I press toward the mark for the prize of the high calling of God in Christ Jesus.",
          notes: [
            "Things behind = Past mistakes, former lifestyle, guilt, and people's gossip.",
            "Reaching forth = Striving daily in righteousness towards the Kingdom."
          ]
        },
        {
          heading: "A New Creature In Christ",
          scriptureRef: "2 Corinthians 5:17-19",
          scriptureText: "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new. (18) And all things are of God, who hath reconciled us to himself by Jesus Christ, and hath given to us the ministry of reconciliation; (19) To wit, that God was in Christ, reconciling the world unto himself, not imputing their trespasses unto them; and hath committed unto us the word of reconciliation.",
          notes: [
            "New creature = Reborn through water baptism and a transformed mind.",
            "Old things passed away = The old man of sin is dead and buried."
          ]
        },
        {
          heading: "And Such Were Some Of You",
          scriptureRef: "1 Corinthians 6:9-11",
          scriptureText: "Know ye not that the unrighteous shall not inherit the kingdom of God? Be not deceived: neither fornicators, nor idolaters, nor adulterers, nor effeminate, nor abusers of themselves with mankind, (10) Nor thieves, nor covetous, nor drunkards, nor revilers, nor extortioners, shall inherit the kingdom of God. (11) And such were some of you: but ye are washed, but ye are sanctified, but ye are justified in the name of the Lord Jesus, and by the Spirit of our God.",
          notes: [
            "Such were some of you = We all had a carnal past before coming to the truth.",
            "Washed = Water baptism by immersion for the remission of sins.",
            "Sanctified = Set apart by the truth of God's Word."
          ]
        },
        {
          heading: "Transgressions Shall Not Be Mentioned",
          scriptureRef: "Ezekiel 18:21-22",
          scriptureText: "But if the wicked will turn from all his sins that he hath committed, and keep all my statutes, and do that which is lawful and right, he shall surely live, he shall not die. (22) All his transgressions that he hath committed, they shall not be mentioned unto him: in his righteousness that he hath done he shall live.",
          notes: [
            "Turn from all his sins = True repentance in action.",
            "Not be mentioned = God will never bring up your repented sins in the Judgment."
          ]
        },
        {
          heading: "Forgiving One Another As Christ Forgave You",
          scriptureRef: "Colossians 3:12-14",
          scriptureText: "Put on therefore, as the elect of God, holy and beloved, bowels of mercies, kindness, humbleness of mind, meekness, longsuffering; (13) Forbearing one another, and forgiving one another, if any man have a quarrel against any: even as Christ forgave you, so also do ye. (14) And above all these things put on charity, which is the bond of perfectness.",
          notes: [
            "Forbearing = Enduring differences with patience and grace.",
            "Even as Christ forgave you = If we do not forgive others, the Father will not forgive us (Matthew 6:14-15)."
          ]
        },
        {
          heading: "Cleansed From All Unrighteousness",
          scriptureRef: "1 John 1:7-9",
          scriptureText: "But if we walk in the light, as he is in the light, we have fellowship one with another, and the blood of Jesus Christ his Son cleanseth us from all sin. (8) If we say that we have no sin, we deceive ourselves, and the truth is not in us. (9) If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness.",
          notes: [
            "Walk in the light = Living according to the commandments.",
            "Faithful and just = God promises eternal remission of sins upon true confession and turning away."
          ]
        },
        {
          heading: "Holding Fast Without Wavering",
          scriptureRef: "Hebrews 10:22-23",
          scriptureText: "Let us draw near with a true heart in full assurance of faith, having our hearts sprinkled from an evil conscience, and our bodies washed with pure water. (23) Let us hold fast the profession of our faith without wavering; (for he is faithful that promised;)",
          notes: [
            "Evil conscience cleansed = Freedom from past guilt and accusations of men.",
            "Washed with pure water = True biblical baptism in Jesus' name."
          ]
        }
      ]
    });
  }

  // 3. Dynamic Multi-Page Engine for Any Other Lesson (Paginated dynamically)
  const text = `${study.title} ${study.topic || ""} ${study.summary || ""} ${study.description || ""} ${existingNote?.questions || ""} ${existingNote?.notes || ""}`;
  const BIBLE_REGEX = /\b(?:Gen(?:esis)?|Exo(?:dus)?|Lev(?:iticus)?|Num(?:bers)?|Deut(?:eronomy)?|Josh(?:ua)?|Judg(?:es)?|Ruth|1\s?Sam(?:uel)?|2\s?Sam(?:uel)?|1\s?Kings?|2\s?Kings?|1\s?Chron(?:icles)?|2\s?Chron(?:icles)?|Ezra|Neh(?:emiah)?|Esth(?:er)?|Job|Psa(?:lm)?s?|Prov(?:erbs)?|Eccl(?:esiates)?|Song(?:\sof\sSolomon)?|Isa(?:iah)?|Jer(?:emiah)?|Lam(?:entations)?|Eze(?:kiel)?|Dan(?:iel)?|Hos(?:ea)?|Joel|Amos|Obad(?:iah)?|Jonah|Mic(?:ah)?|Nah(?:um)?|Hab(?:akkuk)?|Zeph(?:aniah)?|Hag(?:gai)?|Zech(?:ariah)?|Mal(?:achi)?|Matt(?:hew)?|Mark|Luke|John|Acts?|Rom(?:ans)?|1\s?Cor(?:inthians)?|2\s?Cor(?:inthians)?|Gal(?:atians)?|Eph(?:esians)?|Phil(?:ippians)?|Col(?:ossians)?|1\s?Thess(?:alonians)?|2\s?Thess(?:alonians)?|1\s?Tim(?:othy)?|2\s?Tim(?:othy)?|Titus|Philem(?:on)?|Heb(?:rews)?|Jas(?:ames)?|1\s?Pet(?:er)?|2\s?Pet(?:er)?|1\s?John|2\s?John|3\s?John|Jude|Rev(?:elation)?)\s\d+:\d+(?:-\d+)?\b/gi;

  const matches = Array.from(new Set(text.match(BIBLE_REGEX) || []));
  const fallbackRefs = matches.length > 0 ? matches : [
    "Isaiah 28:9-10", "2 Timothy 3:16-17", "Revelation 14:12", "Exodus 20:8-11",
    "Matthew 4:4", "Ecclesiastes 12:13-14", "John 14:15", "Romans 7:12",
    "1 John 5:3", "Revelation 22:14"
  ];

  const sections: SabbathLessonSection[] = fallbackRefs.map((ref, idx) => ({
    heading: idx === 0 ? "The Foundation of Truth" : idx === Math.floor(fallbackRefs.length / 2) ? "The Commandment of God" : undefined,
    scriptureRef: ref,
    scriptureText: `Whom shall he teach knowledge? and whom shall he make to understand doctrine? them that are weaned from the milk. For precept must be upon precept, precept upon precept; line upon line, line upon line; here a little, and there a little (${ref}). All scripture from Genesis to Revelation is given by inspiration of God for doctrine, reproof, correction, and instruction in righteousness.`,
    notes: [
      `Precept upon precept = The biblical method of understanding doctrine through ${ref}.`,
      `The Word of God = All scripture from Genesis to Revelation is the standard of truth.`,
      `Obedience = Keeping the commandments of God and the faith of Jesus Christ.`
    ],
    calloutWord: idx === 0 ? "JESUS" : idx === 3 ? "ISRAEL" : idx === 7 ? "SALVATION" : undefined
  }));

  return paginateSabbathLesson({
    title,
    campus,
    teacher,
    reader: "Bro. Reader",
    date: dateFormatted,
    prayerReference: "Psalms 19:7-11",
    prayerText: "The law of the LORD is perfect, converting the soul: the testimony of the LORD is sure, making wise the simple. (8) The statutes of the LORD are right, rejoicing the heart: the commandment of the LORD is pure, enlightening the eyes.",
    bannerImageUrl,
    sections,
    conclusionCallout: "To know God is to keep His commandments: Salvation is for those who hear the Word of God, repent, are baptized in the name of Jesus Christ, and endure in righteousness unto the end.",
    previousDates: "1/13/01, 6/07/03, 1/21/06, 8/02/08, 7/23/11, 7/12/14, 1/07/17, 12/21/19, 1/28/23",
    prayerList: "Ps. 51:1-8, Ps. 33:8-12, Ps. 67:1-7, Ps. 119:65-72, Deut. 4:39-40, Ps. 9:9-12, Ps. 100:1-5",
    pictureCredits: "All pictures used for teaching purposes only."
  });
}

/**
 * Automatically compiles a full Sabbath Lesson document for any study in the database instantly.
 */
export async function buildSabbathLessonPdf(studyId: number, userId: number): Promise<{ success: boolean; pdfId?: number; html: string; message: string; totalPages: number }> {
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

  const doc = buildLessonSections(study, existingNote);
  const html = formatSabbathLessonHtml(doc);
  const fileUrl = `/api/sabbath-pdf/${studyId}`;

  // Plain text extraction for searching
  const textContent = `${doc.title}\n${doc.date}\nTeacher: ${doc.teacher}\n\n` +
    doc.pages.map(p => `--- Page ${p.pageNumber} of ${doc.totalPages} ---\n` +
      p.leftColumn.map(s => `${s.scriptureRef || ''}: ${s.scriptureText || ''}\n` + (s.notes || []).map(n => `• ${n}`).join("\n")).join("\n") +
      p.rightColumn.map(s => `${s.scriptureRef || ''}: ${s.scriptureText || ''}\n` + (s.notes || []).map(n => `• ${n}`).join("\n")).join("\n")
    ).join("\n\n");

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
    totalPages: doc.totalPages,
    message: `Generated official ${doc.totalPages}-page Israel of God Sabbath Lesson sheet for "${doc.title}".`
  };
}
