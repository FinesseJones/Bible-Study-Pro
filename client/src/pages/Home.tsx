import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Search, BookOpen, Zap, Brain, Scroll, FileText, Edit3, Cloud, ChevronRight, Menu, Command, Sword, Upload, X, Mic, RefreshCw, Sparkles, Calendar } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { STUDY_PACKS } from "@shared/studyData";
import ImportLessonDialog from "@/components/ImportLessonDialog";
import SabbathLessonPdfModal from "@/components/SabbathLessonPdfModal";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const [selectedVideoStudy, setSelectedVideoStudy] = useState<any | null>(null);
  const [selectedPdfStudy, setSelectedPdfStudy] = useState<any | null>(null);
  const [activeFolder, setActiveFolder] = useState<any | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [showUploadSuccess, setShowUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const getYouTubeId = (url?: string | null) => {
    if (!url) return null;
    const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/);
    return match ? match[1] : null;
  };

  const handlePlayVideo = (study: any) => {
    if (!study.videoUrl) return;
    
    if (getYouTubeId(study.videoUrl)) {
      setSelectedVideoStudy(study);
    } else {
      if (study.videoUrl.includes("/folders/")) {
        setActiveFolder(study);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (study.videoUrl.includes("drive.google.com")) {
        setLocation(`/notes?studyId=${study.id}&mode=explore`);
      } else {
        window.open(study.videoUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const { data: studies = [], isLoading: studiesLoading, refetch: refetchStudies } = trpc.studies.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: linkedPdfs = [] } = trpc.pdfs.getByStudy.useQuery(
    { studyId: selectedVideoStudy?.id ?? 0 },
    { enabled: !!selectedVideoStudy }
  );

  // Global search also covers PDFs
  const { data: pdfSearchResults = [], refetch: refetchPdfs } = trpc.pdfs.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const [isSyncing, setIsSyncing] = useState(false);
  const syncMutation = trpc.studies.syncNow.useMutation({
    onSuccess: (data) => {
      setIsSyncing(false);
      refetchStudies();
      refetchPdfs();
      toast.success(data.message || "All lessons synchronized!");
    },
    onError: (err) => {
      setIsSyncing(false);
      toast.error("Sync failed: " + err.message);
    }
  });

  const handleSyncNow = () => {
    setIsSyncing(true);
    toast.info("Checking YouTube & Google Drive for newest lessons...");
    syncMutation.mutate();
  };

  const formatStudyDate = (dateVal?: string | Date | null) => {
    if (!dateVal) return "";
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  const createPdf = trpc.pdfs.create.useMutation({
    onSuccess: () => {
      setUploadingPdf(false);
      setShowUploadSuccess(true);
      setTimeout(() => setShowUploadSuccess(false), 3000);
      toast.success("PDF uploaded! The AI Teacher will index it now.");
    },
    onError: () => {
      setUploadingPdf(false);
      toast.error("Upload failed. Please try again.");
    }
  });

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
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
          category: "Library Upload",
        });
      };
      reader.readAsText(file);
    } catch (err) {
      console.error("Upload failed", err);
      setUploadingPdf(false);
    }
  };

  const categories = Array.from(new Set(studies.map(s => s.category).filter(Boolean))) as string[];

  // Strict chronological sort for all studies (newest broadcast date first)
  const sortedStudies = [...studies].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  // Top 8 newest video lessons across all campuses (newest broadcast first)
  const latestLessons = sortedStudies
    .filter(s => !!s.videoUrl && (s.videoUrl.includes("youtube.com") || s.videoUrl.includes("youtu.be")))
    .slice(0, 8);

  const filteredStudies = sortedStudies.filter(study => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      study.title.toLowerCase().includes(q) ||
      study.topic?.toLowerCase().includes(q) ||
      study.description?.toLowerCase().includes(q) ||
      study.category?.toLowerCase().includes(q) ||
      study.summary?.toLowerCase().includes(q);
    
    const matchesCategory = !selectedCategory || study.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // PDFs that match global search
  const filteredPdfs = searchQuery.trim().length > 1
    ? pdfSearchResults.filter(p => {
        const q = searchQuery.toLowerCase();
        return (
          p.fileName?.toLowerCase().includes(q) ||
          (p as any).extractedTitle?.toLowerCase().includes(q) ||
          (p as any).textContent?.toLowerCase().includes(q)
        );
      })
    : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
        <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-accent" />
              <span className="text-xl font-bold">Bible Study Pro</span>
            </div>
            <Button onClick={() => window.location.href = getLoginUrl()}>
              Sign In
            </Button>
          </div>
        </nav>

        <div className="container py-20 md:py-32">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight animate-gradient">
                Your Comprehensive
                <span className="block text-accent mt-2">Bible Study Platform</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Organize, search, and learn from theological teachings with an elegant interface powered by AI assistance.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Button 
                size="lg" 
                onClick={() => window.location.href = getLoginUrl()}
                className="gradient-accent text-accent-foreground"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-card border-t border-border">
          <div className="container py-20">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold">Netflix-Style Browse</h3>
                <p className="text-muted-foreground">Discover teachings with beautiful thumbnail grids.</p>
              </div>
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Search className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold">Full-Text PDF Search</h3>
                <p className="text-muted-foreground">Search inside PDFs with automatic text extraction.</p>
              </div>
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Brain className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold">AI Assistant</h3>
                <p className="text-muted-foreground">Ask questions and get intelligent streaming answers.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { label: "Study Live", icon: Mic, path: "/notes" },
    { label: "History", icon: Scroll, path: "/history" },
    { label: "Iron Sharpen Iron", icon: Sword, path: "/iron" },
    { label: "Study Journal", icon: Edit3, path: "/journal" },
    { label: "Vault", icon: FileText, path: "/vault" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b sticky top-0 z-50 shadow-lg" style={{ background: "rgba(11,19,43,0.95)", backdropFilter: "blur(12px)", borderColor: "rgba(212,175,55,0.15)" }}>
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden text-[#D4AF37]">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-[#0B132B] border-[#D4AF37]/20">
                <div className="flex flex-col gap-2 mt-8">
                  {navItems.map((item) => (
                    <Button
                      key={item.label}
                      variant="ghost"
                      className="justify-start gap-3 text-[#D4AF37]"
                      onClick={() => { setLocation(item.path); setMobileMenuOpen(false); }}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Button>
                  ))}
                  <Button
                    variant="default"
                    className="mt-4 bg-[#D4AF37] text-[#0B132B] gap-2"
                    onClick={() => { window.open("https://app.logos.com/books/LLS%3AKJV1900/references/bible%2Bkjv.64.1.1", "_blank"); setMobileMenuOpen(false); }}
                  >
                    <BookOpen className="w-4 h-4" />
                    Logos Bible
                  </Button>
                  <Button
                    variant="default"
                    className="bg-[#D4AF37] text-[#0B132B] gap-2"
                    onClick={() => { setLocation("/assistant"); setMobileMenuOpen(false); }}
                  >
                    <Brain className="w-4 h-4" />
                    Ask The Teacher
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            <BookOpen className="w-6 h-6" style={{ color: "#D4AF37" }} />
            <span className="text-xl font-bold font-serif hidden sm:block" style={{ color: "#F9F6F0" }}>Bible Study Pro</span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 hidden md:flex"
              style={{ color: "#D4AF37" }}
              onClick={() => setCommandOpen(true)}
            >
              <Command className="w-4 h-4" />
              <kbd className="hidden lg:inline-flex items-center gap-0.5 text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⌘K</kbd>
            </Button>

            {navItems.map((item) => (
              <Button
                key={item.label}
                variant="ghost"
                size="sm"
                className="gap-2 hidden md:flex"
                style={{ color: "#D4AF37" }}
                onClick={() => setLocation(item.path)}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden lg:inline">{item.label}</span>
              </Button>
            ))}

            <Button
              variant="default"
              size="sm"
              className="gap-2 hidden sm:flex"
              style={{ background: "#D4AF37", color: "#0B132B" }}
              onClick={() => window.open("https://app.logos.com/books/LLS%3AKJV1900/references/bible%2Bkjv.64.1.1", "_blank")}
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden xl:inline">Logos</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              className="gap-2"
              style={{ background: "#D4AF37", color: "#0B132B" }}
              onClick={() => setLocation("/assistant")}
            >
              <Brain className="w-4 h-4" />
              <span className="hidden sm:inline">Ask Teacher</span>
            </Button>

            <span className="text-sm hidden md:block" style={{ color: "#6B7A8D" }}>{user?.name}</span>
          </div>
        </div>
      </nav>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search studies, jump to notes, open Logos..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => { setLocation("/notes"); setCommandOpen(false); }}>
              <Edit3 className="w-4 h-4 mr-2" />
              Cornell Notes
            </CommandItem>
            <CommandItem onSelect={() => { setLocation("/assistant"); setCommandOpen(false); }}>
              <Brain className="w-4 h-4 mr-2" />
              AI Assistant
            </CommandItem>
            <CommandItem onSelect={() => { setLocation("/iron"); setCommandOpen(false); }}>
              <Sword className="w-4 h-4 mr-2" />
              Iron Sharpen Iron
            </CommandItem>
            <CommandItem onSelect={() => { setLocation("/journal"); setCommandOpen(false); }}>
              <Scroll className="w-4 h-4 mr-2" />
              Study Journal
            </CommandItem>
            <CommandItem onSelect={() => { setLocation("/vault"); setCommandOpen(false); }}>
              <Cloud className="w-4 h-4 mr-2" />
              PDF Vault
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Open Logos Bible">
            <CommandItem onSelect={() => { window.open("https://app.logos.com/books/LLS%3AKJV1900/references/bible%2Bkjv.64.1.1", "_blank"); setCommandOpen(false); }}>
              <BookOpen className="w-4 h-4 mr-2" />
              Logos Bible App
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Studies">
            {studies.slice(0, 10).map((study) => (
              <CommandItem
                key={study.id}
                onSelect={() => { setLocation(`/notes?studyId=${study.id}`); setCommandOpen(false); }}
              >
                <BookOpen className="w-4 h-4 mr-2" />
                {study.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <div className="container py-12 pb-24 safe-pb">
        {activeFolder ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <button onClick={() => setActiveFolder(null)} className="flex items-center gap-2 text-[#D4AF37] hover:underline mb-4">
              <ChevronRight size={16} className="rotate-180" /> Back to Library
            </button>
            <div className="flex items-center gap-4 border-b border-[#D4AF37]/20 pb-6">
              <div className="p-4 bg-[#D4AF37]/10 rounded-xl">
                <Cloud className="w-8 h-8 text-[#D4AF37]" />
              </div>
              <div>
                <h1 className="text-4xl font-bold font-serif text-[#F9F6F0]">{activeFolder.title}</h1>
                <p className="text-[#6B7A8D]">Internal Study Resource • {activeFolder.topic}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-6">
              {STUDY_PACKS[activeFolder.folderId] ? (
                STUDY_PACKS[activeFolder.folderId].map((lesson, i) => (
                  <Card key={i} className="p-6 bg-[#1C2541]/40 border-[#D4AF37]/10 hover:border-[#D4AF37]/40 transition-all group cursor-pointer"
                    onClick={() => setLocation(`/notes?mode=explore&lessonTitle=${encodeURIComponent(lesson.title)}&lessonUrl=${encodeURIComponent(lesson.video)}`)}>
                    <div className="flex items-start justify-between mb-4">
                      <FileText className="w-10 h-10 text-[#D4AF37]" />
                      <div className="px-2 py-1 bg-[#D4AF37]/10 rounded text-[10px] text-[#D4AF37] font-bold uppercase tracking-wider">PDF Lesson</div>
                    </div>
                    <h3 className="text-lg font-bold text-[#F9F6F0] mb-2 group-hover:text-[#D4AF37] transition-colors">{lesson.title}</h3>
                    <p className="text-sm text-[#6B7A8D] mb-4">Official IOG text lesson for your {lesson.topic || 'theological'} study.</p>
                    <Button className="w-full bg-[#D4AF37] text-[#0B132B] font-bold">Study Lesson</Button>
                  </Card>
                ))
              ) : (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-[#D4AF37]/20 rounded-2xl bg-[#1C2541]/20">
                  <Cloud className="w-12 h-12 text-[#D4AF37]/40 mx-auto mb-4" />
                  <h3 className="text-xl font-serif text-[#F9F6F0] mb-2">Folder Connected</h3>
                  <p className="text-[#6B7A8D] mb-6 max-w-md mx-auto">
                    Your Google Drive folder is synced. To study individual PDFs, use the <strong>Vault</strong> page.
                  </p>
                  <Button onClick={() => setLocation('/vault')} className="bg-[#D4AF37] text-[#0B132B] font-bold">
                    Open PDF Vault
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold mb-1">Welcome back, {(user?.name || 'Student').split(' ')[0]}</h1>
                <p className="text-muted-foreground">Continue your theological journey</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <ImportLessonDialog />

                <Button
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                  className="gap-2 border border-[#D4AF37]/40 text-[#D4AF37] bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 font-semibold"
                  variant="ghost"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-[#D4AF37]" : ""}`} />
                  {isSyncing ? "Syncing Lessons..." : "Sync Lessons"}
                </Button>

                {/* PDF Upload Button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.doc,.docx"
                  className="hidden"
                  onChange={handlePdfUpload}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPdf}
                  className="gap-2 border border-[#D4AF37]/40 text-[#D4AF37] bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 font-semibold"
                  variant="ghost"
                >
                  {uploadingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : showUploadSuccess ? (
                    <span className="text-green-400">✓ Uploaded!</span>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload PDF
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* ─────────── QUICK WORKSPACE HUB ─────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 py-4">
              <Card 
                onClick={() => setLocation("/notes")}
                className="p-4 bg-[#1C2541]/40 border border-[#D4AF37]/15 hover:border-[#D4AF37]/60 hover:shadow-lg hover:shadow-[#D4AF37]/5 transition-all duration-300 cursor-pointer group flex flex-col items-center text-center space-y-3"
              >
                <div className="p-3 bg-[#D4AF37]/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <Mic className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-[#F9F6F0] group-hover:text-[#D4AF37] transition-colors">Study Live</h3>
                  <p className="text-[10px] text-[#6B7A8D] leading-tight">Record, transcribe & take Cornell Notes</p>
                </div>
              </Card>

              <Card 
                onClick={() => setLocation("/assistant")}
                className="p-4 bg-[#1C2541]/40 border border-[#D4AF37]/15 hover:border-[#D4AF37]/60 hover:shadow-lg hover:shadow-[#D4AF37]/5 transition-all duration-300 cursor-pointer group flex flex-col items-center text-center space-y-3"
              >
                <div className="p-3 bg-[#D4AF37]/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <Brain className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-[#F9F6F0] group-hover:text-[#D4AF37] transition-colors">Ask Teacher</h3>
                  <p className="text-[10px] text-[#6B7A8D] leading-tight">Theological chat & scripture answers</p>
                </div>
              </Card>

              <Card 
                onClick={() => setLocation("/vault")}
                className="p-4 bg-[#1C2541]/40 border border-[#D4AF37]/15 hover:border-[#D4AF37]/60 hover:shadow-lg hover:shadow-[#D4AF37]/5 transition-all duration-300 cursor-pointer group flex flex-col items-center text-center space-y-3"
              >
                <div className="p-3 bg-[#D4AF37]/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <FileText className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-[#F9F6F0] group-hover:text-[#D4AF37] transition-colors">Scripture Vault</h3>
                  <p className="text-[10px] text-[#6B7A8D] leading-tight">Upload PDFs & search your library</p>
                </div>
              </Card>

              <Card 
                onClick={() => setLocation("/history")}
                className="p-4 bg-[#1C2541]/40 border border-[#D4AF37]/15 hover:border-[#D4AF37]/60 hover:shadow-lg hover:shadow-[#D4AF37]/5 transition-all duration-300 cursor-pointer group flex flex-col items-center text-center space-y-3"
              >
                <div className="p-3 bg-[#D4AF37]/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <Scroll className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-[#F9F6F0] group-hover:text-[#D4AF37] transition-colors">Heritage & History</h3>
                  <p className="text-[10px] text-[#6B7A8D] leading-tight">Explore timelines & historical records</p>
                </div>
              </Card>

              <Card 
                onClick={() => setLocation("/iron")}
                className="p-4 bg-[#1C2541]/40 border border-[#D4AF37]/15 hover:border-[#D4AF37]/60 hover:shadow-lg hover:shadow-[#D4AF37]/5 transition-all duration-300 cursor-pointer group flex flex-col items-center text-center space-y-3"
              >
                <div className="p-3 bg-[#D4AF37]/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <Sword className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-[#F9F6F0] group-hover:text-[#D4AF37] transition-colors">Iron Sharpen Iron</h3>
                  <p className="text-[10px] text-[#6B7A8D] leading-tight">Interactive theological debates</p>
                </div>
              </Card>

              <Card 
                onClick={() => setLocation("/journal")}
                className="p-4 bg-[#1C2541]/40 border border-[#D4AF37]/15 hover:border-[#D4AF37]/60 hover:shadow-lg hover:shadow-[#D4AF37]/5 transition-all duration-300 cursor-pointer group flex flex-col items-center text-center space-y-3"
              >
                <div className="p-3 bg-[#D4AF37]/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <Edit3 className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-[#F9F6F0] group-hover:text-[#D4AF37] transition-colors">Study Journal</h3>
                  <p className="text-[10px] text-[#6B7A8D] leading-tight">Save reflections & study diaries</p>
                </div>
              </Card>
            </div>

            {/* ─────────── GLOBAL SEARCH BAR ─────────── */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "#6B7A8D" }} />
              <Input
                id="global-search"
                placeholder="Search all studies, PDFs, topics, scriptures..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-12 h-12 text-base rounded-xl"
                style={{
                  background: "rgba(28,37,65,0.8)",
                  border: "1px solid rgba(212,175,55,0.25)",
                  color: "#F9F6F0",
                  boxShadow: searchQuery ? "0 0 0 2px rgba(212,175,55,0.3)" : undefined,
                }}
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7A8D] hover:text-[#D4AF37] transition-colors"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* PDF results when searching */}
            {searchQuery && filteredPdfs.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <h3 className="text-sm font-bold text-[#D4AF37] uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  PDF Matches ({filteredPdfs.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPdfs.slice(0, 6).map((pdf: any) => (
                    <Card
                      key={pdf.id}
                      className="p-4 bg-[#1C2541]/60 border-[#D4AF37]/20 hover:border-[#D4AF37]/60 cursor-pointer transition-all group"
                      onClick={() => setLocation(`/notes?mode=explore&lessonTitle=${encodeURIComponent(pdf.extractedTitle || pdf.fileName)}&lessonUrl=${encodeURIComponent(pdf.fileUrl)}`)}
                    >
                      <div className="flex items-start gap-3">
                        <FileText className="w-8 h-8 text-[#D4AF37] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-[#F9F6F0] group-hover:text-[#D4AF37] transition-colors truncate">
                            {pdf.extractedTitle || pdf.fileName}
                          </p>
                          <p className="text-xs text-[#6B7A8D] mt-1 truncate">
                            {pdf.category || "Document"}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      <div className="container py-8 pb-24 safe-pb">
        {/* Category filter pills */}
        {!activeFolder && !studiesLoading && categories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                !selectedCategory
                  ? "bg-[#D4AF37] text-[#0B132B]"
                  : "bg-[#1C2541] text-[#6B7A8D] hover:text-[#D4AF37] border border-[#D4AF37]/20"
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                  selectedCategory === cat
                    ? "bg-[#D4AF37] text-[#0B132B]"
                    : "bg-[#1C2541] text-[#6B7A8D] hover:text-[#D4AF37] border border-[#D4AF37]/20"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {!activeFolder && (
          studiesLoading ? (
            <div className="space-y-12">
              {[1, 2, 3].map((shelf) => (
                <div key={shelf} className="space-y-4">
                  <Skeleton className="h-6 w-48 bg-[#1C2541]" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((card) => (
                      <Card key={card} className="overflow-hidden bg-[#1C2541]/40 border-[#D4AF37]/10">
                        <Skeleton className="aspect-video bg-[#1C2541]" />
                        <div className="p-4 space-y-3">
                          <Skeleton className="h-4 w-3/4 bg-[#2A3A6E]" />
                          <Skeleton className="h-8 w-full bg-[#2A3A6E]" />
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : filteredStudies.length === 0 ? (
            <div className="text-center py-20 space-y-4">
              <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/50" />
              <h3 className="text-xl font-semibold">No studies found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? "Try adjusting your search" : "Start by adding your first study material"}
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold mb-6">
                {selectedCategory ? `${selectedCategory} Teachings` : "All Teachings"}
                <span className="text-muted-foreground text-lg ml-2">({filteredStudies.length})</span>
              </h2>

              <div className="space-y-12">
                {/* ─────────── LATEST BROADCASTS (THIS WEEK / NEWEST FIRST) ─────────── */}
                {!selectedCategory && !searchQuery && latestLessons.length > 0 && (
                  <div className="space-y-4 p-6 rounded-2xl border border-[#D4AF37]/25"
                    style={{ background: "linear-gradient(180deg, rgba(212,175,55,0.06) 0%, rgba(11,19,43,0.4) 100%)" }}>
                    <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                        <h3 className="text-xl font-bold font-serif text-[#F9F6F0]">Latest Sabbath Lessons & Broadcasts</h3>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] font-semibold border border-[#D4AF37]/30">
                        Newest Uploads
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-2">
                      {latestLessons.map((study) => (
                        <Card 
                          key={`latest-${study.id}`} 
                          className="group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[#D4AF37]/15 border-[#D4AF37]/20 hover:border-[#D4AF37]/50"
                          style={{ background: "rgba(28,37,65,0.6)" }}
                          onClick={() => handlePlayVideo(study)}
                        >
                          <div className="relative aspect-video bg-muted overflow-hidden">
                            {study.thumbnail ? (
                              <img 
                                src={study.thumbnail} 
                                alt={study.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  if (target.src.includes('hqdefault')) {
                                    target.src = target.src.replace('hqdefault', 'mqdefault');
                                  } else {
                                    target.src = "https://theisraelofgod.com/wp-content/uploads/2021/04/cropped-IOG-Logo-1-1.png";
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#D4AF37]/20 to-accent/5">
                                <BookOpen className="w-12 h-12 text-[#D4AF37]/50" />
                              </div>
                            )}
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[10px] font-semibold text-[#D4AF37] border border-[#D4AF37]/30">
                              {study.category}
                            </div>
                          </div>

                          <div className="p-4 space-y-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#D4AF37]">
                              <Calendar size={11} />
                              <span>{formatStudyDate(study.createdAt)}</span>
                            </div>
                            <h4 className="font-semibold line-clamp-2 text-[#F9F6F0] group-hover:text-[#D4AF37] transition-colors duration-200 text-sm">
                              {study.title}
                            </h4>
                            <div className="pt-2 flex items-center gap-1.5 flex-wrap">
                              <Button 
                                size="sm" 
                                className="flex-1 bg-[#D4AF37] text-[#0B132B] font-bold h-8 text-xs min-w-[70px]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePlayVideo(study);
                                }}
                              >
                                {study.videoUrl?.includes("/folders/") ? "Folder" : "Watch"}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="flex-1 border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-8 text-xs min-w-[70px]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLocation(`/notes?studyId=${study.id}`);
                                }}
                              >
                                Notes
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="border border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-8 px-2 text-xs"
                                title="Build & View Official Sabbath Lesson PDF"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPdfStudy(study);
                                }}
                              >
                                <FileText size={12} />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* ─────────── ALL CATEGORY SHELVES ─────────── */}
                {categories.map(category => {
                  const categoryStudies = filteredStudies
                    .filter(s => s.category === category)
                    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

                  if (categoryStudies.length === 0) return null;

                  return (
                    <div key={category} className="space-y-4">
                      <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-2">
                        <h3 className="text-xl font-bold font-serif text-[#F9F6F0]">{category}</h3>
                        <span className="text-sm text-[#6B7A8D]">{categoryStudies.length} items</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {categoryStudies.map((study) => (
                          <Card 
                            key={study.id} 
                            className="group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[#D4AF37]/10 border-[#D4AF37]/10"
                            style={{ background: "rgba(28,37,65,0.4)" }}
                            onClick={() => handlePlayVideo(study)}
                          >
                            <div className="relative aspect-video bg-muted overflow-hidden">
                              {study.thumbnail ? (
                                <img 
                                  src={study.thumbnail} 
                                  alt={study.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    if (target.src.includes('hqdefault')) {
                                      target.src = target.src.replace('hqdefault', 'mqdefault');
                                    } else {
                                      target.src = "https://theisraelofgod.com/wp-content/uploads/2021/04/cropped-IOG-Logo-1-1.png";
                                    }
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#D4AF37]/20 to-accent/5">
                                  <BookOpen className="w-12 h-12 text-[#D4AF37]/50" />
                                </div>
                              )}
                            </div>

                            <div className="p-4 space-y-2">
                              <div className="flex items-center gap-1.5 text-[10px] text-[#6B7A8D]">
                                <Calendar size={10} />
                                <span>{formatStudyDate(study.createdAt)}</span>
                              </div>
                              <h4 className="font-semibold line-clamp-2 text-[#F9F6F0] group-hover:text-[#D4AF37] transition-colors duration-200 text-sm">
                                {study.title}
                              </h4>
                              <div className="pt-2 flex items-center gap-1.5 flex-wrap">
                                <Button 
                                  size="sm" 
                                  className="flex-1 bg-[#D4AF37] text-[#0B132B] font-bold h-8 text-xs min-w-[70px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlayVideo(study);
                                  }}
                                >
                                  {study.videoUrl?.includes("/folders/") ? "Folder" : "Watch"}
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="flex-1 border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-8 text-xs min-w-[70px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLocation(`/notes?studyId=${study.id}`);
                                  }}
                                >
                                  Notes
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="border border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-8 px-2 text-xs"
                                  title="Build & View Official Sabbath Lesson PDF"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPdfStudy(study);
                                  }}
                                >
                                  <FileText size={12} />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>

      <Dialog 
        open={!!selectedVideoStudy} 
        onOpenChange={(open) => !open && setSelectedVideoStudy(null)}
      >
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden bg-black/95 border-border">
          <DialogHeader className="p-4 absolute top-0 left-0 w-full z-10 bg-gradient-to-b from-black/80 to-transparent">
            <DialogTitle className="text-white drop-shadow-md">
              {selectedVideoStudy?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="aspect-video w-full mt-12 bg-black">
            {selectedVideoStudy && (
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${getYouTubeId(selectedVideoStudy.videoUrl)}?autoplay=1`}
                title={selectedVideoStudy.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              ></iframe>
            )}
          </div>
          {linkedPdfs.length > 0 && (
            <div className="p-6 bg-[#0B132B] border-t border-[#D4AF37]/20">
              <h4 className="text-sm font-bold font-serif text-[#D4AF37] mb-3 uppercase tracking-wider flex items-center gap-2">
                <FileText size={16} /> Linked Study Guides & PDFs ({linkedPdfs.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {linkedPdfs.map((pdf: any) => (
                  <div
                    key={pdf.id}
                    onClick={() => {
                      setSelectedVideoStudy(null);
                      setLocation(`/notes?mode=explore&lessonTitle=${encodeURIComponent(pdf.extractedTitle || pdf.fileName)}&lessonUrl=${encodeURIComponent(pdf.fileUrl)}`);
                    }}
                    className="p-3 bg-[#1C2541]/50 border border-[#D4AF37]/10 hover:border-[#D4AF37]/40 rounded-lg flex items-center justify-between cursor-pointer transition-all hover:bg-[#1C2541]"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText size={20} className="text-[#D4AF37] shrink-0" />
                      <span className="text-xs text-[#F9F6F0] font-semibold truncate">
                        {pdf.extractedTitle || pdf.fileName}
                      </span>
                    </div>
                    <Button className="bg-[#D4AF37] text-[#0B132B] text-[10px] font-bold px-3 py-1.5 h-auto hover:bg-[#F9F6F0] transition-colors shrink-0">
                      Study PDF
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Official Sabbath Lesson PDF Builder Modal */}
      {selectedPdfStudy && (
        <SabbathLessonPdfModal 
          studyId={selectedPdfStudy.id} 
          studyTitle={selectedPdfStudy.title} 
          isOpen={!!selectedPdfStudy} 
          onClose={() => setSelectedPdfStudy(null)} 
        />
      )}
    </div>
  );
}
