/**
 * strongsData.ts
 * 
 * Embedded offline Strong's Concordance dictionary for high-frequency
 * Hebrew and Greek theological words in the King James Version (KJV).
 */

export interface StrongsEntry {
  id: string;
  word: string;
  translit: string;
  pronounce: string;
  lang: "hebrew" | "greek";
  definition: string;
  kjvUsage: string;
}

export const STRONGS_DICTIONARY: Record<string, StrongsEntry> = {
  // --- Hebrew (Old Testament) ---
  "H1254": {
    id: "H1254",
    word: "בָּרָא",
    translit: "bârâʼ",
    pronounce: "baw-raw'",
    lang: "hebrew",
    definition: "To create, shape, form, fashion (always of divine activity in creation).",
    kjvUsage: "create, creator, choose, make, cut down."
  },
  "H2451": {
    id: "H2451",
    word: "חָכְמָה",
    translit: "chokmâh",
    pronounce: "khok-maw'",
    lang: "hebrew",
    definition: "Wisdom, skill in holy living, prudence, spiritual understanding granted by God.",
    kjvUsage: "wisdom, wisely, skillful, wit."
  },
  "H7676": {
    id: "H7676",
    word: "שַׁבָּת",
    translit: "shabbâth",
    pronounce: "shab-bawth'",
    lang: "hebrew",
    definition: "Sabbath, day of rest, cessation from labor; holy convocation on the 7th day instituted at creation.",
    kjvUsage: "sabbath, every sabbath."
  },
  "H8451": {
    id: "H8451",
    word: "תּוֹרָה",
    translit: "tôrâh",
    pronounce: "to-raw'",
    lang: "hebrew",
    definition: "Law, direction, instruction, divine doctrine, statutes and commandments.",
    kjvUsage: "law, direction, custom, manner."
  },
  "H430": {
    id: "H430",
    word: "אֱלֹהִים",
    translit: "ʼĕlôhîym",
    pronounce: "el-o-heem'",
    lang: "hebrew",
    definition: "God, the Divine Godhead (plural of majesty denoting supreme rulers, judges, divine authority).",
    kjvUsage: "God, gods, judges, mighty, angels."
  },
  "H3068": {
    id: "H3068",
    word: "יְהֹוָה",
    translit: "Yᵉhôvâh",
    pronounce: "yeh-ho-vaw'",
    lang: "hebrew",
    definition: "The LORD, Jehovah, the self-existent eternal Almighty God of Abraham, Isaac, and Jacob.",
    kjvUsage: "LORD, GOD, Jehovah."
  },
  "H7307": {
    id: "H7307",
    word: "רוּחַ",
    translit: "rûwach",
    pronounce: "roo'-akh",
    lang: "hebrew",
    definition: "Spirit, breath, wind, mind, the Holy Spirit of God that imparts wisdom and life.",
    kjvUsage: "spirit, breath, wind, mind, blast."
  },
  "H1285": {
    id: "H1285",
    word: "בְּרִית",
    translit: "bᵉrîyth",
    pronounce: "ber-eeth'",
    lang: "hebrew",
    definition: "Covenant, alliance, pledge, divine agreement between God and His people.",
    kjvUsage: "covenant, league, confederacy."
  },
  "H4941": {
    id: "H4941",
    word: "מִשְׁפָּט",
    translit: "mishpâṭ",
    pronounce: "mish-pawt'",
    lang: "hebrew",
    definition: "Judgment, justice, ordinance, divine law, sentence, decree.",
    kjvUsage: "judgment, manner, right, cause, ordinance, justice."
  },
  "H3478": {
    id: "H3478",
    word: "יִשְׂרָאֵל",
    translit: "Yisrâʼêl",
    pronounce: "yis-raw-ale'",
    lang: "hebrew",
    definition: "Israel, 'He will rule as God' / 'Prince with God', the chosen twelve tribes.",
    kjvUsage: "Israel."
  },

  // --- Greek (New Testament) ---
  "G3056": {
    id: "G3056",
    word: "λόγος",
    translit: "logos",
    pronounce: "log'-os",
    lang: "greek",
    definition: "The Word, Divine expression, statement, speech, decree; Jesus Christ the Pre-incarnate Creator (John 1:1).",
    kjvUsage: "word, saying, account, speech, treatise."
  },
  "G4678": {
    id: "G4678",
    word: "σοφία",
    translit: "sophia",
    pronounce: "sof-ee'-ah",
    lang: "greek",
    definition: "Wisdom, supreme spiritual intelligence, insight into the divine will and mysteries of God.",
    kjvUsage: "wisdom."
  },
  "G4151": {
    id: "G4151",
    word: "πνεῦμα",
    translit: "pneuma",
    pronounce: "pnyoo'-mah",
    lang: "greek",
    definition: "Spirit, breath, the Holy Ghost/Spirit of God, spiritual nature.",
    kjvUsage: "Spirit, Holy Ghost, spirit, spiritual, life, wind."
  },
  "G4521": {
    id: "G4521",
    word: "σάββατον",
    translit: "sabbaton",
    pronounce: "sab'-bat-on",
    lang: "greek",
    definition: "The Sabbath day, the 7th-day holy rest; Sabbath institution (Hebrews 4:9).",
    kjvUsage: "sabbath, sabbath day, week."
  },
  "G3551": {
    id: "G3551",
    word: "νόμος",
    translit: "nomos",
    pronounce: "nom'-os",
    lang: "greek",
    definition: "Law, divine statute, command, the Mosaic moral and divine code.",
    kjvUsage: "law."
  },
  "G4102": {
    id: "G4102",
    word: "πίστις",
    translit: "pistis",
    pronounce: "pis'-tis",
    lang: "greek",
    definition: "Faith, conviction of the truth of God, faithfulness, obedience in action.",
    kjvUsage: "faith, belief, fidelity, assurance."
  },
  "G26": {
    id: "G26",
    word: "ἀγάπη",
    translit: "agapē",
    pronounce: "ag-ah'-pay",
    lang: "greek",
    definition: "Love, divine benevolence, keeping God's commandments towards God and neighbor.",
    kjvUsage: "love, charity, dear."
  },
  "G1785": {
    id: "G1785",
    word: "ἐντολή",
    translit: "entolē",
    pronounce: "en-tol-ay'",
    lang: "greek",
    definition: "Commandment, precept, authoritative decree of God.",
    kjvUsage: "commandment, precept, commission."
  },
  "G4991": {
    id: "G4991",
    word: "σωτηρία",
    translit: "sōtēria",
    pronounce: "so-tay-ree'-ah",
    lang: "greek",
    definition: "Salvation, deliverance, eternal preservation from death into the Kingdom of God.",
    kjvUsage: "salvation, deliver, health, saving."
  },
  "G932": {
    id: "G932",
    word: "βασιλεία",
    translit: "basileia",
    pronounce: "bas-il-i'-ah",
    lang: "greek",
    definition: "Kingdom, sovereignty, royal dominion; The Kingdom of God on Earth.",
    kjvUsage: "kingdom, reign."
  }
};

export function lookupStrongs(query: string): StrongsEntry | null {
  const clean = query.trim().toUpperCase();
  if (STRONGS_DICTIONARY[clean]) {
    return STRONGS_DICTIONARY[clean];
  }
  for (const entry of Object.values(STRONGS_DICTIONARY)) {
    if (
      entry.word.includes(query) ||
      entry.translit.toLowerCase() === query.toLowerCase() ||
      entry.kjvUsage.toLowerCase().includes(query.toLowerCase())
    ) {
      return entry;
    }
  }
  return null;
}
