import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Printer, Download, BookOpen, Loader2, Sparkles, X, RefreshCw, FileText } from "lucide-react";

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
  const [isGenerating, setIsGenerating] = useState(false);

  const effectiveStudyId = studyId && studyId > 0 ? studyId : 14161;

  const utils = trpc.useUtils();

  const generatePdfMutation = trpc.studies.generateSabbathPdf.useMutation({
    onSuccess: (data) => {
      setHtmlContent(data.html);
      utils.pdfs.list.invalidate();
      utils.pdfs.getByStudy.invalidate({ studyId: effectiveStudyId });
      toast.success(data.message || "Official Sabbath Lesson Sheet generated!");
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

  const handleStudy = () => {
    setLocation(`/notes?studyId=${studyId}`);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        onOpenAutoFocus={handleOpen}
        className="max-w-4xl w-[95vw] h-[90vh] bg-[#0B132B] border border-[#D4AF37]/30 text-[#F9F6F0] p-0 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header Bar */}
        <div className="p-4 bg-[#1C2541] border-b border-[#D4AF37]/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20">
              <FileText className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold font-serif text-[#F9F6F0] truncate max-w-md">
                {studyTitle} — Official Sabbath Lesson Sheet
              </DialogTitle>
              <p className="text-xs text-[#6B7A8D]">
                Formatted according to The Israel of God Bible Study Class standards.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
              Re-Build
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={!htmlContent}
              className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B132B] font-bold text-xs gap-1.5"
            >
              <Printer size={14} />
              Print / Save PDF
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStudy}
              className="text-[#F9F6F0] hover:text-[#D4AF37] text-xs gap-1.5"
            >
              <BookOpen size={14} />
              Open in Cornell Notes
            </Button>
          </div>
        </div>

        {/* Content Viewer (Iframe displaying official HTML) */}
        <div className="flex-1 bg-white relative overflow-hidden">
          {isGenerating ? (
            <div className="absolute inset-0 bg-[#0B132B] flex flex-col items-center justify-center gap-3 text-[#F9F6F0]">
              <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
              <p className="text-sm font-serif">Compiling KJV scriptures and lesson outline...</p>
              <span className="text-xs text-[#6B7A8D]">Formatting official Israel of God reading sheet</span>
            </div>
          ) : htmlContent ? (
            <iframe
              srcDoc={htmlContent}
              title={studyTitle}
              className="w-full h-full border-0"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              Click "Re-Build" to generate lesson PDF.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
