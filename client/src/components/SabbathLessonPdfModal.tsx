import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { 
  Printer, Download, BookOpen, Loader2, Sparkles, X, RefreshCw, 
  FileText, Edit3, Eye, Plus, Trash2, CheckCircle2, Layers, Image as ImageIcon 
} from "lucide-react";

interface SabbathLessonPdfModalProps {
  studyId?: number | null;
  studyTitle?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function SabbathLessonPdfModal({
  studyId,
  studyTitle = "Sabbath Lesson",
  isOpen,
  onClose,
}: SabbathLessonPdfModalProps) {
  const [, setLocation] = useLocation();
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number>(8);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "editor">("preview");

  const effectiveStudyId = studyId && studyId > 0 ? studyId : 14161;

  const utils = trpc.useUtils();

  const generatePdfMutation = trpc.studies.generateSabbathPdf.useMutation({
    onSuccess: (data) => {
      setHtmlContent(data.html);
      if (data.totalPages) {
        setTotalPages(data.totalPages);
      }
      utils.pdfs.list.invalidate();
      utils.pdfs.getByStudy.invalidate({ studyId: effectiveStudyId });
      toast.success(data.message || "Official Dynamic Sabbath Lesson Sheet generated!");
    },
    onError: (err) => {
      toast.error(`Could not generate Sabbath Lesson Sheet: ${err.message}`);
    }
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generatePdfMutation.mutateAsync({ studyId: effectiveStudyId });
    } catch (e) {
      console.error("PDF generation failed:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  // When modal opens or studyId changes, automatically fetch and generate
  useEffect(() => {
    if (isOpen) {
      handleGenerate();
    } else {
      setHtmlContent(null);
    }
  }, [isOpen, studyId]);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow && htmlContent) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const handleDownload = () => {
    if (!htmlContent) return;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${studyTitle.replace(/[^a-zA-Z0-9]/g, "_")}_IOG_Sabbath_Lesson.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded Sabbath Lesson document!");
  };

  const handleStudy = () => {
    setLocation(`/notes?studyId=${effectiveStudyId}`);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="max-w-6xl w-[96vw] h-[92vh] bg-[#0B132B] border border-[#D4AF37]/30 text-[#F9F6F0] p-0 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Top Navigation & Action Toolbar */}
        <div className="p-3 sm:p-4 bg-[#1C2541] border-b border-[#D4AF37]/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-sm sm:text-base font-bold font-serif text-[#F9F6F0] truncate max-w-xs sm:max-w-md">
                {studyTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Official Israel of God Sabbath Lesson Multi-Page Document
              </DialogDescription>
              <div className="flex items-center gap-2 text-xs text-[#6B7A8D]">
                <span className="text-[#D4AF37] font-semibold">The Israel of God</span>
                <span>•</span>
                <span className="flex items-center gap-1 text-[#F9F6F0]">
                  <Layers size={11} className="text-[#D4AF37]" />
                  Dynamic {totalPages}-Page Multi-Page Sheet (KJV 1–{totalPages})
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Mode Switcher */}
            <div className="flex items-center bg-[#0B132B] p-1 rounded-lg border border-[#D4AF37]/20 mr-1">
              <button
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  activeTab === "preview" ? "bg-[#D4AF37] text-[#0B132B]" : "text-[#6B7A8D] hover:text-[#F9F6F0]"
                }`}
              >
                <Eye size={13} />
                Dynamic Preview ({totalPages}p)
              </button>
              <button
                onClick={() => setActiveTab("editor")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  activeTab === "editor" ? "bg-[#D4AF37] text-[#0B132B]" : "text-[#6B7A8D] hover:text-[#F9F6F0]"
                }`}
              >
                <Edit3 size={13} />
                Lesson Editor
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 text-xs gap-1.5 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
              Re-Build
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={!htmlContent}
              className="border-[#6B7A8D]/40 text-[#F9F6F0] hover:bg-white/10 text-xs gap-1.5 h-8 hidden sm:flex"
            >
              <Download size={13} />
              Export
            </Button>

            <Button
              size="sm"
              onClick={handlePrint}
              disabled={!htmlContent}
              className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B132B] font-bold text-xs gap-1.5 h-8 shadow-md"
            >
              <Printer size={14} />
              Print / Save PDF
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleStudy}
              className="text-[#F9F6F0] hover:text-[#D4AF37] text-xs gap-1.5 h-8"
            >
              <BookOpen size={14} />
              Cornell Notes
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-[#121b2d] relative overflow-hidden flex flex-col">
          {activeTab === "preview" ? (
            <div className="flex-1 bg-[#c8d0dc] relative overflow-auto p-2 sm:p-4 flex justify-center">
              {isGenerating ? (
                <div className="absolute inset-0 bg-[#0B132B] flex flex-col items-center justify-center gap-3 text-[#F9F6F0]">
                  <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
                  <p className="text-sm font-serif">Compiling dynamic Israel of God lesson sheets...</p>
                  <span className="text-xs text-[#6B7A8D]">Rendering video lower-third cover banner and auto-paginating notes</span>
                </div>
              ) : htmlContent ? (
                <iframe
                  srcDoc={htmlContent}
                  title={studyTitle}
                  className="w-full h-full border-0 rounded-lg shadow-xl"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                  Click "Re-Build" to generate lesson PDF.
                </div>
              )}
            </div>
          ) : (
            /* In-App Visual Editor (Tungsten Power PDF Replacement) */
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-4xl mx-auto w-full text-white">
              <div className="bg-[#1C2541] border border-[#D4AF37]/20 rounded-xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4 border-b border-[#D4AF37]/20 pb-3">
                  <div>
                    <h3 className="font-serif font-bold text-lg text-[#D4AF37]">Lesson Document Editor</h3>
                    <p className="text-xs text-[#6B7A8D]">Customize video lower-third cover banner, metadata, and scriptures with live dynamic auto-pagination.</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleGenerate}
                    className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B132B] font-bold text-xs gap-1.5"
                  >
                    <CheckCircle2 size={14} />
                    Apply & Re-Paginate
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-[#6B7A8D] font-medium block mb-1">Lesson Title</label>
                    <input
                      type="text"
                      defaultValue={studyTitle}
                      className="w-full bg-[#0B132B] border border-[#D4AF37]/30 rounded-lg px-3 py-2 text-sm text-[#F9F6F0] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#6B7A8D] font-medium block mb-1">Campus / Location</label>
                    <input
                      type="text"
                      defaultValue="Riverdale Headquarters / IOG Birmingham, AL"
                      className="w-full bg-[#0B132B] border border-[#D4AF37]/30 rounded-lg px-3 py-2 text-sm text-[#F9F6F0] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#6B7A8D] font-medium block mb-1">Teacher</label>
                    <input
                      type="text"
                      defaultValue="Bro. Buie / Bro. Jeff"
                      className="w-full bg-[#0B132B] border border-[#D4AF37]/30 rounded-lg px-3 py-2 text-sm text-[#F9F6F0] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#6B7A8D] font-medium block mb-1">Reader</label>
                    <input
                      type="text"
                      defaultValue="Bro. Reader"
                      className="w-full bg-[#0B132B] border border-[#D4AF37]/30 rounded-lg px-3 py-2 text-sm text-[#F9F6F0] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  
                  {/* Video Lower Third Banner */}
                  <div className="sm:col-span-2">
                    <label className="text-xs text-[#D4AF37] font-semibold flex items-center gap-1.5 mb-1">
                      <ImageIcon size={13} />
                      Video Lower-Third / Cover Banner Image (URL or Video Frame)
                    </label>
                    <input
                      type="text"
                      placeholder="https://... (Leave blank to use broadcast graphic banner styling)"
                      className="w-full bg-[#0B132B] border border-[#D4AF37]/30 rounded-lg px-3 py-2 text-sm text-[#F9F6F0] focus:outline-none focus:border-[#D4AF37]"
                    />
                    <span className="text-[11px] text-[#6B7A8D] mt-1 block">
                      When a video URL is linked, Bible Study Pro automatically grabs the official broadcast title lower-third / thumbnail for Page 1.
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs text-[#6B7A8D] font-medium block mb-1">Prayer Scripture Reference & Text</label>
                    <textarea
                      rows={3}
                      defaultValue="Psalms 19:7-11 The law of the LORD is perfect, converting the soul: the testimony of the LORD is sure, making wise the simple..."
                      className="w-full bg-[#0B132B] border border-[#D4AF37]/30 rounded-lg px-3 py-2 text-sm text-[#F9F6F0] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Multi-Page Engine Overview */}
              <div className="bg-[#1C2541] border border-[#D4AF37]/20 rounded-xl p-4 sm:p-5">
                <h4 className="font-serif font-bold text-base text-[#D4AF37] mb-2">Smart Auto-Flow Pagination</h4>
                <p className="text-xs text-[#6B7A8D] mb-3 leading-relaxed">
                  The lesson sheet automatically calculates content density and expands or contracts dynamically to the exact number of pages required (whether 2, 4, 8, 12, or 16+ pages).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-[#0B132B] rounded-lg border border-[#D4AF37]/20">
                    <span className="font-bold text-[#D4AF37] block">Page 1 (KJV 1)</span>
                    <span className="text-[#6B7A8D]">Video Lower-Third Cover Banner, Prayer Bar, Initial Precepts</span>
                  </div>
                  <div className="p-3 bg-[#0B132B] rounded-lg border border-[#D4AF37]/20">
                    <span className="font-bold text-[#D4AF37] block">Middle Pages (KJV 2 to N-1)</span>
                    <span className="text-[#6B7A8D]">Dynamic Flow of Scriptures, Bullet Notes & Word Art</span>
                  </div>
                  <div className="p-3 bg-[#0B132B] rounded-lg border border-[#D4AF37]/20">
                    <span className="font-bold text-[#D4AF37] block">Final Page (KJV {totalPages})</span>
                    <span className="text-[#6B7A8D]">Conclusion Box, Ruled Student Notes & IOG Footer</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
