import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { PlusCircle, Video, BookOpen, Loader2, Sparkles, Link as LinkIcon, FileText } from "lucide-react";

interface ImportLessonDialogProps {
  trigger?: React.ReactNode;
  onSuccess?: (studyId: number) => void;
}

const CATEGORIES = [
  "Teaching",
  "Sabbath & Law",
  "Prophecy & History",
  "The Holy Days",
  "Dietary Laws",
  "Salvation & Covenant",
  "Hebrew Heritage",
  "General Study",
];

export default function ImportLessonDialog({ trigger, onSuccess }: ImportLessonDialogProps) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [topic, setTopic] = useState("Bible Study");
  const [category, setCategory] = useState("Teaching");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [initialNotes, setInitialNotes] = useState("");

  const utils = trpc.useUtils();

  const createStudy = trpc.studies.create.useMutation({
    onSuccess: async (data) => {
      const studyId = data.id;
      if (studyId) {
        // If user added initial notes, save them into Cornell notes
        if (initialNotes.trim()) {
          try {
            await createNote.mutateAsync({
              studyId,
              questions: JSON.stringify(["Key Questions & Scripture"]),
              notes: JSON.stringify([initialNotes.trim()]),
              summary: summary.trim() || "Initial study notes imported.",
            });
          } catch (e) {
            console.error("Could not save initial note:", e);
          }
        }

        utils.studies.list.invalidate();
        toast.success(`Lesson "${title}" imported! Opening study workspace...`);
        setOpen(false);
        resetForm();

        if (onSuccess) {
          onSuccess(studyId);
        } else {
          setLocation(`/notes?studyId=${studyId}`);
        }
      }
    },
    onError: (err) => {
      toast.error(`Import failed: ${err.message}`);
    }
  });

  const createNote = trpc.notes.save.useMutation();

  const resetForm = () => {
    setTitle("");
    setVideoUrl("");
    setTopic("Bible Study");
    setCategory("Teaching");
    setSummary("");
    setDescription("");
    setInitialNotes("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a lesson title.");
      return;
    }

    createStudy.mutate({
      title: title.trim(),
      videoUrl: videoUrl.trim() || undefined,
      topic: topic.trim() || "Bible Study",
      category: category.trim() || "Teaching",
      summary: summary.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B132B] font-bold text-xs">
            <PlusCircle className="w-4 h-4" />
            Import Lesson
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px] bg-[#0B132B] border border-[#D4AF37]/30 text-[#F9F6F0] p-6 rounded-2xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold font-serif text-[#F9F6F0] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#D4AF37]" />
            Import Custom Lesson or Study
          </DialogTitle>
          <p className="text-xs text-[#6B7A8D]">
            Add any YouTube video, audio class, or theological topic to study with full Cornell Notes and AI assistance.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#D4AF37]">Lesson Title *</label>
            <Input
              placeholder="e.g. 8-29-26 The Seventy Weeks of Daniel (Part 1)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-10 text-xs rounded-xl"
              required
            />
          </div>

          {/* Video / Audio / Drive URL */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#D4AF37] flex items-center gap-1">
              <Video size={13} />
              Video / Audio URL (YouTube, Drive, or Web Link)
            </label>
            <Input
              placeholder="https://www.youtube.com/watch?v=... or direct link"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-10 text-xs rounded-xl"
            />
          </div>

          {/* Category & Topic */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#D4AF37]">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#1C2541] border border-white/10 text-white text-xs h-10 rounded-xl px-3 outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-[#0B132B]">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#D4AF37]">Topic</label>
              <Input
                placeholder="e.g. Prophecy, Law, Sabbath"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-10 text-xs rounded-xl"
              />
            </div>
          </div>

          {/* Summary / Outline */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#D4AF37]">Summary / Scripture Outline</label>
            <Textarea
              placeholder="Key scriptures and lesson overview (e.g. Daniel 9:24-27, Ezra 7)..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-xs rounded-xl resize-none h-20"
            />
          </div>

          {/* Initial Notes */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#D4AF37]">Initial Cornell Notes (Optional)</label>
            <Textarea
              placeholder="Paste any class transcripts, notes, or commentary to prefill your study..."
              value={initialNotes}
              onChange={(e) => setInitialNotes(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-xs rounded-xl resize-none h-20"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-xs text-[#6B7A8D] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createStudy.isPending || !title.trim()}
              className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0B132B] font-bold text-xs px-5 rounded-xl gap-2"
            >
              {createStudy.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
              ) : (
                <><BookOpen className="w-4 h-4" /> Import & Start Study</>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
