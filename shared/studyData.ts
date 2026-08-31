import studyDataJson from "./study_data.json";

export type StudyNotes = {
  questions?: string[];
  notes?: string[];
  summary?: string;
};

export type StudyItem = {
  id?: string;
  title: string;
  video: string;
  topic: string;
  notes?: StudyNotes;
  summary?: string;
  scriptures?: string[];
  pdf?: string;
  keywords?: string[];
  date_added?: string; // ISO date
  category?: string;
  folderId?: string;
};

const rawData = studyDataJson as StudyItem[];

const googleDriveLinks = [
  "https://drive.google.com/drive/folders/1fAfVUJqWDpF2cHTsgmNfqNWRO9O8fFeO?usp=drive_link",
  "https://drive.google.com/drive/folders/1M-YZNiNXQfhPRW3S8wsLTBd9mZqlP6OZ?usp=drive_link",
  "https://drive.google.com/drive/folders/1cFAzOySz1No5quzHyljPU5GHr8yTkI1J?usp=drive_link",
  "https://drive.google.com/drive/folders/1pBJLxBlCDNXYkojuDOkdMIhYlM_Wq7pX?usp=drive_link",
  "https://drive.google.com/drive/folders/1rfp_wJCkLWC-cKGZ6eZel-2Uyfvw8JiY?usp=drive_link",
  "https://drive.google.com/drive/folders/1RkRSI_mUWmvk8_WXo3eRYqfJTbmVY7ns?usp=drive_link",
  "https://drive.google.com/drive/folders/1ayMHGGNqEa7gZdhpPEMoKI5KvcrwQmAQ?usp=drive_link",
  "https://drive.google.com/drive/folders/1Zs8ZQZDJWBUYN1m6bsfsazfs63ij1Oiw?usp=drive_link",
  "https://drive.google.com/drive/folders/1XmLozIOVl7UcaXlLLwC9N7CJR0HegKwk?usp=drive_link",
  "https://drive.google.com/drive/folders/1XBSaK79BZo7NvzWP7n-kt6wPC8ma2zGf?usp=drive_link",
  "https://drive.google.com/drive/folders/19qfAI8oSMUZ3HEWFbjTYO6oNHdDaSU6O?usp=drive_link",
  "https://drive.google.com/drive/folders/1T9il_mcrkMfNDqIccvEsr7KxM9eqFY7Y?usp=drive_link",
  "https://drive.google.com/drive/folders/1fSwHDgWWyjZ0R1K5ZUrTJM95LNfGG_c-?usp=drive_link"
];

export const STUDY_PACKS: Record<string, StudyItem[]> = {
  "1fAfVUJqWDpF2cHTsgmNfqNWRO9O8fFeO": [
    { title: "Easter: A Pagan Festival", topic: "Doctrine", video: "https://docs.google.com/viewer?url=https://theisraelofgod.com/wp-content/uploads/2021/04/Easter.pdf&embedded=true", category: "Text Lesson" },
    { title: "The Passover", topic: "Feast Days", video: "https://docs.google.com/viewer?url=https://theisraelofgod.com/wp-content/uploads/2021/04/Passover.pdf&embedded=true", category: "Text Lesson" },
    { title: "Unleavened Bread", topic: "Feast Days", video: "https://docs.google.com/viewer?url=https://theisraelofgod.com/wp-content/uploads/2021/04/Unleavened-Bread.pdf&embedded=true", category: "Text Lesson" },
  ],
  "1rfp_wJCkLWC-cKGZ6eZel-2Uyfvw8JiY": [
    { title: "The Law of God", topic: "Law", video: "https://docs.google.com/viewer?url=https://theisraelofgod.com/wp-content/uploads/2021/04/Law.pdf&embedded=true", category: "Text Lesson" },
    { title: "The Sabbath Day", topic: "Feast Days", video: "https://docs.google.com/viewer?url=https://theisraelofgod.com/wp-content/uploads/2021/04/Sabbath.pdf&embedded=true", category: "Text Lesson" },
  ]
};

export function getAllStudyItems(): StudyItem[] {
  const driveItems = googleDriveLinks.map((link, idx) => {
    const folderId = link.split('/folders/')[1]?.split('?')[0];
    return {
      id: `folder-${idx}`,
      title: idx === 0 ? "IOG Text Lessons 2026" : idx === 1 ? "IOG Text Lessons 2025" : `Study Resources Folder ${idx + 1}`,
      video: link,
      topic: "Shared Drive Folder",
      category: "External Resources",
      folderId: folderId,
    };
  });
  return [...driveItems, ...rawData];
}

export function getYouTubeThumbnailUrl(videoUrl: string): string | null {
  try {
    let v: string | null = null;
    if (videoUrl.includes("youtu.be/")) {
      v = videoUrl.split("youtu.be/")[1]?.split(/[?#]/)[0];
    } else {
      const url = new URL(videoUrl);
      v = url.searchParams.get("v");
    }
    
    if (!v) return null;
    // Using mqdefault as it is more consistently available than hqdefault
    return `https://i.ytimg.com/vi/${v}/mqdefault.jpg`;
  } catch {
    return null;
  }
}
