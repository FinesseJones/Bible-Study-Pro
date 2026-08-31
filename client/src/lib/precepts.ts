/**
 * precepts.ts
 * 
 * Precept-upon-Precept companion cross-reference engine for the King James Version (KJV).
 * Maps core theological scriptures to their foundational Old and New Testament proof texts.
 */

export interface PreceptMapping {
  topic: string;
  primaryScripture: string;
  precepts: {
    reference: string;
    description: string;
  }[];
}

export const PRECEPT_DATABASE: PreceptMapping[] = [
  {
    topic: "The Creation & The Godhead",
    primaryScripture: "Genesis 1:1",
    precepts: [
      { reference: "John 1:1-3", description: "In the beginning was the Word, and all things were made by him." },
      { reference: "Colossians 1:16-17", description: "For by him were all things created, that are in heaven, and that are in earth." },
      { reference: "Hebrews 1:1-2", description: "By whom also he made the worlds." },
      { reference: "Ephesians 3:9", description: "God, who created all things by Jesus Christ." }
    ]
  },
  {
    topic: "The Sabbath Day & Creation Covenant",
    primaryScripture: "Genesis 2:1-3",
    precepts: [
      { reference: "Exodus 20:8-11", description: "Remember the sabbath day, to keep it holy. Six days shalt thou labour." },
      { reference: "Isaiah 58:13-14", description: "If thou turn away thy foot from the sabbath, from doing thy pleasure on my holy day." },
      { reference: "Mark 2:27-28", description: "The sabbath was made for man, and not man for the sabbath: Therefore the Son of man is Lord also of the sabbath." },
      { reference: "Hebrews 4:4-11", description: "There remaineth therefore a rest (sabbatismos) to the people of God." },
      { reference: "Revelation 14:12", description: "Here is the patience of the saints: here are they that keep the commandments of God, and the faith of Jesus." }
    ]
  },
  {
    topic: "Spirit of Wisdom & Knowledge",
    primaryScripture: "Proverbs 9:10",
    precepts: [
      { reference: "Psalm 111:10", description: "The fear of the LORD is the beginning of wisdom: a good understanding have all they that do his commandments." },
      { reference: "Exodus 28:3", description: "Whom I have filled with the spirit of wisdom." },
      { reference: "Exodus 31:3", description: "And I have filled him with the spirit of God, in wisdom, and in understanding." },
      { reference: "Isaiah 11:2", description: "And the spirit of the LORD shall rest upon him, the spirit of wisdom and understanding." },
      { reference: "Ephesians 1:17", description: "May give unto you the spirit of wisdom and revelation in the knowledge of him." },
      { reference: "James 3:17", description: "The wisdom that is from above is first pure, then peaceable, gentle." }
    ]
  },
  {
    topic: "Dietary Law & Sanctification",
    primaryScripture: "Leviticus 11:1-8",
    precepts: [
      { reference: "Deuteronomy 14:3-8", description: "Thou shalt not eat any abominable thing." },
      { reference: "Isaiah 66:15-17", description: "Eating swine's flesh, and the abomination, and the mouse, shall be consumed together, saith the LORD." },
      { reference: "Acts 10:14", description: "Not so, Lord; for I have never eaten any thing that is common or unclean." },
      { reference: "2 Corinthians 6:17", description: "Touch not the unclean thing; and I will receive you." }
    ]
  },
  {
    topic: "The Holy Feasts of the LORD",
    primaryScripture: "Leviticus 23:1-4",
    precepts: [
      { reference: "Numbers 28:16-25", description: "And in the fourteenth day of the first month is the passover of the LORD." },
      { reference: "1 Corinthians 5:7-8", description: "For even Christ our passover is sacrificed for us: Therefore let us keep the feast." },
      { reference: "Zechariah 14:16-19", description: "Every one that is left of all the nations... shall even go up from year to year to keep the feast of tabernacles." },
      { reference: "Colossians 2:16-17", description: "Which are a shadow of things to come; but the body is of Christ." }
    ]
  },
  {
    topic: "The 70 Weeks & Prophetic Timeline",
    primaryScripture: "Daniel 9:24-27",
    precepts: [
      { reference: "Ezra 7:11-26", description: "Decree of Artaxerxes to restore and build Jerusalem." },
      { reference: "Matthew 24:15", description: "When ye therefore shall see the abomination of desolation, spoken of by Daniel the prophet." },
      { reference: "2 Thessalonians 2:3-4", description: "That man of sin be revealed, the son of perdition; Who opposeth and exalteth himself above all that is called God." },
      { reference: "Revelation 13:5", description: "And power was given unto him to continue forty and two months." }
    ]
  }
];

export function findCompanionPrecepts(textOrScripture: string): PreceptMapping[] {
  const q = textOrScripture.toLowerCase();
  return PRECEPT_DATABASE.filter(item => {
    if (item.topic.toLowerCase().includes(q) || item.primaryScripture.toLowerCase().includes(q)) return true;
    return item.precepts.some(p => p.reference.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  });
}
