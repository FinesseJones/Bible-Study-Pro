import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, X, Send, Loader2, Minimize2, Maximize2, Sparkles, BookOpen, Cloud, Mic, Edit3, RefreshCw, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_ACTIONS = [
  { label: "Study Latest Lesson", icon: Sparkles, prompt: "Find and open the newest Sabbath lesson in Cornell Notes." },
  { label: "Open Scripture Vault", icon: Cloud, prompt: "Open the Scripture Vault so I can browse my PDFs." },
  { label: "Start Live Study", icon: Mic, prompt: "Open Live Study so I can transcribe my class." },
  { label: "Create Cornell Note", icon: Edit3, prompt: "Create a Cornell note on the Feast of Unleavened Bread from Leviticus 23." },
  { label: "Sync All Lessons", icon: RefreshCw, prompt: "Sync all my YouTube and Google Drive lessons." },
];

export default function AIAssistantOverlay() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", content: data.answer }]);
    }
  });

  if (!isAuthenticated) return null;

  const handleSendPrompt = async (textToSend: string) => {
    if (!textToSend.trim()) return;
    const userMsg = textToSend.trim();
    setQuestion("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setStreamingContent("");
    setIsStreaming(true);

    const preferredAgent = (localStorage.getItem("preferred_theological_agent") as "local" | "vps" | "openrouter") || "local";

    try {
      const response = await fetch(`/api/ai/stream?q=${encodeURIComponent(userMsg)}&userId=${user?.id}&agent=${preferredAgent}`);
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
            }
          } catch {
            // Skip malformed
          }
        }
      }

      setMessages(prev => [...prev, { role: "assistant", content: fullContent }]);
      setStreamingContent("");
    } catch {
      chatMutation.mutate({ question: userMsg, agent: preferredAgent });
    } finally {
      setIsStreaming(false);
    }
  };

  /**
   * Renders AI message text and parses any interactive [[NAVIGATE:path:label]] tags.
   */
  const renderMessageContent = (content: string) => {
    const navTagRegex = /\[\[NAVIGATE:(.*?):(.*?)\]\]/g;
    const parts: any[] = [];
    let lastIndex = 0;
    let match;

    while ((match = navTagRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }
      const path = match[1];
      const label = match[2];
      parts.push(
        <Button
          key={match.index}
          size="sm"
          onClick={() => {
            setLocation(path);
            setIsOpen(false);
          }}
          className="my-2 flex items-center gap-2 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B132B] font-bold text-xs shadow-md"
        >
          <ExternalLink size={13} />
          {label}
        </Button>
      );
      lastIndex = navTagRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return (
      <div className="whitespace-pre-wrap leading-relaxed">
        {parts.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : p))}
      </div>
    );
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100]">
      <AnimatePresence>
        {!isOpen ? (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="w-14 h-14 rounded-full shadow-2xl flex items-center justify-center group relative cursor-pointer"
            style={{ 
              background: "linear-gradient(135deg, #D4AF37 0%, #B8860B 100%)",
              boxShadow: "0 8px 32px rgba(212,175,55,0.4)"
            }}
          >
            <Brain className="w-7 h-7 text-[#0B132B] group-hover:scale-110 transition-transform" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
          </motion.button>
        ) : (
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.9 }}
            className={`flex flex-col shadow-2xl rounded-2xl overflow-hidden border border-[#D4AF37]/30 ${isMinimized ? 'h-14 w-72' : 'h-[560px] w-[380px] sm:w-[420px]'}`}
            style={{ background: "#0B132B" }}
          >
            {/* Header */}
            <div className="p-3 flex items-center justify-between border-b border-[#D4AF37]/20" style={{ background: "rgba(212,175,55,0.1)" }}>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#D4AF37]/20">
                  <Brain className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <div>
                  <span className="font-serif font-bold text-sm text-[#F9F6F0]">AI Teacher & Navigator</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] text-[#6B7A8D]">Active Agent</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && !isMinimized && (
                  <button 
                    onClick={() => setMessages([])} 
                    title="Clear Chat"
                    className="p-1.5 hover:bg-white/10 rounded text-[#6B7A8D] hover:text-[#D4AF37] transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                <button onClick={() => setIsMinimized(!isMinimized)} className="p-1.5 hover:bg-white/10 rounded text-[#6B7A8D] hover:text-[#D4AF37] transition-colors">
                  {isMinimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
                </button>
                <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/10 rounded text-[#6B7A8D] hover:text-[#D4AF37] transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Chat Message History */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 && (
                    <div className="text-center py-6 space-y-4">
                      <Brain className="w-10 h-10 text-[#D4AF37]/30 mx-auto" />
                      <div>
                        <p className="font-bold text-xs text-[#F9F6F0]">How can I help your study today?</p>
                        <p className="text-[11px] text-[#6B7A8D] mt-1 max-w-[280px] mx-auto">
                          Ask theological questions, open any screen or lesson, build notes, or sync your library.
                        </p>
                      </div>

                      {/* Quick Action Chips */}
                      <div className="flex flex-col gap-1.5 pt-2">
                        {QUICK_ACTIONS.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendPrompt(item.prompt)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10 text-left transition-all text-xs text-[#F9F6F0] group"
                          >
                            <item.icon className="w-3.5 h-3.5 text-[#D4AF37] group-hover:scale-110 transition-transform shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[88%] p-3 rounded-xl text-xs ${
                        m.role === 'user' 
                          ? 'bg-[#D4AF37] text-[#0B132B] font-medium rounded-tr-none shadow-md' 
                          : 'bg-white/5 text-[#F9F6F0] border border-white/10 rounded-tl-none shadow-sm'
                      }`}>
                        {m.role === "assistant" ? renderMessageContent(m.content) : m.content}
                      </div>
                    </div>
                  ))}

                  {streamingContent && (
                    <div className="flex justify-start">
                      <div className="max-w-[88%] p-3 rounded-xl text-xs bg-white/5 text-[#F9F6F0] border border-white/10 rounded-tl-none">
                        {renderMessageContent(streamingContent)}
                        <span className="inline-block w-1.5 h-3.5 bg-[#D4AF37] ml-1 animate-pulse" />
                      </div>
                    </div>
                  )}

                  {(chatMutation.isPending || (isStreaming && !streamingContent)) && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 p-3 rounded-xl rounded-tl-none flex items-center gap-2 border border-white/10">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />
                        <span className="text-xs text-[#6B7A8D]">Teacher is searching and acting...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Area */}
                <div className="p-3 border-t border-white/10 bg-[#0B132B]">
                  <form 
                    onSubmit={(e) => { e.preventDefault(); handleSendPrompt(question); }}
                    className="flex gap-2"
                  >
                    <Input
                      placeholder="Ask anything or say 'open vault', 'create note'..."
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      className="h-10 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                    />
                    <Button 
                      type="submit" 
                      disabled={chatMutation.isPending || isStreaming || !question.trim()}
                      className="h-10 w-10 p-0 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B132B] rounded-xl shrink-0"
                    >
                      {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </Button>
                  </form>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
