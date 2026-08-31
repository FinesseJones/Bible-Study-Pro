import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Loader2, Brain, Send, User as UserIcon, Bot, BookOpen, Edit3,
  MessageSquare, Trash2, Plus, Clock, ChevronRight, X, Upload, FileText
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import CornellNotes from "./CornellNotes";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";


type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

export default function Assistant() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [studyId, setStudyId] = useState<number | null>(null);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Shalom! I am your Bible Study Pro AI Teacher, trained on IOG doctrine and scripture. Select a teaching or ask any theological question grounded in the King James Version.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadedPdfName, setUploadedPdfName] = useState<string | null>(null);

  const { data: studies = [] } = trpc.studies.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: pdfs = [] } = trpc.pdfs.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: conversations = [], refetch: refetchConversations } = trpc.conversations.list.useQuery(
    { studyId: studyId ?? undefined },
    { enabled: isAuthenticated }
  );

  const saveConversation = trpc.conversations.save.useMutation({
    onSuccess: (res) => {
      if (!activeConvId && res?.id) {
        setActiveConvId(res.id);
      }
      refetchConversations();
    },
  });

  const deleteConversation = trpc.conversations.delete.useMutation({
    onSuccess: () => {
      refetchConversations();
      toast.success("Conversation deleted.");
    },
  });

  const createPdf = trpc.pdfs.create.useMutation({
    onSuccess: (res) => {
      setUploadingPdf(false);
      toast.success(`"${uploadedPdfName}" uploaded — AI Teacher now has access!`);
    },
    onError: () => {
      setUploadingPdf(false);
      toast.error("PDF upload failed. Please try again.");
    }
  });

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    setUploadedPdfName(file.name);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const content = ev.target?.result as string;
        await createPdf.mutateAsync({
          fileName: file.name,
          extractedTitle: file.name.replace(/\.[^.]+$/, ""),
          fileKey: `local/${Date.now()}-${file.name}`,
          fileUrl: URL.createObjectURL(file),
          fileSize: file.size,
          textContent: content?.slice(0, 50000) ?? "",
          category: "AI Upload",
        });
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `📄 I've received **${file.name}**. I can now answer questions about it — what would you like to know?`,
          timestamp: new Date().toISOString(),
        }]);
      };
      reader.readAsText(file);
    } catch (err) {
      console.error("Upload failed", err);
      setUploadingPdf(false);
    }
    // Reset input
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Debounced auto-save after each message exchange
  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const userMessages = messages.filter((m) => m.role === "user");
      if (userMessages.length === 0) return;
      saveConversation.mutate({
        id: activeConvId ?? undefined,
        studyId: studyId ?? undefined,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
      });
    }, 2000);
  }, [messages, activeConvId, studyId]);

  useEffect(() => {
    debouncedSave();
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [messages]);

  const handleLoadConversation = (conv: any) => {
    setActiveConvId(conv.id);
    const msgs: Message[] = Array.isArray(conv.messages) ? conv.messages : JSON.parse(conv.messages || "[]");
    setMessages(msgs);
    setStudyId(conv.studyId ?? null);
    toast.info("Conversation loaded.");
  };

  const handleNewConversation = () => {
    setActiveConvId(null);
    setStudyId(null);
    setMessages([{
      role: "assistant",
      content: "Starting a new session. What would you like to study today?",
      timestamp: new Date().toISOString(),
    }]);
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    const newUserMsg: Message = { role: "user", content: userMessage, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, newUserMsg]);
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    try {
      let url = `/api/ai/stream?q=${encodeURIComponent(userMessage)}&userId=${user?.id}`;
      if (studyId) url += `&studyId=${studyId}`;
      const response = await fetch(url);
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
            if (json.token) { fullContent += json.token; setStreamingContent(fullContent); }
          } catch { /* skip */ }
        }
      }

      const assistantMsg: Message = { role: "assistant", content: fullContent, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent("");
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I had an error connecting to the AI engine.", timestamp: new Date().toISOString() }]);
    } finally {
      setIsStreaming(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B132B]">
        <p className="text-[#6B7A8D]">Please sign in to use the AI Assistant</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0B132B]">
      {/* Header */}
      <div className="border-b border-[#D4AF37]/15 bg-[#0B132B]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="container py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} style={{ color: "#D4AF37" }}>
              <ChevronRight className="rotate-180 w-5 h-5" />
            </Button>
            <div className="w-9 h-9 rounded-full bg-[#D4AF37]/15 flex items-center justify-center">
              <Brain className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-serif text-[#F9F6F0]">Ask The Teacher AI</h1>
              <p className="text-[10px] text-[#6B7A8D] uppercase tracking-wider">IOG Knowledge Base • KJV Scripture</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6B7A8D] hidden sm:block">{pdfs.length} documents · {studies.length} studies</span>
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ color: "#D4AF37" }}>
              <MessageSquare className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Chat History */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: isMobile ? "100%" : 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={cn(
                "border-r border-[#D4AF37]/10 flex flex-col overflow-hidden flex-shrink-0 bg-[#1C2541]/95 backdrop-blur-md",
                isMobile ? "fixed inset-y-0 left-0 z-50 w-full sm:w-[260px] bg-[#0B132B]" : "relative"
              )}
            >
              <div className="p-3 flex items-center justify-between border-b border-[#D4AF37]/10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B7A8D]">Chat History</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleNewConversation}
                    className="bg-[#D4AF37] text-[#0B132B] h-7 px-2 text-xs font-bold touch-target"
                  >
                    <Plus className="w-3 h-3 mr-1" /> New
                  </Button>
                  {isMobile && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-[#D4AF37] touch-target" onClick={() => setSidebarOpen(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {conversations.length === 0 ? (
                  <div className="text-center py-8 space-y-2 opacity-50">
                    <MessageSquare className="w-8 h-8 mx-auto text-[#D4AF37]" />
                    <p className="text-xs text-[#6B7A8D]">No saved conversations yet</p>
                  </div>
                ) : (
                  conversations.map((conv: any) => {
                    const msgs: Message[] = Array.isArray(conv.messages) ? conv.messages : [];
                    const preview = msgs.find((m) => m.role === "user")?.content?.slice(0, 60) || "New conversation";
                    const ts = new Date(conv.updatedAt);
                    const isActive = conv.id === activeConvId;
                    return (
                      <motion.button
                        key={conv.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => handleLoadConversation(conv)}
                        className={`w-full text-left p-2.5 rounded-lg transition-all group ${
                          isActive
                            ? "bg-[#D4AF37]/20 border border-[#D4AF37]/40"
                            : "hover:bg-[#1C2541]/60 border border-transparent"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 overflow-hidden">
                            <p className={`text-xs font-semibold truncate ${isActive ? "text-[#D4AF37]" : "text-[#F9F6F0]"}`}>
                              {preview}
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              <Clock className="w-2.5 h-2.5 text-[#6B7A8D]" />
                              <span className="text-[10px] text-[#6B7A8D]">
                                {ts.toLocaleDateString()} · {msgs.length} msgs
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteConversation.mutate({ id: conv.id }); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/30 text-red-400 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </motion.button>
                    );
                  })
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <Tabs defaultValue="chat" className="flex flex-col flex-1 overflow-hidden">
            <div className="px-4 pt-3 border-b border-[#D4AF37]/10">
              <TabsList className="bg-[#1C2541]/60 h-8">
                <TabsTrigger value="chat" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B132B] text-xs">
                  <Brain className="w-3 h-3 mr-1" /> Ask Teacher
                </TabsTrigger>
                <TabsTrigger value="workspace" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B132B] text-xs">
                  <Edit3 className="w-3 h-3 mr-1" /> Cornell Workspace
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="chat" className="flex-1 flex flex-col mt-0 overflow-hidden">
              {/* Context selector + PDF upload */}
              <div className="px-4 py-2 border-b border-[#D4AF37]/10 bg-[#1C2541]/20 space-y-2">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />
                  <select
                    value={studyId || ""}
                    onChange={(e) => setStudyId(e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 text-xs px-2 py-1.5 border border-[#D4AF37]/20 rounded-lg bg-[#0B132B] text-[#F9F6F0] focus:ring-1 focus:ring-[#D4AF37] outline-none"
                  >
                    <option value="">Asking across all teachings & knowledge base...</option>
                    {studies.map((study) => (
                      <option key={study.id} value={study.id}>
                        📖 Focus on: {study.title}
                      </option>
                    ))}
                  </select>
                  {studyId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setLocation(`/notes?studyId=${studyId}`)}
                      className="text-[#D4AF37] text-xs h-7"
                    >
                      <Edit3 className="w-3 h-3 mr-1" /> Take Notes
                    </Button>
                  )}
                </div>
                {/* PDF Upload for AI */}
                <div className="flex items-center gap-2">
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,.txt,.doc,.docx"
                    className="hidden"
                    onChange={handlePdfUpload}
                  />
                  <button
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={uploadingPdf}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all border border-[#D4AF37]/30 hover:bg-[#D4AF37]/10"
                    style={{ color: "#D4AF37" }}
                  >
                    {uploadingPdf ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    Upload PDF for AI to read
                  </button>
                  {uploadedPdfName && !uploadingPdf && (
                    <span className="text-[10px] text-green-400 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {uploadedPdfName} indexed
                    </span>
                  )}
                </div>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      msg.role === "user" ? "bg-[#D4AF37] text-[#0B132B]" : "bg-[#1C2541] border border-[#D4AF37]/20"
                    }`}>
                      {msg.role === "user"
                        ? <span className="text-xs font-bold">{user?.name?.[0] || "U"}</span>
                        : <Bot className="w-4 h-4 text-[#D4AF37]" />
                      }
                    </div>
                    <div className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-[85%]`}>
                      {msg.timestamp && (
                        <span className="text-[10px] text-[#6B7A8D] mb-1">
                          {msg.role === "user" ? user?.name : "IOG AI Teacher"} · {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                      <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-[#D4AF37] text-[#0B132B] rounded-tr-none font-semibold"
                          : "bg-[#1C2541]/60 text-[#F9F6F0] border border-[#D4AF37]/10 rounded-tl-none"
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  </motion.div>
                ))}

                {streamingContent && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#1C2541] border border-[#D4AF37]/20 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div className="bg-[#1C2541]/60 text-[#F9F6F0] border border-[#D4AF37]/10 px-4 py-3 rounded-2xl rounded-tl-none max-w-[85%]">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap streaming-cursor">{streamingContent}</p>
                    </div>
                  </motion.div>
                )}

                {isStreaming && !streamingContent && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#1C2541] border border-[#D4AF37]/20 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div className="bg-[#1C2541]/60 border border-[#D4AF37]/10 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                      <span className="text-sm text-[#6B7A8D]">Searching scripture and history...</span>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input area */}
              <div className={cn("p-4 border-t border-[#D4AF37]/10 bg-[#0B132B]/95 backdrop-blur-sm sticky bottom-0 z-30", isMobile ? "pb-24" : "pb-4")}>
                <div className="flex gap-2 max-w-4xl mx-auto">
                  <Input
                    id="ai-teacher-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder={studyId ? "Ask about this teaching..." : "Ask a theological question grounded in KJV..."}
                    className="flex-1 bg-[#1C2541]/60 border-[#D4AF37]/20 text-[#F9F6F0] placeholder:text-[#6B7A8D] focus:ring-[#D4AF37] h-10"
                    disabled={isStreaming}
                  />
                  <Button
                    id="ai-teacher-send"
                    onClick={handleSend}
                    disabled={!input.trim() || isStreaming}
                    className="bg-[#D4AF37] text-[#0B132B] h-10 px-4 font-bold"
                  >
                    {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                {activeConvId && (
                  <p className="text-center text-[10px] text-[#6B7A8D] mt-2">
                    ✓ Auto-saving conversation #{activeConvId}
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="workspace" className="mt-0 flex-1 overflow-hidden">
              <Card className="shadow-md border-[#D4AF37]/10 overflow-hidden h-full rounded-none">
                <CornellNotes embedded={true} />
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
