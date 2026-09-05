import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Loader2, Search, BookOpen, Zap, Brain, Scroll, FileText, Edit3, Cloud, 
  ChevronRight, Menu, Command, Sword, Upload, X, Mic, RefreshCw, Sparkles, 
  Calendar, ArrowUpDown, SlidersHorizontal, Grid, List, Video, FolderOpen, 
  Check, Filter, User, MapPin, Clock, Eye 
} from "lucide-react";
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

  // Filter & Sort States
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "title-asc" | "title-desc" | "campus" | "teacher">("date-desc");
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "pdf" | "folder">("all");
  const [teacherFilter, setTeacherFilter] = useState<string>("all");
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "timeline">("grid");

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

  // Robust Date Extractor
  const getStudyDate = (study: any): Date => {
    const title = `${study.title || ''} ${study.description || ''}`;
    const dateMatch = title.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d{2}|\d{2})\b/);
    if (dateMatch) {
      let year = parseInt(dateMatch[3]);
      if (year < 100) year += 2000;
      const month = parseInt(dateMatch[1]) - 1;
      const day = parseInt(dateMatch[2]);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
    const isoMatch = title.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
    if (isoMatch) {
      const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      if (!isNaN(d.getTime())) return d;
    }
    if (study.createdAt) {
      const d = new Date(study.createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date(0);
  };

  const formatStudyDate = (dateVal?: string | Date | null) => {
    if (!dateVal) return "";
    try {
      const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
      if (isNaN(d.getTime()) || d.getTime() === 0) return "";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  const getTeacher = (study: any): string => {
    const text = `${study.title || ''} ${study.description || ''} ${study.topic || ''}`.toLowerCase();
    if (text.includes("buie")) return "Bro. Henry Buie";
    if (text.includes("jeff")) return "Bro. Jeff";
    if (text.includes("elijah")) return "Bro. Elijah";
    if (text.includes("russell")) return "Bro. Russell";
    return "The Israel of God";
  };

  const getCampus = (study: any): string => {
    const text = `${study.title || ''} ${study.category || ''} ${study.description || ''}`.toLowerCase();
    if (text.includes("birmingham")) return "IOG Birmingham, AL";
    if (text.includes("atlanta")) return "IOG Atlanta, GA";
    if (text.includes("chicago")) return "IOG Chicago, IL";
    if (text.includes("riverdale") || text.includes("teaching") || text.includes("sabbath")) return "Riverdale HQ";
    return study.category || "General Study";
  };

  const getMediaType = (study: any): "video" | "pdf" | "folder" => {
    if (study.videoUrl?.includes("/folders/")) return "folder";
    if (study.videoUrl?.toLowerCase().endsWith(".pdf") || study.category === "Sabbath Text Lessons") return "pdf";
    if (study.videoUrl?.includes("youtube.com") || study.videoUrl?.includes("youtu.be")) return "video";
    return "video";
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

  // Filtered & Sorted Studies Engine
  const processedStudies = studies.filter(study => {
    const q = searchQuery.toLowerCase().trim();
    const dateObj = getStudyDate(study);
    const teacher = getTeacher(study);
    const campus = getCampus(study);
    const media = getMediaType(study);
    const year = dateObj.getFullYear().toString();

    // 1. Search Query
    if (q) {
      const matchText = `${study.title} ${study.topic || ''} ${study.description || ''} ${study.category || ''} ${study.summary || ''} ${teacher} ${campus}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    // 2. Media Filter
    if (mediaFilter !== "all" && media !== mediaFilter) return false;

    // 3. Teacher Filter
    if (teacherFilter !== "all" && teacher !== teacherFilter) return false;

    // 4. Campus Filter
    if (campusFilter !== "all" && campus !== campusFilter) return false;

    // 5. Year Filter
    if (yearFilter !== "all") {
      if (yearFilter === "Archive (2020-2022)") {
        const y = parseInt(year);
        if (y > 2022 || y < 2018) return false;
      } else if (year !== yearFilter) {
        return false;
      }
    }

    // 6. Category Pill Filter
    if (selectedCategory && study.category !== selectedCategory) return false;

    return true;
  }).sort((a, b) => {
    if (sortBy === "date-desc") {
      return getStudyDate(b).getTime() - getStudyDate(a).getTime();
    }
    if (sortBy === "date-asc") {
      return getStudyDate(a).getTime() - getStudyDate(b).getTime();
    }
    if (sortBy === "title-asc") {
      return a.title.localeCompare(b.title);
    }
    if (sortBy === "title-desc") {
      return b.title.localeCompare(a.title);
    }
    if (sortBy === "campus") {
      return getCampus(a).localeCompare(getCampus(b));
    }
    if (sortBy === "teacher") {
      return getTeacher(a).localeCompare(getTeacher(b));
    }
    return 0;
  });

  // Grouping for Timeline / Calendar View
  const timelineGroups = processedStudies.reduce((groups, study) => {
    const d = getStudyDate(study);
    const groupKey = d.getTime() > 0 
      ? d.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "Undated Lessons";
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(study);
    return groups;
  }, {} as Record<string, typeof studies>);

  // PDFs matching search
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

  const videoCount = studies.filter(s => getMediaType(s) === "video").length;
  const pdfCount = studies.filter(s => getMediaType(s) === "pdf").length + pdfSearchResults.length;
  const folderCount = studies.filter(s => getMediaType(s) === "folder").length;

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
      {/* Top Navbar */}
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

      {/* Global Command Dialog */}
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
        </CommandList>
      </CommandDialog>

      <div className="container py-8 pb-24 safe-pb space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold font-serif mb-1 text-[#F9F6F0]">
              The Israel of God Sabbath Lessons
            </h1>
            <p className="text-sm text-[#6B7A8D]">
              Chronological Sabbath teachings, precept breakdowns, videos, and multi-page study sheets.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <ImportLessonDialog />

            <Button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="gap-2 border border-[#D4AF37]/40 text-[#D4AF37] bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 font-semibold text-xs h-9"
              variant="ghost"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-[#D4AF37]" : ""}`} />
              {isSyncing ? "Syncing Lessons..." : "Sync Lessons"}
            </Button>

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
              className="gap-2 border border-[#D4AF37]/40 text-[#D4AF37] bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 font-semibold text-xs h-9"
              variant="ghost"
            >
              {uploadingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : showUploadSuccess ? (
                <span className="text-green-400">✓ Uploaded!</span>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Upload PDF
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ─────────── GLOBAL SEARCH BAR ─────────── */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "#6B7A8D" }} />
          <Input
            id="global-search"
            placeholder="Search Sabbath lessons by title, scripture (e.g. Matthew 24, Exodus 20), topic, or teacher..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-12 h-12 text-sm sm:text-base rounded-xl"
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

        {/* ─────────── ADVANCED FILTER & SORT TOOLBAR ─────────── */}
        <div className="p-4 rounded-xl bg-[#1C2541]/70 border border-[#D4AF37]/20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Media Type Tabs */}
            <div className="flex items-center bg-[#0B132B] p-1 rounded-lg border border-[#D4AF37]/20">
              <button
                onClick={() => setMediaFilter("all")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  mediaFilter === "all" ? "bg-[#D4AF37] text-[#0B132B]" : "text-[#6B7A8D] hover:text-[#F9F6F0]"
                }`}
              >
                All Items ({studies.length})
              </button>
              <button
                onClick={() => setMediaFilter("video")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  mediaFilter === "video" ? "bg-[#D4AF37] text-[#0B132B]" : "text-[#6B7A8D] hover:text-[#F9F6F0]"
                }`}
              >
                <Video size={13} />
                Videos ({videoCount})
              </button>
              <button
                onClick={() => setMediaFilter("pdf")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  mediaFilter === "pdf" ? "bg-[#D4AF37] text-[#0B132B]" : "text-[#6B7A8D] hover:text-[#F9F6F0]"
                }`}
              >
                <FileText size={13} />
                Documents & PDFs ({pdfCount})
              </button>
              <button
                onClick={() => setMediaFilter("folder")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  mediaFilter === "folder" ? "bg-[#D4AF37] text-[#0B132B]" : "text-[#6B7A8D] hover:text-[#F9F6F0]"
                }`}
              >
                <FolderOpen size={13} />
                Folders ({folderCount})
              </button>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#0B132B] p-1 rounded-lg border border-[#D4AF37]/20">
                <button
                  onClick={() => setViewMode("grid")}
                  title="Grid Cards View"
                  className={`p-1.5 rounded-md text-xs transition-all ${
                    viewMode === "grid" ? "bg-[#D4AF37] text-[#0B132B]" : "text-[#6B7A8D] hover:text-[#F9F6F0]"
                  }`}
                >
                  <Grid size={15} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  title="Chronological List Table"
                  className={`p-1.5 rounded-md text-xs transition-all ${
                    viewMode === "list" ? "bg-[#D4AF37] text-[#0B132B]" : "text-[#6B7A8D] hover:text-[#F9F6F0]"
                  }`}
                >
                  <List size={15} />
                </button>
                <button
                  onClick={() => setViewMode("timeline")}
                  title="Timeline by Month & Year"
                  className={`p-1.5 rounded-md text-xs transition-all ${
                    viewMode === "timeline" ? "bg-[#D4AF37] text-[#0B132B]" : "text-[#6B7A8D] hover:text-[#F9F6F0]"
                  }`}
                >
                  <Calendar size={15} />
                </button>
              </div>

              {/* Sort By Dropdown */}
              <div className="flex items-center gap-1.5 bg-[#0B132B] px-2.5 py-1 rounded-lg border border-[#D4AF37]/20 text-xs">
                <ArrowUpDown size={13} className="text-[#D4AF37]" />
                <span className="text-[#6B7A8D] hidden sm:inline font-medium">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="bg-transparent text-[#F9F6F0] font-semibold focus:outline-none cursor-pointer py-1"
                >
                  <option value="date-desc" className="bg-[#0B132B]">📅 Date: Newest First</option>
                  <option value="date-asc" className="bg-[#0B132B]">📅 Date: Oldest First</option>
                  <option value="title-asc" className="bg-[#0B132B]">🔤 Title: A → Z</option>
                  <option value="title-desc" className="bg-[#0B132B]">🔤 Title: Z → A</option>
                  <option value="teacher" className="bg-[#0B132B]">👤 Teacher / Speaker</option>
                  <option value="campus" className="bg-[#0B132B]">🏛️ Campus / Location</option>
                </select>
              </div>
            </div>
          </div>

          {/* Secondary Filters Bar: Teacher, Campus, Year */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#D4AF37]/10 text-xs">
            {/* Teacher Filter */}
            <div className="flex items-center gap-1.5 bg-[#0B132B]/80 px-2.5 py-1 rounded-lg border border-[#D4AF37]/20">
              <User size={12} className="text-[#D4AF37]" />
              <span className="text-[#6B7A8D]">Teacher:</span>
              <select
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                className="bg-transparent text-[#F9F6F0] font-medium focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#0B132B]">All Teachers</option>
                <option value="Bro. Henry Buie" className="bg-[#0B132B]">Bro. Henry Buie</option>
                <option value="Bro. Jeff" className="bg-[#0B132B]">Bro. Jeff (Birmingham)</option>
                <option value="Bro. Elijah" className="bg-[#0B132B]">Bro. Elijah</option>
                <option value="Bro. Russell" className="bg-[#0B132B]">Bro. Russell</option>
              </select>
            </div>

            {/* Campus Filter */}
            <div className="flex items-center gap-1.5 bg-[#0B132B]/80 px-2.5 py-1 rounded-lg border border-[#D4AF37]/20">
              <MapPin size={12} className="text-[#D4AF37]" />
              <span className="text-[#6B7A8D]">Campus:</span>
              <select
                value={campusFilter}
                onChange={(e) => setCampusFilter(e.target.value)}
                className="bg-transparent text-[#F9F6F0] font-medium focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#0B132B]">All Campuses</option>
                <option value="Riverdale HQ" className="bg-[#0B132B]">Riverdale Headquarters</option>
                <option value="IOG Birmingham, AL" className="bg-[#0B132B]">IOG Birmingham, AL</option>
                <option value="IOG Atlanta, GA" className="bg-[#0B132B]">IOG Atlanta, GA</option>
                <option value="IOG Chicago, IL" className="bg-[#0B132B]">IOG Chicago, IL</option>
              </select>
            </div>

            {/* Year Filter */}
            <div className="flex items-center gap-1.5 bg-[#0B132B]/80 px-2.5 py-1 rounded-lg border border-[#D4AF37]/20">
              <Calendar size={12} className="text-[#D4AF37]" />
              <span className="text-[#6B7A8D]">Year:</span>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="bg-transparent text-[#F9F6F0] font-medium focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#0B132B]">All Years</option>
                <option value="2026" className="bg-[#0B132B]">2026</option>
                <option value="2025" className="bg-[#0B132B]">2025</option>
                <option value="2024" className="bg-[#0B132B]">2024</option>
                <option value="2023" className="bg-[#0B132B]">2023</option>
                <option value="Archive (2020-2022)" className="bg-[#0B132B]">Archive (2020–2022)</option>
              </select>
            </div>

            {/* Reset Filters button if any active */}
            {(mediaFilter !== "all" || teacherFilter !== "all" || campusFilter !== "all" || yearFilter !== "all" || searchQuery || selectedCategory) && (
              <button
                onClick={() => {
                  setMediaFilter("all");
                  setTeacherFilter("all");
                  setCampusFilter("all");
                  setYearFilter("all");
                  setSearchQuery("");
                  setSelectedCategory(null);
                }}
                className="flex items-center gap-1 text-[#D4AF37] hover:underline ml-auto font-medium"
              >
                <X size={12} /> Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Results Counter */}
        <div className="flex items-center justify-between text-xs text-[#6B7A8D] px-1">
          <span>
            Showing <strong className="text-[#D4AF37]">{processedStudies.length}</strong> lessons sorted by{" "}
            <strong className="text-[#F9F6F0]">
              {sortBy === "date-desc" ? "Newest Date" : sortBy === "date-asc" ? "Oldest Date" : sortBy === "title-asc" ? "Title A-Z" : sortBy}
            </strong>
          </span>
          {processedStudies.length !== studies.length && (
            <span>(Filtered from {studies.length} total)</span>
          )}
        </div>

        {/* ─────────── MAIN LESSON VIEW DISPLAY ─────────── */}
        {studiesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((card) => (
              <Card key={card} className="overflow-hidden bg-[#1C2541]/40 border-[#D4AF37]/10">
                <Skeleton className="aspect-video bg-[#1C2541]" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4 bg-[#2A3A6E]" />
                  <Skeleton className="h-8 w-full bg-[#2A3A6E]" />
                </div>
              </Card>
            ))}
          </div>
        ) : processedStudies.length === 0 ? (
          <div className="text-center py-20 space-y-4 border-2 border-dashed border-[#D4AF37]/20 rounded-2xl bg-[#1C2541]/20">
            <BookOpen className="w-16 h-16 mx-auto text-[#D4AF37]/40" />
            <h3 className="text-xl font-semibold font-serif text-[#F9F6F0]">No Sabbath Lessons Found</h3>
            <p className="text-[#6B7A8D] max-w-md mx-auto text-xs">
              No lessons match your current search and filter criteria. Try clearing or changing your filters.
            </p>
            <Button
              onClick={() => {
                setMediaFilter("all");
                setTeacherFilter("all");
                setCampusFilter("all");
                setYearFilter("all");
                setSearchQuery("");
                setSelectedCategory(null);
              }}
              className="bg-[#D4AF37] text-[#0B132B] font-bold text-xs"
            >
              Reset All Filters
            </Button>
          </div>
        ) : viewMode === "grid" ? (
          /* ─────────── 1. GRID CARDS VIEW ─────────── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {processedStudies.map((study) => {
              const studyDate = getStudyDate(study);
              const teacher = getTeacher(study);
              const campus = getCampus(study);
              const media = getMediaType(study);

              return (
                <Card 
                  key={study.id} 
                  className="group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-[#D4AF37]/15 border-[#D4AF37]/20 hover:border-[#D4AF37]/50 flex flex-col"
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
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0B132B] to-[#1C2541]">
                        <BookOpen className="w-12 h-12 text-[#D4AF37]/50" />
                      </div>
                    )}

                    {/* Media Type & Campus Badges */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-bold text-[#D4AF37] border border-[#D4AF37]/30 flex items-center gap-1">
                      {media === "video" ? <Video size={10} /> : media === "pdf" ? <FileText size={10} /> : <FolderOpen size={10} />}
                      <span>{campus}</span>
                    </div>

                    {/* Date Badge */}
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/85 backdrop-blur-sm text-[10px] font-semibold text-[#F9F6F0] flex items-center gap-1 border border-white/10">
                      <Calendar size={10} className="text-[#D4AF37]" />
                      <span>{formatStudyDate(studyDate)}</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-[#D4AF37] font-medium mb-1">
                        <span className="truncate">{teacher}</span>
                      </div>
                      <h4 className="font-bold line-clamp-2 text-[#F9F6F0] group-hover:text-[#D4AF37] transition-colors duration-200 text-sm">
                        {study.title}
                      </h4>
                    </div>

                    <div className="pt-2 flex items-center gap-1.5 flex-wrap border-t border-[#D4AF37]/10">
                      <Button 
                        size="sm" 
                        className="flex-1 bg-[#D4AF37] text-[#0B132B] font-bold h-8 text-xs min-w-[65px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayVideo(study);
                        }}
                      >
                        {media === "folder" ? "Folder" : media === "pdf" ? "Open PDF" : "Watch"}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1 border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-8 text-xs min-w-[65px]"
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
                        <FileText size={13} />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : viewMode === "list" ? (
          /* ─────────── 2. CHRONOLOGICAL LIST / TABLE VIEW ─────────── */
          <div className="bg-[#1C2541]/50 rounded-xl border border-[#D4AF37]/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#F9F6F0]">
                <thead className="bg-[#0B132B] text-[#D4AF37] uppercase tracking-wider text-[11px] border-b border-[#D4AF37]/20">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Lesson Title</th>
                    <th className="py-3 px-4 hidden md:table-cell">Teacher</th>
                    <th className="py-3 px-4 hidden lg:table-cell">Campus</th>
                    <th className="py-3 px-4 hidden sm:table-cell">Type</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4AF37]/10">
                  {processedStudies.map((study) => {
                    const studyDate = getStudyDate(study);
                    const teacher = getTeacher(study);
                    const campus = getCampus(study);
                    const media = getMediaType(study);

                    return (
                      <tr 
                        key={study.id} 
                        className="hover:bg-[#D4AF37]/5 transition-colors cursor-pointer"
                        onClick={() => handlePlayVideo(study)}
                      >
                        <td className="py-3 px-4 whitespace-nowrap text-[#D4AF37] font-semibold">
                          {formatStudyDate(studyDate)}
                        </td>
                        <td className="py-3 px-4 font-bold text-sm max-w-xs md:max-w-md truncate hover:text-[#D4AF37]">
                          {study.title}
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell text-[#6B7A8D] whitespace-nowrap">
                          {teacher}
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell text-[#6B7A8D] whitespace-nowrap">
                          {campus}
                        </td>
                        <td className="py-3 px-4 hidden sm:table-cell whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 text-[10px] font-bold uppercase">
                            {media}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              className="bg-[#D4AF37] text-[#0B132B] font-bold h-7 text-xs px-2.5"
                              onClick={() => handlePlayVideo(study)}
                            >
                              {media === "folder" ? "Folder" : media === "pdf" ? "Open" : "Watch"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-7 text-xs px-2.5"
                              onClick={() => setLocation(`/notes?studyId=${study.id}`)}
                            >
                              Notes
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="border border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-7 px-2"
                              title="Sabbath PDF"
                              onClick={() => setSelectedPdfStudy(study)}
                            >
                              <FileText size={12} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ─────────── 3. TIMELINE / CALENDAR VIEW ─────────── */
          <div className="space-y-8">
            {Object.entries(timelineGroups).map(([monthYear, groupStudies]) => (
              <div key={monthYear} className="space-y-4">
                <div className="flex items-center gap-3 border-b border-[#D4AF37]/20 pb-2">
                  <Calendar className="w-5 h-5 text-[#D4AF37]" />
                  <h3 className="text-xl font-bold font-serif text-[#F9F6F0]">{monthYear}</h3>
                  <span className="text-xs text-[#6B7A8D]">({groupStudies.length} teachings)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {groupStudies.map((study) => {
                    const studyDate = getStudyDate(study);
                    const teacher = getTeacher(study);
                    const campus = getCampus(study);
                    const media = getMediaType(study);

                    return (
                      <Card 
                        key={study.id} 
                        className="group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-[#D4AF37]/15 border-[#D4AF37]/20 hover:border-[#D4AF37]/50 flex flex-col"
                        style={{ background: "rgba(28,37,65,0.6)" }}
                        onClick={() => handlePlayVideo(study)}
                      >
                        <div className="relative aspect-video bg-muted overflow-hidden">
                          {study.thumbnail ? (
                            <img 
                              src={study.thumbnail} 
                              alt={study.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0B132B] to-[#1C2541]">
                              <BookOpen className="w-12 h-12 text-[#D4AF37]/50" />
                            </div>
                          )}
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-bold text-[#D4AF37] border border-[#D4AF37]/30">
                            {formatStudyDate(studyDate)}
                          </div>
                        </div>

                        <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                          <div>
                            <span className="text-[11px] text-[#D4AF37] font-semibold block">{teacher} • {campus}</span>
                            <h4 className="font-bold line-clamp-2 text-[#F9F6F0] group-hover:text-[#D4AF37] text-sm mt-1">
                              {study.title}
                            </h4>
                          </div>

                          <div className="pt-2 flex items-center gap-1.5 flex-wrap border-t border-[#D4AF37]/10">
                            <Button 
                              size="sm" 
                              className="flex-1 bg-[#D4AF37] text-[#0B132B] font-bold h-8 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlayVideo(study);
                              }}
                            >
                              Watch
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="flex-1 border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-8 text-xs"
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
                              title="Sabbath PDF"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPdfStudy(study);
                              }}
                            >
                              <FileText size={13} />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Video Player Modal */}
      {selectedVideoStudy && (
        <Dialog open={!!selectedVideoStudy} onOpenChange={() => setSelectedVideoStudy(null)}>
          <DialogContent className="max-w-4xl bg-[#0B132B] border-[#D4AF37]/30 text-[#F9F6F0] p-0 rounded-2xl overflow-hidden">
            <div className="p-4 bg-[#1C2541] border-b border-[#D4AF37]/20 flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold font-serif text-[#F9F6F0]">
                  {selectedVideoStudy.title}
                </DialogTitle>
                <p className="text-xs text-[#6B7A8D]">
                  {getTeacher(selectedVideoStudy)} • {formatStudyDate(getStudyDate(selectedVideoStudy))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setLocation(`/notes?studyId=${selectedVideoStudy.id}`);
                    setSelectedVideoStudy(null);
                  }}
                  className="bg-[#D4AF37] text-[#0B132B] font-bold text-xs"
                >
                  <Edit3 size={13} className="mr-1" /> Open Notes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedPdfStudy(selectedVideoStudy);
                    setSelectedVideoStudy(null);
                  }}
                  className="border-[#D4AF37]/30 text-[#D4AF37] text-xs"
                >
                  <FileText size={13} className="mr-1" /> Sabbath PDF
                </Button>
              </div>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${getYouTubeId(selectedVideoStudy.videoUrl)}?autoplay=1`}
                title={selectedVideoStudy.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Sabbath Lesson PDF Builder Modal */}
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
