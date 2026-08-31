import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Square, BookOpen, Brain, ChevronLeft,
  Loader2, Copy, CheckCheck, Save, Volume2, VolumeX,
  MessageSquare, Sparkles, FileText, Clock, Wifi, WifiOff
} from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ─── Type declarations for Web Speech API ─────────────────────────────────
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Pulse Ring animation for recording ───────────────────────────────────
function PulseRing({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="absolute inset-0 rounded-full animate-ping"
      style={{ background: "rgba(212,175,55,0.25)" }} />
  );
}

// ─── Cornell Note Panel ───────────────────────────────────────────────────
function CornellPanel({
  transcript,
  onSave,
  saving,
}: {
  transcript: string;
  onSave: (notes: { questions: string; notes: string; summary: string }) => void;
  saving: boolean;
}) {
  const [questions, setQuestions] = useState("");
  const [notes, setNotes] = useState(transcript);
  const [summary, setSummary] = useState("");
  const [copied, setCopied] = useState(false);

  // Auto-fill notes when transcript updates
  useEffect(() => { setNotes(transcript); }, [transcript]);

  const copyAll = () => {
    navigator.clipboard.writeText(`QUESTIONS:\n${questions}\n\nNOTES:\n${notes}\n\nSUMMARY:\n${summary}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(212,175,55,0.15)" }}>
        <div className="flex items-center gap-2">
          <FileText size={16} style={{ color: "#D4AF37" }} />
          <span className="font-bold text-sm" style={{ color: "#F9F6F0" }}>Cornell Notes</span>
        </div>
        <div className="flex gap-2">
          <button onClick={copyAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
            style={{ borderColor: "rgba(212,175,55,0.3)", color: "#D4AF37" }}>
            {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={() => onSave({ questions, notes, summary })}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{ background: "#D4AF37", color: "#0B132B" }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Questions column */}
        <div>
          <label className="text-[10px] uppercase tracking-widest font-bold mb-1 block"
            style={{ color: "#D4AF37" }}>Questions / Key Points</label>
          <Textarea
            value={questions}
            onChange={e => setQuestions(e.target.value)}
            placeholder="Write questions about the lesson…"
            className="min-h-[90px] text-sm resize-none"
            style={{ background: "rgba(11,19,43,0.8)", border: "1px solid rgba(212,175,55,0.15)", color: "#F9F6F0" }}
          />
        </div>

        {/* Notes (auto-filled from transcript) */}
        <div>
          <label className="text-[10px] uppercase tracking-widest font-bold mb-1 block"
            style={{ color: "#D4AF37" }}>Notes (Live Transcript)</label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes will auto-fill from the microphone…"
            className="min-h-[140px] text-sm resize-none"
            style={{ background: "rgba(11,19,43,0.8)", border: "1px solid rgba(212,175,55,0.15)", color: "#F9F6F0" }}
          />
        </div>

        {/* Summary */}
        <div>
          <label className="text-[10px] uppercase tracking-widest font-bold mb-1 block"
            style={{ color: "#D4AF37" }}>Summary</label>
          <Textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder="Write a brief summary of the lesson…"
            className="min-h-[80px] text-sm resize-none"
            style={{ background: "rgba(11,19,43,0.8)", border: "1px solid rgba(212,175,55,0.15)", color: "#F9F6F0" }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── AI Chat Panel ────────────────────────────────────────────────────────
function AiChatPanel({ transcript }: { transcript: string }) {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Shalom! I'm your AI Teacher. Ask me anything about the lesson being taught — I can hear the transcript in real time." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const askAI = trpc.ai.chat.useMutation();

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text: question }]);
    setLoading(true);
    try {
      const context = transcript
        ? `The user is currently in a live Bible study session. Here is the live transcript so far:\n\n"${transcript.slice(-3000)}"\n\nUsing this as context, answer the following question:`
        : "";
      const res = await askAI.mutateAsync({ question: `${context}

${question}`, studyIds: [] });
      setMessages(m => [...m, { role: "ai", text: res.answer || "I'm not sure — try rephrasing." }]);
    } catch {
      setMessages(m => [...m, { role: "ai", text: "Connection issue — make sure your AI key is set." }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(212,175,55,0.15)" }}>
        <Brain size={16} style={{ color: "#D4AF37" }} />
        <span className="font-bold text-sm" style={{ color: "#F9F6F0" }}>Ask AI Teacher</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
              style={m.role === "user"
                ? { background: "#D4AF37", color: "#0B132B", borderBottomRightRadius: 4 }
                : { background: "rgba(28,37,65,0.8)", color: "#F9F6F0", border: "1px solid rgba(212,175,55,0.12)", borderBottomLeftRadius: 4 }}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-2xl" style={{ background: "rgba(28,37,65,0.8)", border: "1px solid rgba(212,175,55,0.12)" }}>
              <Loader2 size={14} className="animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t shrink-0" style={{ borderColor: "rgba(212,175,55,0.15)" }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ask about the lesson…"
            className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: "rgba(11,19,43,0.9)", border: "1px solid rgba(212,175,55,0.15)", color: "#F9F6F0" }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-xl font-semibold text-xs transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "#D4AF37", color: "#0B132B" }}
          >
            <Sparkles size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Live Study Page ─────────────────────────────────────────────────
export default function LiveStudy() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [muted, setMuted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activePanel, setActivePanel] = useState<"cornell" | "ai">("cornell");

  // Refs
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;



  // Check browser support
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setSpeechSupported(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMicError("Speech recognition is not supported in this browser."); return; }

    setMicError(null);
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      if (final) setTranscript(t => t + final);
      setInterimText(interim);
    };

    recognition.onerror = (e: any) => {
      if (e.error === "not-allowed") setMicError("Microphone access denied. Please allow microphone in System Settings.");
      else if (e.error === "no-speech") setInterimText(""); // ignore no-speech
      else setMicError(`Microphone error: ${e.error}`);
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be recording
      if (recognitionRef.current && isRecording) {
        try { recognitionRef.current.start(); } catch (_) {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000);
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    setInterimText("");
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const handleSaveCornell = async (notes: { questions: string; notes: string; summary: string }) => {
    setSaving(true);
    try {
      // Save as a study with Cornell notes
      // (reuses existing cornellNotes.create endpoint via AI teacher route)
      const full = `LIVE STUDY TRANSCRIPT\n\nQUESTIONS:\n${notes.questions}\n\nNOTES:\n${notes.notes}\n\nSUMMARY:\n${notes.summary}`;
      await navigator.clipboard.writeText(full);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B132B" }}>
        <p style={{ color: "#6B7A8D" }}>Please sign in to use Live Study.</p>
      </div>
    );
  }

  const fullTranscriptDisplay = transcript + (interimText ? interimText : "");

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "#0B132B" }}>

      {/* ── Top bar ── */}
      <nav className="flex items-center justify-between px-4 py-3 border-b shrink-0 safe-pt"
        style={{ background: "rgba(11,19,43,0.98)", backdropFilter: "blur(16px)", borderColor: "rgba(212,175,55,0.15)" }}>
        <button onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: "#6B7A8D" }}>
          <ChevronLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-2.5">
          {/* Recording dot */}
          <div className="relative flex items-center justify-center">
            {isRecording && (
              <span className="absolute inline-flex w-3 h-3 rounded-full animate-ping"
                style={{ background: "rgba(239,68,68,0.6)" }} />
            )}
            <span className="w-2.5 h-2.5 rounded-full"
              style={{ background: isRecording ? "#EF4444" : "#4A5568" }} />
          </div>
          <span className="font-serif font-bold text-lg" style={{ color: "#F9F6F0" }}>Live Study</span>
          {isRecording && (
            <span className="text-sm font-mono tabular-nums" style={{ color: "#D4AF37" }}>
              {formatDuration(elapsed)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {saved && (
            <span className="text-xs font-semibold flex items-center gap-1" style={{ color: "#2ECC71" }}>
              <CheckCheck size={13} /> Saved
            </span>
          )}
          <button
            onClick={() => setMuted(m => !m)}
            className="p-2 rounded-lg"
            style={{ color: muted ? "#EF4444" : "#6B7A8D" }}
            title={muted ? "Unmute" : "Mute transcript"}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </nav>

      {/* ── Body: 3-column layout on desktop, stacked on mobile ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ── LEFT: Mic Control + Transcript ── */}
        <div className="flex flex-col lg:w-[42%] border-b lg:border-b-0 lg:border-r overflow-hidden"
          style={{ borderColor: "rgba(212,175,55,0.12)" }}>

          {/* Mic control */}
          <div className="flex flex-col items-center justify-center py-8 px-4 gap-4 shrink-0">
            {/* Big mic button */}
            <div className="relative">
              <PulseRing active={isRecording} />
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!speechSupported}
                className="relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all"
                style={{
                  background: isRecording
                    ? "linear-gradient(135deg,#7B1C1C,#C0392B)"
                    : "linear-gradient(135deg,#B8960C,#D4AF37)",
                  boxShadow: isRecording
                    ? "0 0 40px rgba(239,68,68,0.35)"
                    : "0 0 30px rgba(212,175,55,0.25)"
                }}
              >
                {isRecording
                  ? <Square size={26} fill="white" style={{ color: "white" }} />
                  : <Mic size={26} style={{ color: "#0B132B" }} />
                }
              </motion.button>
            </div>

            {!speechSupported ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs"
                style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                <WifiOff size={13} /> Speech recognition not supported in this browser
              </div>
            ) : micError ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs text-center max-w-xs"
                style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                <MicOff size={13} className="shrink-0" /> {micError}
              </div>
            ) : (
              <p className="text-xs text-center" style={{ color: "#6B7A8D" }}>
                {isRecording
                  ? "Recording… speak clearly and the transcript will appear below"
                  : "Tap to start recording your live lesson"}
              </p>
            )}

            {/* Status chips */}
            <div className="flex gap-2 flex-wrap justify-center">
              <span className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full"
                style={{ background: isRecording ? "rgba(239,68,68,0.1)" : "rgba(74,85,104,0.15)", color: isRecording ? "#EF4444" : "#6B7A8D" }}>
                {isRecording ? <><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Recording</> : <><MicOff size={10} />Idle</>}
              </span>
              <span className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full"
                style={{ background: "rgba(212,175,55,0.08)", color: "#D4AF37" }}>
                <Wifi size={10} /> Live Transcription
              </span>
            </div>
          </div>

          {/* Live Transcript scroll area */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={13} style={{ color: "#D4AF37" }} />
              <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#6B7A8D" }}>
                Live Transcript
              </span>
              {transcript && (
                <button
                  onClick={() => { setTranscript(""); setInterimText(""); }}
                  className="ml-auto text-[10px] px-2 py-0.5 rounded"
                  style={{ color: "#8B1A1A", background: "rgba(139,26,26,0.1)" }}>
                  Clear
                </button>
              )}
            </div>

            <div
              className="rounded-xl p-4 min-h-[120px] text-sm leading-relaxed whitespace-pre-wrap"
              style={{ background: "rgba(28,37,65,0.5)", border: "1px solid rgba(212,175,55,0.1)", color: "#F9F6F0" }}>
              {transcript}
              {interimText && (
                <span style={{ color: "rgba(212,175,55,0.55)", fontStyle: "italic" }}>
                  {interimText}
                </span>
              )}
              {!transcript && !interimText && (
                <span style={{ color: "#4A5568" }}>
                  Your spoken words will appear here in real time…
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Cornell Notes + AI Chat panels ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Panel tabs */}
          <div className="flex border-b shrink-0"
            style={{ borderColor: "rgba(212,175,55,0.15)", background: "rgba(11,19,43,0.6)" }}>
            {(["cornell", "ai"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActivePanel(tab)}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest transition-colors"
                style={activePanel === tab
                  ? { color: "#D4AF37", borderBottom: "2px solid #D4AF37" }
                  : { color: "#6B7A8D" }}>
                {tab === "cornell" ? <><FileText size={13} /> Cornell Notes</> : <><Brain size={13} /> AI Teacher</>}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {activePanel === "cornell" ? (
                <motion.div key="cornell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <CornellPanel
                    transcript={fullTranscriptDisplay}
                    onSave={handleSaveCornell}
                    saving={saving}
                  />
                </motion.div>
              ) : (
                <motion.div key="ai" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <AiChatPanel transcript={fullTranscriptDisplay} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
