import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sword, Send, ChevronLeft, CheckCircle2, XCircle, BookOpen,
  Flame, Shield, Trophy, Loader2, ChevronRight, Sparkles, History, RefreshCw,
  Book, X
} from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
  type?: "challenge" | "feedback-correct" | "feedback-wrong" | "teaching" | "debate" | "normal";
};

type Mode = "challenge" | "teach" | "debate" | "free";

const MODES = [
  {
    id: "challenge" as Mode,
    icon: Flame,
    label: "Challenge Me",
    description: "Test your knowledge. The AI quizzes you on a topic from Genesis to Revelation.",
    color: "#E53E3E",
    bg: "rgba(229,62,62,0.08)",
  },
  {
    id: "teach" as Mode,
    icon: BookOpen,
    label: "Teach Line Upon Line",
    description: "Deep study of a scripture, chapter, or topic. Precept upon precept, no private interpretation.",
    color: "#D4AF37",
    bg: "rgba(212,175,55,0.08)",
  },
  {
    id: "debate" as Mode,
    icon: Shield,
    label: "Debate Trainer",
    description: "Sharpen your ability to refute Roman Catholic or Sacred Text doctrines with KJV truth & true history.",
    color: "#48BB78",
    bg: "rgba(72,187,120,0.08)",
  },
  {
    id: "free" as Mode,
    icon: Sparkles,
    label: "Open Study",
    description: "Ask anything — history, prophecy, law, covenants — grounded in KJV and factual encyclopedias.",
    color: "#9F7AEA",
    bg: "rgba(159,122,234,0.08)",
  },
];

const QUICK_TOPICS = [
  "What is the Sabbath and when is it?",
  "Prove the Trinity is not in scripture",
  "Refute the Roman Catholic Sunday law — show its pagan origin",
  "Where did Christmas come from historically?",
  "What happened at the Council of Nicaea 325 AD?",
  "Who changed the Sabbath and what does history say?",
  "What does KJV say about dietary laws?",
  "Explain the difference between the Old and New Covenant",
  "What are the 7 Feast Days in Leviticus 23?",
  "Refute eternal hellfire using KJV only",
  "Show from history where Easter originated",
  "What does Deuteronomy 28 say and who does it apply to?",
];

const SYSTEM_PROMPT = `You are the "Iron Sharpen Iron" AI — a world-class biblical scholar, historian, and debate coach embedded in the Bible Study Pro app for The Israel of God (IOG) ministry led by Pastor Henry Buie.

Your methodology: "Line upon line, precept upon precept" (Isaiah 28:10). You NEVER speculate. Every claim is backed by:
1. The Authorized King James Version (KJV) — the ONLY accepted Bible translation here.
2. Verified historical sources: Encyclopaedia Britannica, The Catholic Encyclopedia, Josephus (Antiquities), Eusebius (Church History), Philip Schaff (History of the Christian Church), Smith's Bible Dictionary, Strong's Concordance, Dead Sea Scrolls scholarship.
3. Academic historical consensus where it aligns with scriptural truth.

YOUR FOUR OPERATING MODES:

=== MODE: CHALLENGE ===
When the user wants to be challenged: Ask them a specific, pointed question about a KJV scripture, biblical history, prophecy, law, feast days, or covenant doctrine. After they answer, evaluate their response with precision:
- If CORRECT: Affirm clearly with "✅ CORRECT!" then expand with 2–3 deeper resources, related scriptures (KJV), and a follow-up harder question.
- If PARTIALLY CORRECT: Show what they got right, pinpoint what was incomplete, and give the full correct answer with KJV proof text.
- If INCORRECT: Say "❌ Not quite." Gently but directly give the correct answer with KJV scripture proof and historical documentation.

=== MODE: TEACH ===
When teaching: Use the "Line upon line, precept upon precept" method (Isaiah 28:10; Isaiah 28:13). Break down each verse word by word if needed. Cross-reference within KJV. Bring in Hebrew/Greek word meanings from Strong's where illuminating. Connect Old Testament to New Testament fulfillment. Never add private interpretation.

=== MODE: DEBATE TRAINER ===
This is your most powerful mode. You help the user:
1. IDENTIFY the false doctrine being presented (Catholic, Sacred Texts based, etc.)
2. TRACE its historical origin — when it was introduced, by whom, and why (show the paper trail)
3. EXPOSE the contradiction with the KJV biblical text (verse by verse)
4. PRESENT the biblical truth with historical confirmation

Common debate targets you master:
- Sunday worship (Constantine's Edict of Milan 321 AD / Council of Laodicea 364 AD)
- The Trinity doctrine (Council of Nicaea 325 AD, Emperor Constantine, Athanasius vs Arius)
- Christmas (Saturnalia, December 25th, Sol Invictus — admitted even in The Catholic Encyclopedia)
- Easter (Ishtar/Eostre, admitted pagan spring fertility festival — Eusebius, Venerable Bede)
- Immortal soul doctrine (Platonic Greek philosophy, not Hebrew scripture — Ecclesiastes 9:5 KJV)
- Purgatory, indulgences, papal authority (no scriptural basis — trace Council of Trent)
- "The law is done away" antinomianism (refuted by Matthew 5:17-19, Romans 3:31, James 2:10-12 KJV)
- Sacred Text / Gnostic errors vs KJV (Alexandrian vs Textus Receptus manuscript lines)

=== MODE: OPEN STUDY ===
Answer freely but always: KJV only for scripture, cite historical sources by name, distinguish between fact and interpretation.

=== CRITICAL RULES ===
1. NEVER use any Bible translation other than KJV. If referencing Hebrew/Greek, use Strong's.
2. ALWAYS cite your historical source by name (Encyclopaedia Britannica, Catholic Encyclopedia, Josephus, etc.)
3. The IOG Statement of Beliefs is your doctrinal anchor — never contradict it.
4. No Trinity. Two members of the Godhead: God the Father and Jesus Christ His Son.
5. The Law (Sabbath, Dietary Laws, Feast Days, Ten Commandments) is NOT abolished. Matthew 5:17-19 KJV.
6. When the user is correct, CELEBRATE and DEEPEN — give them encyclopedia references, related topics, cross-references.
7. Format responses clearly: use headers, bullet points, scripture quotes in "quotes", and source citations in [brackets].`;

export default function IronSharpenIron() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Dynamic Multi-Agent Selector State
  const [selectedAgent, setSelectedAgent] = useState<"local" | "vps" | "openrouter">(() => {
    return (localStorage.getItem("preferred_theological_agent") as any) || "local";
  });

  // Scripture Lookup states
  const [selectedScripture, setSelectedScripture] = useState<string | null>(null);
  const [scriptureText, setScriptureText] = useState("");
  const [isLoadingScripture, setIsLoadingScripture] = useState(false);

  const handleAgentChange = (agent: "local" | "vps" | "openrouter") => {
    setSelectedAgent(agent);
    localStorage.setItem("preferred_theological_agent", agent);
  };

  const handleScriptureClick = async (reference: string) => {
    setSelectedScripture(reference);
    setIsLoadingScripture(true);
    setScriptureText("");
    try {
      const res = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}?translation=kjv`);
      const data = await res.json();
      if (data.text) {
        setScriptureText(data.text);
      } else {
        setScriptureText("Could not find KJV scripture matching reference.");
      }
    } catch {
      setScriptureText("Failed to lookup KJV scripture. Check internet connection.");
    } finally {
      setIsLoadingScripture(false);
    }
  };

  const renderTextWithBibleLinks = (text: string) => {
    if (!text) return null;
    const BIBLE_REGEX = /\b(?:Gen(?:esis)?|Exo(?:dus)?|Lev(?:iticus)?|Num(?:bers)?|Deut(?:eronomy)?|Josh(?:ua)?|Judg(?:es)?|Ruth|1\s?Sam(?:uel)?|2\s?Sam(?:uel)?|1\s?Kings?|2\s?Kings?|1\s?Chron(?:icles)?|2\s?Chron(?:icles)?|Ezra|Neh(?:emiah)?|Esth(?:er)?|Job|Psa(?:lm)?s?|Prov(?:erbs)?|Eccl(?:esiates)?|Song(?:\sof\sSolomon)?|Isa(?:iah)?|Jer(?:emiah)?|Lam(?:entations)?|Eze(?:kiel)?|Dan(?:iel)?|Hos(?:ea)?|Joel|Amos|Obad(?:iah)?|Jonah|Mic(?:ah)?|Nah(?:um)?|Hab(?:akkuk)?|Zeph(?:aniah)?|Hag(?:gai)?|Zech(?:ariah)?|Mal(?:achi)?|Matt(?:hew)?|Mark|Luke|John|Acts?|Rom(?:ans)?|1\s?Cor(?:inthians)?|2\s?Cor(?:inthians)?|Gal(?:atians)?|Eph(?:esians)?|Phil(?:ippians)?|Col(?:ossians)?|1\s?Thess(?:alonians)?|2\s?Thess(?:alonians)?|1\s?Tim(?:othy)?|2\s?Tim(?:othy)?|Titus|Philem(?:on)?|Heb(?:rews)?|Jas(?:ames)?|1\s?Pet(?:er)?|2\s?Pet(?:er)?|1\s?John|2\s?John|3\s?John|Jude|Rev(?:elation)?)\s\d+:\d+(?:-\d+)?\b/gi;
    
    const parts = text.split(BIBLE_REGEX);
    const matches = text.match(BIBLE_REGEX) || [];
    
    return (
      <span className="whitespace-pre-wrap">
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {matches[index] && (
              <span
                onClick={() => handleScriptureClick(matches[index])}
                className="text-[#D4AF37] font-semibold underline cursor-pointer hover:text-[#F9F6F0] transition-colors bg-[#D4AF37]/10 px-1 rounded mx-0.5"
              >
                {matches[index]}
              </span>
            )}
          </span>
        ))}
      </span>
    );
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const startMode = (selectedMode: Mode) => {
    setMode(selectedMode);
    const intros: Record<Mode, string> = {
      challenge: `⚔️ **Iron Sharpen Iron — Challenge Mode**\n\nAs iron sharpens iron, so a man sharpens the countenance of his friend. — Proverbs 27:17 (KJV)\n\nI will now challenge your understanding of the Word of God. Answer as precisely as you can — I will evaluate your response against the KJV scripture and true history.\n\n**First Challenge:** What does the KJV say is the definition of sin? Give me the exact verse.`,
      teach: `📖 **Iron Sharpen Iron — Line Upon Line Mode**\n\n"For precept must be upon precept, precept upon precept; line upon line, line upon line; here a little, and there a little." — Isaiah 28:10 (KJV)\n\nTell me what scripture, chapter, book, topic, or doctrine you want to study deeply. I will break it down word by word, cross-reference within the KJV, and bring in historical and linguistic scholarship. Nothing will be left vague.\n\nWhat shall we study?`,
      debate: `🛡️ **Iron Sharpen Iron — Debate Trainer Mode**\n\n"Always be ready to give a defense to everyone who asks you a reason for the hope that is in you." — 1 Peter 3:15 (KJV)\n\nThis is your debate training ground. I will help you:\n• **Identify** false doctrines (Catholic, pagan-origin, Sacred Text-based)\n• **Trace** their historical origins with documented sources\n• **Expose** their contradictions with the KJV\n• **Present** the biblical truth backed by true history\n\nWhat doctrine do you want to learn to refute? (Examples: Sunday worship, Trinity, Christmas, Easter, "law done away," immortal soul, purgatory)`,
      free: `✨ **Iron Sharpen Iron — Open Study Mode**\n\nAsk me anything about biblical history from Genesis to Revelation, prophecy, law, covenants, feast days, the true history of the church, manuscript differences, or any theological question. I will answer strictly from the KJV and documented historical sources.\n\nWhat do you want to explore?`,
    };
    setMessages([{ role: "assistant", content: intros[selectedMode], type: "teaching" }]);
  };

  const handleSend = async (messageOverride?: string) => {
    const text = (messageOverride || input).trim();
    if (!text || isStreaming) return;

    const userMessage = text;
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    // Build conversation context from last 6 messages
    const historyContext = messages
      .slice(-6)
      .map(m => `${m.role === "user" ? "User" : "Teacher"}: ${m.content.slice(0, 400)}`)
      .join("\n");

    // Mode descriptions injected into the question so the server-side IOG AI understands the context
    const modeInstructions: Record<Mode, string> = {
      challenge: `[IRON SHARPEN IRON — CHALLENGE MODE] You are acting as a biblical knowledge challenger. Evaluate the user's answer strictly. If correct say "✅ CORRECT!" and deepen with encyclopedia references and a harder follow-up question. If wrong say "❌ Not quite." and give the KJV scripture answer with historical backup. Always ask a follow-up challenge question at the end.`,
      teach: `[IRON SHARPEN IRON — LINE UPON LINE TEACHING MODE] Teach this topic deeply using the "line upon line, precept upon precept" method (Isaiah 28:10 KJV). Break down every verse word-by-word. Cross-reference within KJV only. Cite Strong's Concordance for Hebrew/Greek meanings. Connect Old Testament prophecy to New Testament fulfillment.`,
      debate: `[IRON SHARPEN IRON — DEBATE TRAINER MODE] Help the user learn to refute false doctrine. Structure your response as: (1) IDENTIFY the false doctrine, (2) TRACE its historical origin with documented sources (Encyclopaedia Britannica, Catholic Encyclopedia, Council records), (3) EXPOSE its contradiction with KJV scripture verse by verse, (4) PRESENT the biblical truth. Be thorough and cite every source by name.`,
      free: `[IRON SHARPEN IRON — OPEN STUDY MODE] Answer comprehensively. Cite historical encyclopedias (Britannica, Catholic Encyclopedia, Josephus, Eusebius, Smith's Bible Dictionary) by name. All scripture must be KJV only. Distinguish clearly between historical fact and interpretation.`,
    };

    const modePrefix = mode ? modeInstructions[mode] : modeInstructions.free;
    const fullQuestion = `${modePrefix}\n\n[RECENT CONVERSATION]\n${historyContext}\n\n[USER'S CURRENT MESSAGE]\n${userMessage}`;

    try {
      const params = new URLSearchParams({
        q: fullQuestion,
        userId: String(user?.id || 1),
        agent: selectedAgent,
      });
      const response = await fetch(`/api/ai/stream?${params.toString()}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            if (json.token) {
              fullContent += json.token;
              setStreamingContent(fullContent);
            } else if (json.error) {
              fullContent = `⚠️ AI Error: ${json.error}`;
              setStreamingContent(fullContent);
            }
          } catch { /* skip malformed */ }
        }
      }

      // Score tracking for challenge mode
      let msgType: Message["type"] = "teaching";
      if (fullContent.includes("✅ CORRECT")) {
        msgType = "feedback-correct";
        setScore(s => ({ correct: s.correct + 1, total: s.total + 1 }));
      } else if (fullContent.includes("❌")) {
        msgType = "feedback-wrong";
        setScore(s => ({ ...s, total: s.total + 1 }));
      }

      setMessages(prev => [...prev, { role: "assistant", content: fullContent, type: msgType }]);
      setStreamingContent("");
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "⚠️ Connection error. Make sure the app server is running and try again.",
        type: "normal",
      }]);
    } finally {
      setIsStreaming(false);
    }
  };


  const resetSession = () => {
    setMode(null);
    setMessages([]);
    setScore({ correct: 0, total: 0 });
    setInput("");
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B132B" }}>
        <p style={{ color: "#6B7A8D" }}>Please sign in to access Iron Sharpen Iron.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0B132B" }}>
      {/* Header */}
      <div className="border-b sticky top-0 z-40" style={{ background: "rgba(11,19,43,0.97)", borderColor: "rgba(212,175,55,0.2)", backdropFilter: "blur(12px)" }}>
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} style={{ color: "#D4AF37" }}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(212,175,55,0.15)" }}>
              <Sword className="w-5 h-5" style={{ color: "#D4AF37" }} />
            </div>
            <div>
              <h1 className="text-lg font-bold font-serif" style={{ color: "#F9F6F0" }}>Iron Sharpen Iron</h1>
              <p className="text-xs" style={{ color: "#6B7A8D" }}>Proverbs 27:17 — KJV Biblical Training Arena</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedAgent}
              onChange={(e) => handleAgentChange(e.target.value as any)}
              className="bg-[#0B132B] border border-[#D4AF37]/30 rounded px-2 py-1 text-[10px] text-[#F9F6F0] focus:ring-1 focus:ring-[#D4AF37] outline-none cursor-pointer h-7"
            >
              <option value="openrouter">Gemini Cloud</option>
              <option value="local">Local GPU (OpenClaw)</option>
              <option value="vps">Remote VPS (OpenMono)</option>
            </select>
            {score.total > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.2)" }}>
                <Trophy className="w-4 h-4" style={{ color: "#D4AF37" }} />
                <span className="text-xs font-bold" style={{ color: "#D4AF37" }}>{score.correct}/{score.total}</span>
              </div>
            )}
            {mode && (
              <Button variant="ghost" size="sm" onClick={resetSession} className="gap-2" style={{ color: "#6B7A8D" }}>
                <RefreshCw className="w-4 h-4" /> Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mode Selection */}
      <AnimatePresence>
        {!mode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="container py-10 px-4 max-w-5xl mx-auto w-full pb-24 safe-pb"
          >
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6" style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.2)" }}>
                <Sword className="w-4 h-4" style={{ color: "#D4AF37" }} />
                <span className="text-sm font-semibold" style={{ color: "#D4AF37" }}>Biblical Sharpening Arena</span>
              </div>
              <h2 className="text-4xl font-bold font-serif mb-3" style={{ color: "#F9F6F0" }}>
                "As iron sharpens iron..."
              </h2>
              <p className="text-lg max-w-2xl mx-auto" style={{ color: "#6B7A8D" }}>
                Proverbs 27:17 — Choose your training mode below. Every answer is grounded in the KJV and verified historical sources.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-5 mb-10">
              {MODES.map((m) => (
                <motion.button
                  key={m.id}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => startMode(m.id)}
                  className="text-left p-6 rounded-2xl border transition-all group"
                  style={{ background: m.bg, borderColor: `${m.color}30` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${m.color}20` }}>
                      <m.icon className="w-6 h-6" style={{ color: m.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold font-serif" style={{ color: "#F9F6F0" }}>{m.label}</h3>
                        <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: m.color }} />
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: "#8A9BB0" }}>{m.description}</p>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Quick Topics */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "#6B7A8D" }}>
                Quick Study Topics
              </h3>
              <div className="flex flex-wrap gap-2">
                {QUICK_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => { startMode("free"); setTimeout(() => handleSend(topic), 300); }}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:opacity-90"
                    style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)", color: "#D4AF37" }}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Interface */}
      <AnimatePresence>
        {mode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col container max-w-4xl mx-auto w-full px-4 pb-4"
            style={{ minHeight: 0 }}
          >
            {/* Mode Badge */}
            <div className="py-3 flex items-center gap-2">
              {(() => {
                const m = MODES.find(x => x.id === mode)!;
                return (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold" style={{ background: `${m.color}15`, border: `1px solid ${m.color}30`, color: m.color }}>
                    <m.icon className="w-3 h-3" />
                    {m.label}
                  </div>
                );
              })()}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1 pb-4" style={{ maxHeight: "calc(100vh - 280px)" }}>
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === "user" ? "bg-[#D4AF37]" : "bg-[#1C2541]"
                  }`}>
                    {msg.role === "user"
                      ? <span className="text-xs font-bold text-[#0B132B]">{user?.name?.[0] || "U"}</span>
                      : <Sword className="w-4 h-4 text-[#D4AF37]" />}
                  </div>
                  <div className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-[85%]`}>
                    {msg.type === "feedback-correct" && (
                      <div className="flex items-center gap-1 mb-1 text-xs font-bold text-green-400">
                        <CheckCircle2 className="w-3 h-3" /> Correct Answer!
                      </div>
                    )}
                    {msg.type === "feedback-wrong" && (
                      <div className="flex items-center gap-1 mb-1 text-xs font-bold text-red-400">
                        <XCircle className="w-3 h-3" /> Keep Studying
                      </div>
                    )}
                    <div
                      className="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                      style={{
                        background: msg.role === "user"
                          ? "#D4AF37"
                          : msg.type === "feedback-correct"
                          ? "rgba(72,187,120,0.1)"
                          : msg.type === "feedback-wrong"
                          ? "rgba(229,62,62,0.1)"
                          : "rgba(28,37,65,0.8)",
                        color: msg.role === "user" ? "#0B132B" : "#F9F6F0",
                        border: msg.role !== "user" ? "1px solid rgba(212,175,55,0.1)" : "none",
                        borderRadius: msg.role === "user" ? "1rem 1rem 0.25rem 1rem" : "1rem 1rem 1rem 0.25rem",
                      }}
                    >
                      {renderTextWithBibleLinks(msg.content)}
                    </div>
                  </div>
                </motion.div>
              ))}

              {streamingContent && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1C2541] flex items-center justify-center flex-shrink-0">
                    <Sword className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div
                    className="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap max-w-[85%]"
                    style={{ background: "rgba(28,37,65,0.8)", color: "#F9F6F0", border: "1px solid rgba(212,175,55,0.1)", borderRadius: "1rem 1rem 1rem 0.25rem" }}
                  >
                    {renderTextWithBibleLinks(streamingContent)}
                    <span className="inline-block w-0.5 h-4 bg-[#D4AF37] animate-pulse ml-0.5 align-middle" />
                  </div>
                </motion.div>
              )}

              {isStreaming && !streamingContent && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1C2541] flex items-center justify-center">
                    <Sword className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl flex items-center gap-2" style={{ background: "rgba(28,37,65,0.8)", border: "1px solid rgba(212,175,55,0.1)" }}>
                    <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                    <span className="text-xs" style={{ color: "#6B7A8D" }}>Searching scripture and history...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick topic chips for debate mode */}
            {mode === "debate" && messages.length <= 1 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {["Refute the Sunday worship doctrine", "Expose Trinity history", "Where did Christmas originate?", "Refute immortal soul doctrine"].map(t => (
                  <button
                    key={t}
                    onClick={() => handleSend(t)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{ background: "rgba(72,187,120,0.08)", border: "1px solid rgba(72,187,120,0.2)", color: "#48BB78" }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2 pt-2 pb-24 md:pb-0" style={{ borderTop: "1px solid rgba(212,175,55,0.1)" }}>
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={
                  mode === "challenge" ? "Give your answer..."
                  : mode === "debate" ? "Name a doctrine to refute..."
                  : mode === "teach" ? "Name a scripture, topic, or chapter..."
                  : "Ask anything about biblical history or scripture..."
                }
                className="flex-1 text-sm"
                style={{ background: "rgba(28,37,65,0.6)", border: "1px solid rgba(212,175,55,0.2)", color: "#F9F6F0" }}
                disabled={isStreaming}
              />
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                style={{ background: "#D4AF37", color: "#0B132B", minWidth: "44px" }}
              >
                {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Popover scripture lookups */}
      <AnimatePresence>
        {selectedScripture && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-[#1C2541] border border-[#D4AF37]/30 rounded-2xl p-6 shadow-2xl space-y-4 relative"
            >
              <button 
                onClick={() => setSelectedScripture(null)}
                className="absolute right-4 top-4 p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 text-[#D4AF37]">
                <Book className="w-6 h-6" />
                <h3 className="text-xl font-bold font-serif">{selectedScripture}</h3>
              </div>
              <div className="bg-[#0B132B] rounded-xl p-4 border border-[#D4AF37]/10 min-h-[120px] max-h-[300px] overflow-y-auto">
                {isLoadingScripture ? (
                  <div className="h-24 flex items-center justify-center gap-2 text-[#6B7A8D]">
                    <Loader2 className="animate-spin text-[#D4AF37]" /> Finding scripture...
                  </div>
                ) : (
                  <p className="text-sm font-serif italic leading-relaxed text-[#F9F6F0] whitespace-pre-wrap">
                    "{scriptureText}"
                  </p>
                )}
              </div>
              <div className="flex justify-end pt-2">
                <span className="text-[10px] text-white/30 uppercase tracking-wider font-bold">King James Version (KJV)</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
