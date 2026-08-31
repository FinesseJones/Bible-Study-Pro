import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Upload, Trash2, Search, ChevronRight, BookOpen,
  Loader2, X, Eye, Cloud, RefreshCw, FolderOpen, Calendar,
  ExternalLink, ChevronDown, ChevronUp, ZoomIn
} from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getViewableUrl } from "@/lib/docUrl";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatBytes(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Extract Google Drive file ID from a stored Drive URL or fileKey */
function extractDriveFileId(pdf: any): string | null {
  const meta = pdf.metadata as any;
  if (meta?.googleDriveFileId) return meta.googleDriveFileId;
  // fileKey format: "google-drive/<fileId>"
  if (pdf.fileKey?.startsWith("google-drive/")) return pdf.fileKey.replace("google-drive/", "");
  const m = (pdf.fileUrl || "").match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Generate initials-based placeholder color for a category folder */
function folderColor(cat: string) {
  const colors = [
    "#D4AF37", "#7B61FF", "#3B9EFF", "#FF6B6B",
    "#2ECC71", "#F39C12", "#E91E8C", "#00BCD4",
  ];
  let hash = 0;
  for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/** Sort categories: put year-based folders first (newest year first), rest alphabetically */
function sortedCategories(cats: string[]): string[] {
  return [...cats].sort((a, b) => {
    const aYear = a.match(/\b(20\d\d)\b/)?.[1];
    const bYear = b.match(/\b(20\d\d)\b/)?.[1];
    if (aYear && bYear) return parseInt(bYear) - parseInt(aYear);
    if (aYear) return -1;
    if (bYear) return 1;
    return a.localeCompare(b);
  });
}

// --------------------------------------------------------------------------
// PDF Preview Modal
// Google Drive blocks iframes via X-Frame-Options, so Drive files open in the
// system browser. Only local/base64 sources render in the in-app iframe.
// --------------------------------------------------------------------------
function PdfPreviewModal({
  pdf,
  onClose,
}: {
  pdf: any;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  const driveFileId = extractDriveFileId(pdf);
  const isDriveFile = !!driveFileId || (pdf.syncSource === "Google Drive Sync");

  // Only fetch proxy stream if we have creds — for local uploads there's no fileId
  const { data: streamed, isLoading: streamLoading } = trpc.pdfs.stream.useQuery(
    { fileId: driveFileId! },
    { enabled: !!driveFileId, retry: false, staleTime: Infinity }
  );

  const base64Src = streamed?.base64
    ? `data:application/pdf;base64,${streamed.base64}`
    : null;

  // Only show iframe for base64 (server proxy worked) or blob: (local upload)
  const blobSrc = !isDriveFile ? getViewableUrl(pdf.fileUrl) : null;
  const iframeSrc = base64Src || blobSrc;

  const title = (pdf.extractedTitle || pdf.fileName || "Untitled").replace(/\.pdf$/i, "");
  const category = pdf.category || "Uncategorized";
  const date = pdf.lastSyncedAt
    ? new Date(pdf.lastSyncedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  const openInBrowser = () => {
    if (pdf.fileUrl) window.open(pdf.fileUrl, "_blank", "noopener,noreferrer");
  };

  const studyInApp = () => {
    const url = pdf.fileUrl;
    if (url) setLocation(`/notes?mode=explore&lessonTitle=${encodeURIComponent(title)}&lessonUrl=${encodeURIComponent(url)}`);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: "rgba(8,14,33,0.97)", backdropFilter: "blur(12px)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b shrink-0"
        style={{ background: "rgba(28,37,65,0.95)", borderColor: "rgba(212,175,55,0.18)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <FileText size={18} style={{ color: "#D4AF37", flexShrink: 0 }} />
          <span
            className="font-serif font-bold truncate"
            style={{ color: "#F9F6F0", maxWidth: "60vw" }}
          >
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pdf.fileUrl && (
            <button
              onClick={() => {
                const vUrl = getViewableUrl(pdf.fileUrl);
                if (vUrl) setLocation(`/notes?mode=explore&lessonTitle=${encodeURIComponent(title)}&lessonUrl=${encodeURIComponent(vUrl)}`);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-90"
              style={{ background: "#D4AF37", color: "#0B132B" }}
            >
              <BookOpen size={13} /> Study
            </button>
          )}
          {pdf.fileUrl && (
            <a
              href={pdf.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:opacity-80"
              style={{ borderColor: "rgba(212,175,55,0.3)", color: "#D4AF37" }}
            >
              <ExternalLink size={13} /> Open in Drive
            </a>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: "#6B7A8D" }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {streamLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 size={36} className="animate-spin" style={{ color: "#D4AF37" }} />
            <p className="text-sm" style={{ color: "#6B7A8D" }}>Loading PDF…</p>
          </div>
        ) : iframeSrc ? (
          <iframe
            src={iframeSrc}
            className="w-full h-full border-0 bg-white"
            title={title}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
            <FileText size={64} style={{ color: "#D4AF37", opacity: 0.3 }} />
            <p className="text-base font-serif" style={{ color: "#F9F6F0" }}>{title}</p>
            <p className="text-sm text-center" style={{ color: "#6B7A8D" }}>
              This PDF can be opened in Google Drive or studied in your Workspace.
            </p>
            {pdf.fileUrl && (
              <a
                href={pdf.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm"
                style={{ background: "#D4AF37", color: "#0B132B" }}
              >
                <ExternalLink size={16} /> Open in Google Drive
              </a>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// --------------------------------------------------------------------------
// PDF Card
// --------------------------------------------------------------------------
function PdfCard({ pdf, onPreview, onDelete, onStudy }: any) {
  const title = (pdf.extractedTitle || pdf.fileName || "Untitled").replace(/\.pdf$/i, "");
  const hasThumbnail = !!pdf.thumbnailUrl;
  const date = pdf.lastSyncedAt
    ? new Date(pdf.lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative overflow-hidden rounded-xl border transition-all duration-300 cursor-pointer"
      style={{
        background: "rgba(28,37,65,0.5)",
        borderColor: "rgba(212,175,55,0.12)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
      }}
      onClick={() => onPreview(pdf)}
      whileHover={{ scale: 1.012, borderColor: "rgba(212,175,55,0.35)" }}
    >
      {/* Thumbnail */}
      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{ aspectRatio: "4/3", background: "rgba(11,19,43,0.8)" }}
      >
        {hasThumbnail ? (
          <>
            <img
              src={pdf.thumbnailUrl}
              alt={title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold font-serif"
              style={{ background: "rgba(212,175,55,0.15)", color: "#D4AF37" }}
            >
              {title.substring(0, 2).toUpperCase()}
            </div>
            <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "#6B7A8D" }}>PDF</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ background: "rgba(212,175,55,0.9)" }}>
            <ZoomIn size={14} style={{ color: "#0B132B" }} />
            <span className="text-xs font-bold" style={{ color: "#0B132B" }}>Open PDF</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <h4
          className="font-semibold line-clamp-2 leading-snug text-sm group-hover:text-[#D4AF37] transition-colors"
          style={{ color: "#F9F6F0" }}
        >
          {title}
        </h4>

        {date && (
          <div className="flex items-center gap-1.5" style={{ color: "#6B7A8D" }}>
            <Calendar size={10} />
            <span className="text-[10px]">{date}</span>
          </div>
        )}

        {pdf.matchSnippet && (
          <p className="text-[10px] leading-relaxed p-2 rounded font-mono line-clamp-2"
            style={{ background: "rgba(212,175,55,0.07)", color: "rgba(212,175,55,0.8)", border: "1px solid rgba(212,175,55,0.1)" }}>
            …{pdf.matchSnippet}…
          </p>
        )}

        {/* Actions — always visible on mobile, hover on desktop */}
        <div
          className="flex gap-1.5 pt-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onStudy(pdf)}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={{ background: "#D4AF37", color: "#0B132B" }}
          >
            Study
          </button>
          <button
            onClick={() => onPreview(pdf)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "#D4AF37", background: "rgba(212,175,55,0.1)" }}
            title="Preview"
          >
            <Eye size={14} />
          </button>
          {pdf.syncSource !== "Google Drive Sync" && (
            <button
              onClick={() => onDelete(pdf.id)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "#8B1A1A", background: "rgba(139,26,26,0.1)" }}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// --------------------------------------------------------------------------
// Folder Section (collapsible)
// --------------------------------------------------------------------------
function FolderSection({ category, docs, onPreview, onDelete, onStudy }: any) {
  const [collapsed, setCollapsed] = useState(false);
  const color = folderColor(category);

  return (
    <div className="mb-10">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-3 pb-3 mb-5 border-b text-left group"
        style={{ borderColor: "rgba(212,175,55,0.15)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${color}22`, border: `1px solid ${color}44` }}
          >
            <FolderOpen size={16} style={{ color }} />
          </div>
          <div>
            <h3 className="text-base font-bold font-serif" style={{ color: "#F9F6F0" }}>{category}</h3>
            <span className="text-[11px]" style={{ color: "#6B7A8D" }}>{docs.length} document{docs.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        {collapsed
          ? <ChevronDown size={16} style={{ color: "#6B7A8D" }} />
          : <ChevronUp size={16} style={{ color: "#6B7A8D" }} />
        }
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {docs.map((pdf: any, i: number) => (
                <PdfCard
                  key={pdf.id}
                  pdf={pdf}
                  onPreview={onPreview}
                  onDelete={onDelete}
                  onStudy={onStudy}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --------------------------------------------------------------------------
// Main Vault Page
// --------------------------------------------------------------------------
export default function Vault() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [previewPdf, setPreviewPdf] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showDriveSync, setShowDriveSync] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: pdfList = [], isLoading, refetch } = trpc.pdfs.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const deletePdf = trpc.pdfs.delete.useMutation({ onSuccess: () => refetch() });
  const createPdf = trpc.pdfs.create.useMutation({
    onSuccess: () => { refetch(); setUploading(false); },
    onError: () => setUploading(false),
  });

  const { data: searchResults = [], isFetching: searchLoading } = trpc.pdfs.search.useQuery(
    { query: searchQuery },
    { enabled: isAuthenticated && searchQuery.trim().length > 1 }
  );

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const content = ev.target?.result as string;
        const localUrl = URL.createObjectURL(file);
        await createPdf.mutateAsync({
          fileName: file.name,
          fileKey: `local/${Date.now()}-${file.name}`,
          fileUrl: localUrl,
          fileSize: file.size,
          textContent: content?.slice(0, 50000) ?? "",
        });
      };
      reader.readAsText(file);
    } catch { setUploading(false); }
  }, [createPdf]);

  const handleStudy = useCallback((pdf: any) => {
    const vUrl = getViewableUrl(pdf.fileUrl);
    if (vUrl) {
      const title = pdf.extractedTitle || pdf.fileName;
      setLocation(`/notes?mode=explore&lessonTitle=${encodeURIComponent(title)}&lessonUrl=${encodeURIComponent(vUrl)}`);
    }
  }, [setLocation]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B132B" }}>
        <p style={{ color: "#6B7A8D" }}>Please sign in to access the Vault.</p>
      </div>
    );
  }

  const isSearching = searchQuery.trim().length > 1;
  const displayList = isSearching ? (searchResults as any[]) : (pdfList as any[]);

  // Group by category → sort newest first within each group
  const grouped: Record<string, any[]> = {};
  for (const pdf of displayList) {
    const cat = (pdf.category as string) || "Unclassified";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(pdf);
  }
  // Sort docs within each folder newest first
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a: any, b: any) => {
      const da = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
      const db2 = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
      return db2 - da;
    });
  }
  const categories = sortedCategories(Object.keys(grouped));
  const totalDocs = displayList.length;

  return (
    <div className="min-h-screen" style={{ background: "#0B132B" }}>
      {/* Header */}
      <nav
        className="sticky top-0 z-50 border-b"
        style={{ background: "rgba(11,19,43,0.97)", backdropFilter: "blur(16px)", borderColor: "rgba(212,175,55,0.15)" }}
      >
        <div className="container flex items-center justify-between h-16 px-5">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "#6B7A8D" }}
          >
            <ChevronRight size={16} className="rotate-180" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-2">
            <FileText size={20} style={{ color: "#D4AF37" }} />
            <span className="font-serif text-lg font-bold" style={{ color: "#F9F6F0" }}>Scripture Vault</span>
          </div>
          <span className="text-xs font-semibold" style={{ color: "#6B7A8D" }}>{totalDocs} docs</span>
        </div>
      </nav>

      <div className="container px-5 py-8 pb-28 safe-pb">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>

          {/* Hero */}
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] mb-1 font-semibold" style={{ color: "#D4AF37" }}>
              Knowledge Archive
            </p>
            <h1 className="font-serif text-4xl font-bold mb-1" style={{ color: "#F9F6F0" }}>
              Your Scripture Vault
            </h1>
            <p className="text-sm" style={{ color: "#6B7A8D" }}>
              PDFs from Google Drive, synced by folder & date. Click any document to read it.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 mb-6">
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx" className="hidden" onChange={handleFileUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
              style={{ background: "#D4AF37", color: "#0B132B" }}
            >
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Upload Document
            </button>
            <button
              onClick={() => setShowDriveSync((v) => !v)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 border"
              style={{ background: "rgba(212,175,55,0.08)", borderColor: "rgba(212,175,55,0.25)", color: "#D4AF37" }}
            >
              <Cloud size={15} />
              Sync Drive Link
            </button>
          </div>

          {/* Drive sync panel */}
          <AnimatePresence>
            {showDriveSync && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-6"
              >
                <div
                  className="rounded-xl p-5 border"
                  style={{ background: "rgba(28,37,65,0.7)", borderColor: "rgba(212,175,55,0.2)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Cloud size={18} style={{ color: "#D4AF37" }} />
                      <p className="font-bold" style={{ color: "#F9F6F0" }}>Add Google Drive Link</p>
                    </div>
                    <button onClick={() => setShowDriveSync(false)}>
                      <X size={16} style={{ color: "#6B7A8D" }} />
                    </button>
                  </div>
                  <p className="text-xs mb-3" style={{ color: "#6B7A8D" }}>
                    Paste a Google Drive link. Set sharing to "Anyone with the link can view".
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={driveUrl}
                      onChange={(e) => setDriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/…"
                      className="bg-[#0B132B] border-[#D4AF37]/20 flex-1"
                    />
                    <Button
                      onClick={async () => {
                        if (!driveUrl) return;
                        setUploading(true);
                        const folderId = driveUrl.split("/folders/")[1]?.split("?")[0];
                        const isFolder = driveUrl.includes("/folders/");
                        const cleanUrl = isFolder
                          ? `https://drive.google.com/embeddedfolderview?id=${folderId}#grid`
                          : driveUrl.replace("/view", "/preview").replace("?usp=drive_link", "");
                        await createPdf.mutateAsync({
                          fileName: isFolder ? "Drive Folder: " + (folderId?.substring(0, 12) || "?") : "Drive Doc: " + (driveUrl.split("/").pop()?.substring(0, 20) || "Lesson"),
                          fileKey: "gdrive-" + Date.now(),
                          fileUrl: cleanUrl,
                          fileSize: 0,
                          textContent: "Indexing from Google Drive…",
                        });
                        setDriveUrl("");
                        setShowDriveSync(false);
                      }}
                      className="bg-[#D4AF37] text-[#0B132B]"
                    >
                      <RefreshCw size={14} className="mr-2" /> Add
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search */}
          <div className="relative mb-7">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "#6B7A8D" }} />
            {searchLoading && <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "#D4AF37" }} />}
            <Input
              placeholder="Search by title or content…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11"
              style={{ background: "rgba(28,37,65,0.8)", border: "1px solid rgba(212,175,55,0.15)", color: "#F9F6F0" }}
            />
          </div>

          {/* AI badge */}
          <div
            className="rounded-xl p-4 mb-8 flex items-center gap-3"
            style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.15)" }}
          >
            <BookOpen size={18} style={{ color: "#D4AF37", flexShrink: 0 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#D4AF37" }}>Auto-Indexed by AI Teacher</p>
              <p className="text-xs" style={{ color: "#6B7A8D" }}>
                Every document is read by the AI — ask questions about any lesson in <strong className="text-[#D4AF37]">Ask Teacher</strong>.
              </p>
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="animate-spin" size={36} style={{ color: "#D4AF37" }} />
              <p className="text-sm" style={{ color: "#6B7A8D" }}>Loading your library…</p>
            </div>
          ) : totalDocs === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-24 space-y-4">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(28,37,65,0.6)" }}>
                <FileText size={36} style={{ color: "#D4AF37" }} />
              </div>
              <h3 className="font-serif text-xl" style={{ color: "#F9F6F0" }}>
                {isSearching ? "No documents match your search" : "Your vault is empty"}
              </h3>
              <p className="text-sm" style={{ color: "#6B7A8D" }}>
                Upload PDFs or connect Google Drive to start building your library.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2.5 rounded-xl font-semibold text-sm mt-2"
                style={{ background: "#D4AF37", color: "#0B132B" }}
              >
                Upload First Document
              </button>
            </motion.div>
          ) : (
            <div>
              {isSearching && (
                <p className="text-sm mb-6" style={{ color: "#6B7A8D" }}>
                  {totalDocs} result{totalDocs !== 1 ? "s" : ""} for <strong style={{ color: "#D4AF37" }}>"{searchQuery}"</strong>
                </p>
              )}
              {categories.map((cat) => (
                <FolderSection
                  key={cat}
                  category={cat}
                  docs={grouped[cat]}
                  onPreview={setPreviewPdf}
                  onDelete={(id: number) => deletePdf.mutate({ id })}
                  onStudy={handleStudy}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* PDF Preview Modal */}
      <AnimatePresence>
        {previewPdf && (
          <PdfPreviewModal pdf={previewPdf} onClose={() => setPreviewPdf(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}


