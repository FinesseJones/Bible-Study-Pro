import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ChevronRight, Scroll, Clock, Globe, Star, X, Search, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Input } from "@/components/ui/input";

interface HistoryEntry {
  id: string;
  era: string;
  title: string;
  period: string;
  summary: string;
  significance: string;
  scripture?: string;
  category: "Ancient Israel" | "Early Assembly" | "Dispersion" | "Prophecy" | "IOG Teaching";
}

const HISTORY_DATA: HistoryEntry[] = [
  {
    id: "1",
    era: "Creation",
    title: "The Creation of the Hebrew Nation",
    period: "~2000 BC – Abraham's Covenant",
    summary: "The Most High chose Abraham and made an everlasting covenant with him and his seed. This covenant was passed to Isaac, then Jacob (renamed Israel), establishing the twelve tribes of Israel as the chosen people.",
    significance: "The foundation of all biblical prophecy and doctrine rests on the Abrahamic and Mosaic covenants. The Israel of God teaches that this covenant was never broken and applies to the physical descendants of Israel.",
    scripture: "Genesis 17:7 – 'And I will establish my covenant between me and thee and thy seed after thee in their generations for an everlasting covenant.'",
    category: "Ancient Israel"
  },
  {
    id: "2",
    era: "Exodus",
    title: "The Exodus & The Law of Moses",
    period: "~1446 BC",
    summary: "The Most High delivered the children of Israel out of Egyptian bondage under Moses. At Mount Sinai, the Law was given as the national constitution of the Israelite nation, covering dietary laws, feast days, and righteous ordinances.",
    significance: "The Israel of God teaches that the Law of Moses remains binding on the true children of Israel. The Sabbath, dietary laws, and feast days are not 'done away with' but are the heritage of the Hebrew people.",
    scripture: "Deuteronomy 7:6 – 'For thou art an holy people unto the LORD thy God: the LORD thy God hath chosen thee to be a special people unto himself.'",
    category: "Ancient Israel"
  },
  {
    id: "3",
    era: "Kingdom Era",
    title: "The United Kingdom — David & Solomon",
    period: "~1010–930 BC",
    summary: "King David unified the twelve tribes under one kingdom and was promised an eternal throne. His son Solomon built the first Temple in Jerusalem, establishing the center of Israelite worship.",
    significance: "The Davidic covenant promises that a descendant of David will reign forever — a prophecy fulfilled through Yahawashi (Christ), who the Israel of God identifies as the true King of the Hebrews.",
    scripture: "2 Samuel 7:16 – 'And thine house and thy kingdom shall be established for ever before thee: thy throne shall be established for ever.'",
    category: "Ancient Israel"
  },
  {
    id: "4",
    era: "Dispersion",
    title: "The Babylonian Captivity & Scattering",
    period: "586 BC – Ongoing",
    summary: "Due to disobedience, Israel was scattered into captivity — first Assyria (Northern Tribes), then Babylon (Southern Kingdom). These dispersions are the beginning of the prophesied worldwide scattering.",
    significance: "The Israel of God teaches that the Trans-Atlantic Slave Trade, the scattering of Negroes, Hispanics, and Native Americans fulfills Deuteronomy 28, identifying these groups as the true children of Israel.",
    scripture: "Deuteronomy 28:68 – 'And the LORD shall bring thee into Egypt again with ships, by the way whereof I spake unto thee, Thou shalt see it no more again.'",
    category: "Dispersion"
  },
  {
    id: "5",
    era: "Messiah",
    title: "The Ministry of Yahawashi (Christ)",
    period: "~4 BC – 33 AD",
    summary: "Yahawashi (Jesus Christ) came as the Messiah of Israel. He taught the Kingdom of Heaven, performed miracles, fulfilled the Law, died for the sins of Israel, and rose again. He came specifically for the lost sheep of the house of Israel.",
    significance: "The Israel of God teaches that salvation comes through Yahawashi's blood and is specifically directed to the Hebrew nation first. Matthew 15:24 – 'I am not sent but unto the lost sheep of the house of Israel.'",
    scripture: "Matthew 1:21 – 'And she shall bring forth a son, and thou shalt call his name JESUS: for he shall save his people from their sins.'",
    category: "Early Assembly"
  },
  {
    id: "6",
    era: "Early Assembly",
    title: "The Acts of the Apostles & Early Assembly",
    period: "33 AD – 70 AD",
    summary: "After the resurrection, the Holy Spirit was poured out on Pentecost. The apostles spread the gospel of the Kingdom throughout Jerusalem, Judea, Samaria, and to the gentile nations. The early assembly kept the Law and the faith of Yahawashi.",
    significance: "The Israel of God identifies the early disciples as Hebrew Israelites who maintained the Law of Moses alongside faith in Yahawashi. The 'church' was originally a Hebrew assembly, not a Roman or Greek institution.",
    scripture: "Acts 2:38 – 'Repent, and be baptized every one of you in the name of Jesus Christ for the remission of sins.'",
    category: "Early Assembly"
  },
  {
    id: "7",
    era: "The Slave Trade",
    title: "The Trans-Atlantic Slave Trade — Deuteronomy 28 Fulfilled",
    period: "1500s – 1865 AD",
    summary: "Millions of Africans, identified by the Israel of God as Hebrew Israelites, were transported to the Americas via ships as slaves — fulfilling Deuteronomy 28:68. This is seen as the final and greatest punishment for Israel's disobedience to the covenant.",
    significance: "The Israel of God teaches that the so-called 'African American,' Hispanic, and Native American peoples are in fact the scattered twelve tribes of Israel. Their history of slavery, oppression, and scattering matches every curse in Deuteronomy 28.",
    scripture: "Deuteronomy 28:15 – 'But it shall come to pass, if thou wilt not hearken unto the voice of the LORD thy God...all these curses shall come upon thee.'",
    category: "Dispersion"
  },
  {
    id: "8",
    era: "End Times",
    title: "The Gathering of Israel — Prophecy of Restoration",
    period: "Ongoing – Future",
    summary: "The prophets foretold a great restoration where the Most High would regather the scattered children of Israel from the four corners of the earth. This involves a new covenant written on the heart and the reign of Yahawashi on David's throne in Jerusalem.",
    significance: "The Israel of God teaches that we are currently living in the end times, and the awakening of Black, Hispanic, and Native American peoples to their Hebrew identity is the beginning of the fulfillment of these restoration prophecies.",
    scripture: "Isaiah 11:11–12 – 'And it shall come to pass in that day, that the Lord shall set his hand again the second time to recover the remnant of his people.'",
    category: "Prophecy"
  },
  {
    id: "9",
    era: "IOG",
    title: "The Israel of God — The Awakening",
    period: "Present Day",
    summary: "The Israel of God is a Bible study organization based in Riverdale, Illinois, led by Pastor Henry Buie. It teaches that the so-called Black, Hispanic, and Native American peoples are the true biblical Israelites. Through systematic scripture study, the IOG exposes the true identity of God's chosen people.",
    significance: "The Israel of God is one of the leading Hebrew Israelite teaching organizations committed to sound doctrine, the Law of Moses, and faith in Yahawashi (Christ). Their extensive video library covers history, prophecy, doctrine, health, and relationship teachings.",
    scripture: "Hosea 4:6 – 'My people are destroyed for lack of knowledge.'",
    category: "IOG Teaching"
  }
];

const CATEGORY_COLORS: Record<string, string> = {
  "Ancient Israel":  "bg-amber-900/40 text-amber-300 border-amber-700/50",
  "Early Assembly":  "bg-blue-900/40 text-blue-300 border-blue-700/50",
  "Dispersion":      "bg-red-900/40 text-red-300 border-red-700/50",
  "Prophecy":        "bg-purple-900/40 text-purple-300 border-purple-700/50",
  "IOG Teaching":    "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  "History: Bible & Prophecy": "bg-green-900/40 text-green-300 border-green-700/50",
  "History: Judaism": "bg-indigo-900/40 text-indigo-300 border-indigo-700/50",
  "History: Early Assembly": "bg-sky-900/40 text-sky-300 border-sky-700/50",
  "History: African & Hebrew Connection": "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  "History: Ancient Near East": "bg-orange-900/40 text-orange-300 border-orange-700/50",
};

const MAIN_FILTERS = ["Timeline", "Library"];
const TIMELINE_FILTERS = ["All", "Ancient Israel", "Early Assembly", "Dispersion", "Prophecy", "IOG Teaching"];
const LIBRARY_FILTERS = ["All", "History: Bible & Prophecy", "History: Judaism", "History: Early Assembly", "History: African & Hebrew Connection", "History: Ancient Near East"];
export default function History() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
  const [activeMainTab, setActiveMainTab] = useState("Timeline");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: libraryStudies = [] } = trpc.studies.list.useQuery(undefined, {
    enabled: isAuthenticated
  });

  const timelineFiltered = activeFilter === "All"
    ? HISTORY_DATA
    : HISTORY_DATA.filter(e => e.category === activeFilter);

  const libraryFiltered = libraryStudies
    .filter(s => s.category?.startsWith("History:"))
    .filter(s => activeFilter === "All" || s.category === activeFilter)
    .filter(s => !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.summary?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen" style={{ background: "#0B132B" }}>
      {/* Header */}
      <nav className="sticky top-0 z-50 border-b" style={{ background: "rgba(11,19,43,0.95)", backdropFilter: "blur(12px)", borderColor: "rgba(212,175,55,0.15)" }}>
        <div className="container flex items-center justify-between h-16 px-6">
          <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-sm" style={{ color: "#6B7A8D" }}>
            <ChevronRight size={16} className="rotate-180" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-2">
            <Scroll size={20} style={{ color: "#D4AF37" }} />
            <span className="font-serif text-lg font-bold" style={{ color: "#F9F6F0" }}>Heritage & History</span>
          </div>
          <div className="w-16" />
        </div>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(42,58,110,0.4) 0%, transparent 60%)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-px gold-divider" />
        <div className="container px-6 py-12 relative z-10">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <p className="text-xs uppercase tracking-[0.3em] mb-3 font-semibold" style={{ color: "#D4AF37" }}>
              The Israel of God
            </p>
            <h1 className="font-serif text-5xl md:text-6xl font-bold leading-tight mb-4" style={{ color: "#F9F6F0" }}>
              The True History<br />
              <span className="text-gold-gradient">of Israel</span>
            </h1>
            <p className="text-lg max-w-xl" style={{ color: "#6B7A8D" }}>
              Explore the prophetic timeline and the extensive Sacred-Texts library of ancient Israelite history.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="container px-6 pb-24 safe-pb">
        {/* Main Tabs */}
        <div className="flex gap-8 border-b mb-8" style={{ borderColor: "rgba(212,175,55,0.15)" }}>
          {MAIN_FILTERS.map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveMainTab(tab); setActiveFilter("All"); }}
              className="pb-4 text-sm font-bold uppercase tracking-widest transition-all relative"
              style={{ color: activeMainTab === tab ? "#D4AF37" : "#6B7A8D" }}
            >
              {tab}
              {activeMainTab === tab && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "#D4AF37" }} />
              )}
            </button>
          ))}
        </div>

        {activeMainTab === "Timeline" ? (
          <>
            {/* Four Winds of Heaven — Book Card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              <p className="text-xs uppercase tracking-[0.2em] mb-3 font-semibold" style={{ color: "#D4AF37" }}>
                Featured Study Document
              </p>
              <div
                className="flex gap-5 rounded-xl p-4 cursor-pointer group transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: "rgba(28,37,65,0.7)", border: "1px solid rgba(212,175,55,0.2)" }}
                onClick={() => window.open("/four-winds-of-heaven.pdf", "_blank")}
              >
                {/* Book Cover */}
                <div className="shrink-0 w-24 h-32 rounded-lg overflow-hidden shadow-2xl"
                  style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5), 4px 0 12px rgba(212,175,55,0.1)" }}>
                  <img
                    src="/four-winds-cover.png"
                    alt="Four Winds of Heaven"
                    className="w-full h-full object-cover"
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                    style={{ background: "linear-gradient(to right, rgba(212,175,55,0.5), transparent)" }} />
                </div>

                {/* Book Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] mb-1" style={{ color: "#D4AF37" }}>The Israel of God</p>
                    <h3 className="font-serif text-xl font-bold leading-tight mb-2" style={{ color: "#F9F6F0" }}>
                      Four Winds of Heaven
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "#6B7A8D" }}>
                      A comprehensive study document covering the prophetic significance of the four winds as revealed in the scriptures. Essential IOG doctrine.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{ background: "rgba(212,175,55,0.15)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.3)" }}>
                      PDF Study
                    </span>
                    <span className="text-xs flex items-center gap-1 group-hover:underline" style={{ color: "#D4AF37" }}>
                      Open Document →
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-8 pb-2">
              {TIMELINE_FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all"
                  style={
                    activeFilter === f
                      ? { background: "#D4AF37", color: "#0B132B" }
                      : { background: "rgba(28,37,65,0.8)", color: "#6B7A8D", border: "1px solid rgba(212,175,55,0.15)" }
                  }
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Timeline */}
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-px" style={{ background: "linear-gradient(to bottom, #D4AF37, rgba(212,175,55,0.1))" }} />
              <div className="space-y-6">
                {timelineFiltered.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="relative pl-14"
                  >
                    <div className="absolute left-4 top-5 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                      style={{ background: "#0B132B", borderColor: "#D4AF37" }}>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#D4AF37" }} />
                    </div>

                    <button
                      onClick={() => setSelectedEntry(entry)}
                      className="w-full text-left rounded-lg p-5 transition-all hover:scale-[1.01] active:scale-[0.99]"
                      style={{ background: "rgba(28,37,65,0.6)", border: "1px solid rgba(212,175,55,0.1)" }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[entry.category]}`}>
                              {entry.category}
                            </span>
                            <span className="text-xs flex items-center gap-1" style={{ color: "#6B7A8D" }}>
                              <Clock size={10} />
                              {entry.period}
                            </span>
                          </div>
                          <h3 className="font-serif text-lg font-bold leading-tight" style={{ color: "#F9F6F0" }}>
                            {entry.title}
                          </h3>
                        </div>
                        <ChevronRight size={18} className="mt-1 shrink-0" style={{ color: "#D4AF37" }} />
                      </div>
                      <p className="text-sm line-clamp-2" style={{ color: "#6B7A8D" }}>
                        {entry.summary}
                      </p>
                      {entry.scripture && (
                        <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(212,175,55,0.1)" }}>
                          <p className="text-xs italic" style={{ color: "rgba(212,175,55,0.7)" }}>
                            {entry.scripture.split("–")[0]}
                          </p>
                        </div>
                      )}
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Library Section */}
            <div className="mb-8 space-y-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6B7A8D" }} />
                <Input
                  placeholder="Search historical library..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 h-11"
                  style={{ background: "rgba(28,37,65,0.8)", border: "1px solid rgba(212,175,55,0.15)", color: "#F9F6F0" }}
                />
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                {LIBRARY_FILTERS.map(f => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all"
                    style={
                      activeFilter === f
                        ? { background: "#D4AF37", color: "#0B132B" }
                        : { background: "rgba(28,37,65,0.8)", color: "#6B7A8D", border: "1px solid rgba(212,175,55,0.15)" }
                    }
                  >
                    {f.replace("History: ", "")}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {libraryFiltered.map((doc, i) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <button
                    onClick={() => setSelectedEntry({
                      id: doc.id.toString(),
                      era: "Sacred Texts",
                      title: doc.title,
                      period: doc.category || "Ancient Text",
                      summary: doc.summary || doc.description || "No summary available.",
                      significance: "This text is part of the extensive Sacred-Texts library, providing deep historical context for biblical study.",
                      category: doc.category as any
                    })}
                    className="w-full text-left rounded-lg p-4 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                    style={{ background: "rgba(28,37,65,0.6)", border: "1px solid rgba(212,175,55,0.1)" }}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{ background: "rgba(212,175,55,0.1)" }}>
                        <FileText size={20} style={{ color: "#D4AF37" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase mb-1 inline-block ${CATEGORY_COLORS[doc.category || "History: Judaism"]}`}>
                          {doc.category?.replace("History: ", "")}
                        </span>
                        <h3 className="font-serif text-sm font-bold truncate group-hover:text-amber-200 transition-colors" style={{ color: "#F9F6F0" }}>
                          {doc.title}
                        </h3>
                        <p className="text-xs line-clamp-2 mt-1" style={{ color: "#6B7A8D" }}>
                          {doc.description || "Ancient historical document from the sacred-texts collection."}
                        </p>
                      </div>
                    </div>
                  </button>
                </motion.div>
              ))}
            </div>
            
            {libraryFiltered.length === 0 && (
              <div className="text-center py-20">
                <p style={{ color: "#6B7A8D" }}>No documents found in this section.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedEntry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-4"
            style={{ background: "rgba(11,19,43,0.9)", backdropFilter: "blur(8px)" }}
            onClick={() => setSelectedEntry(null)}
          >
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="w-full max-w-2xl rounded-t-2xl md:rounded-2xl overflow-y-auto max-h-[90vh]"
              style={{ background: "#1C2541", border: "1px solid rgba(212,175,55,0.2)" }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="sticky top-0 flex items-center justify-between p-5 border-b" style={{ background: "#1C2541", borderColor: "rgba(212,175,55,0.15)" }}>
                <span className={`text-xs px-2 py-1 rounded-full border font-medium ${CATEGORY_COLORS[selectedEntry.category]}`}>
                  {selectedEntry.category}
                </span>
                <button onClick={() => setSelectedEntry(null)} className="p-1 rounded-full transition-colors" style={{ color: "#6B7A8D" }}>
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: "#D4AF37" }}>{selectedEntry.period}</p>
                  <h2 className="font-serif text-2xl font-bold leading-tight" style={{ color: "#F9F6F0" }}>{selectedEntry.title}</h2>
                </div>

                <div className="gold-divider" />

                <div>
                  <h4 className="text-xs uppercase tracking-wider mb-2 font-semibold flex items-center gap-2" style={{ color: "#D4AF37" }}>
                    <Globe size={12} /> Historical Account
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: "#9BA8BB" }}>{selectedEntry.summary}</p>
                </div>

                <div className="rounded-lg p-4" style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.15)" }}>
                  <h4 className="text-xs uppercase tracking-wider mb-2 font-semibold flex items-center gap-2" style={{ color: "#D4AF37" }}>
                    <Star size={12} /> IOG Doctrine & Significance
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: "#9BA8BB" }}>{selectedEntry.significance}</p>
                </div>

                {selectedEntry.scripture && (
                  <div className="rounded-lg p-4" style={{ background: "rgba(42,58,110,0.4)", border: "1px solid rgba(212,175,55,0.1)" }}>
                    <h4 className="text-xs uppercase tracking-wider mb-2 font-semibold flex items-center gap-2" style={{ color: "#D4AF37" }}>
                      <BookOpen size={12} /> Key Scripture
                    </h4>
                    <p className="text-sm italic leading-relaxed" style={{ color: "#F9F6F0" }}>"{selectedEntry.scripture}"</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
