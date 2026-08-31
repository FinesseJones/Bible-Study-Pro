import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Calendar, Book, Heart, Bookmark, Send, Plus, Trash2, Edit3, 
  Image as ImageIcon, Eraser, PenTool, LayoutGrid, ListChecks, 
  History, Star, ChevronRight, FileText, Map, Loader2, Brain, BookOpen,
  X
} from "lucide-react";
import HandwritingCanvas from "@/components/HandwritingCanvas";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useLocation } from "wouter";

type JournalSection = "Sabbath" | "Daily" | "Prayer" | "Feast" | "Memory" | "History";

interface DBEntry {
  id: number;
  section: string;
  title: string;
  scripture?: string;
  notes?: string;
  prayer?: string;
  tags?: string;
  handwritingData?: string;
  createdAt: Date;
}

const scriptureRegex = /((?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation)\s+\d+:\d+(?:-\d+)?)/gi;

function getLogosUrl(reference: string) {
  const encoded = encodeURIComponent(reference);
  return `https://app.logos.com/books/LLS%3AKJV1900/references/bible%2Bkjv.${encoded}`;
}

function highlightScripture(text: string) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  const regex = new RegExp(scriptureRegex.source, 'gi');

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <a
        key={match.index}
        href={getLogosUrl(match[0])}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#D4AF37] underline decoration-[#D4AF37]/30 hover:text-[#E8C85A] transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {match[0]}
      </a>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default function Journal() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState<JournalSection>("Sabbath");
  const [isAdding, setIsAdding] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [reflectingId, setReflectingId] = useState<number | null>(null);
  const [reflections, setReflections] = useState<Record<number, string>>({});
  const [newEntry, setNewEntry] = useState({
    title: "",
    scripture: "",
    notes: "",
    prayer: "",
    tags: "",
    handwritingData: ""
  });

  const { data: dbEntries = [], refetch } = trpc.journal.list.useQuery(
    { section: activeSection },
    { enabled: isAuthenticated }
  );

  const createMutation = trpc.journal.create.useMutation();

  const reflectMutation = trpc.ai.chat.useMutation({
    onSuccess: (data, variables) => {
      setReflections(prev => ({ ...prev, [variables.studyIds?.[0] ?? 0]: data.answer }));
    },
    onSettled: () => {
      setReflectingId(null);
    }
  });

  const handleAddEntry = async () => {
    if (!newEntry.title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    try {
      await createMutation.mutateAsync({
        section: activeSection,
        title: newEntry.title,
        scripture: newEntry.scripture || undefined,
        notes: newEntry.notes || undefined,
        prayer: newEntry.prayer || undefined,
        tags: newEntry.tags || undefined,
        handwritingData: newEntry.handwritingData || undefined,
      });

      setNewEntry({ title: "", scripture: "", notes: "", prayer: "", tags: "", handwritingData: "" });
      setIsAdding(false);
      setShowCanvas(false);
      refetch();
      toast.success("Journal entry saved!");
    } catch (err) {
      toast.error("Failed to save entry");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await trpc.journal.delete.useMutation().mutateAsync({ id });
      refetch();
      toast.success("Entry deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleReflect = (entry: DBEntry) => {
    setReflectingId(entry.id);
    const preferredAgent = (localStorage.getItem("preferred_theological_agent") as "local" | "vps" | "openrouter") || "local";
    reflectMutation.mutate({
      question: `Provide a thoughtful theological reflection on this journal entry:\n\nTitle: ${entry.title}\nScripture: ${entry.scripture || "None"}\nNotes: ${entry.notes || "None"}`,
      studyIds: [entry.id],
      agent: preferredAgent,
    });
  };

  const sections = [
    { id: "Sabbath", label: "Sabbath Lessons", icon: Book, color: "#D4AF37" },
    { id: "Daily", label: "Daily Reflections", icon: Edit3, color: "#4A90E2" },
    { id: "Prayer", label: "Prayer Requests", icon: Heart, color: "#E91E63" },
    { id: "Feast", label: "Feast Day Prep", icon: Star, color: "#FF9800" },
    { id: "Memory", label: "Memory Verses", icon: Bookmark, color: "#8BC34A" },
    { id: "History", label: "Biblical History", icon: History, color: "#9C27B0" },
  ];

  const allEntries: DBEntry[] = [
    ...dbEntries.map(d => ({
      id: d.id,
      section: d.section,
      title: d.title,
      scripture: d.scripture ?? undefined,
      notes: d.notes ?? undefined,
      prayer: d.prayer ?? undefined,
      tags: d.tags ?? undefined,
      handwritingData: d.handwritingData ?? undefined,
      createdAt: new Date(d.createdAt),
    })),
    {
      id: 1,
      section: "Sabbath",
      date: "Sabbath, April 25, 2026",
      title: "The Four Winds of Heaven",
      scripture: "Daniel 7:1-3, Revelation 7:1",
      notes: "The four winds represent the four major Gentile kingdoms...",
      prayer: "Strengthen our understanding of the prophecies.",
      tags: "Prophecy, Gentile Kingdoms",
      handwritingData: "",
      createdAt: new Date(),
    } as DBEntry,
  ];

  const filteredEntries = allEntries.filter(e => e.section === activeSection);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B132B]">
        <p className="text-[#6B7A8D]">Please sign in to access your journal.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B132B] text-[#F9F6F0] flex flex-col md:flex-row">
      <div className="w-full md:w-72 bg-[#1C2541] border-r border-[#D4AF37]/10 flex flex-col h-auto md:h-screen sticky top-0">
        <div className="p-8 border-b border-[#D4AF37]/10 flex flex-col gap-4">
          <button 
            onClick={() => setLocation("/")} 
            className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-[#6B7A8D] hover:text-[#D4AF37] transition-colors self-start"
          >
            <ChevronRight size={14} className="rotate-180" /> Back to Dashboard
          </button>
          <div>
            <h1 className="text-2xl font-bold font-serif text-[#D4AF37]">IOG Journal</h1>
            <p className="text-xs text-[#6B7A8D] mt-1.5 uppercase tracking-widest">13-Week Quarterly</p>
          </div>
        </div>

        <div className="flex-1 py-6 overflow-y-auto px-4 space-y-2">
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id as JournalSection)}
              className={`w-full flex items-center justify-between p-4 rounded-xl transition-all duration-300 group ${
                activeSection === sec.id 
                  ? 'bg-[#D4AF37] text-[#0B132B] shadow-lg shadow-[#D4AF37]/20' 
                  : 'text-[#6B7A8D] hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <sec.icon className={`w-5 h-5 ${activeSection === sec.id ? 'text-[#0B132B]' : 'text-[#D4AF37]'}`} />
                <span className="font-serif font-bold text-sm">{sec.label}</span>
              </div>
              <ChevronRight className={`w-4 h-4 transition-transform ${activeSection === sec.id ? 'rotate-90' : 'opacity-0 group-hover:opacity-100'}`} />
            </button>
          ))}
        </div>

        <div className="p-6 bg-[#0B132B]/50 m-4 rounded-2xl border border-[#D4AF37]/10">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37]">Quarterly Roadmap</span>
            <span className="text-[10px] text-[#6B7A8D]">Week {Math.min(filteredEntries.length, 13)} / 13</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 13 }).map((_, i) => (
              <div 
                key={i} 
                className={`h-4 rounded-sm border ${
                  i < filteredEntries.length ? 'bg-[#D4AF37] border-[#D4AF37]' : 'border-[#6B7A8D]/20'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 h-screen overflow-y-auto">
        <div className="container max-w-5xl py-8 md:py-12 px-6 pb-24 safe-pb">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-[#D4AF37]/10 rounded-lg">
                  {(() => {
                    const Icon = sections.find(s => s.id === activeSection)?.icon;
                    return Icon ? <Icon className="w-6 h-6 text-[#D4AF37]" /> : null;
                  })()}
                </div>
                <h2 className="text-4xl font-bold font-serif text-[#F9F6F0]">{sections.find(s => s.id === activeSection)?.label}</h2>
              </div>
              <p className="text-[#6B7A8D]">Documenting your journey in the {activeSection} section</p>
            </div>
            <Button 
              onClick={() => setIsAdding(true)}
              className="bg-[#D4AF37] text-[#0B132B] font-bold px-8 py-6 rounded-xl hover:scale-105 transition-transform"
            >
              <Plus className="w-5 h-5 mr-2" /> New Entry
            </Button>
          </div>

          {isAdding && (
            <Card className="p-8 bg-[#1C2541]/80 border-[#D4AF37]/30 backdrop-blur-xl mb-12">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-serif font-bold text-[#D4AF37]">New {activeSection} Entry</h3>
                <Button variant="ghost" onClick={() => setIsAdding(false)}><X className="w-6 h-6" /></Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B7A8D]">Title / Subject</label>
                    <Input 
                      value={newEntry.title}
                      onChange={e => setNewEntry({...newEntry, title: e.target.value})}
                      placeholder="Enter a descriptive title..."
                      className="bg-[#0B132B] border-[#D4AF37]/20 h-12 text-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B7A8D]">Scripture Focus</label>
                    <Input 
                      value={newEntry.scripture}
                      onChange={e => setNewEntry({...newEntry, scripture: e.target.value})}
                      placeholder="e.g. Genesis 1:1, Proverbs 3:5"
                      className="bg-[#0B132B] border-[#D4AF37]/20 h-12 text-lg font-serif italic"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B7A8D]">Notes / Handwriting</label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowCanvas(!showCanvas)}
                      className="bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30"
                    >
                      <PenTool className="w-4 h-4 mr-2" /> {showCanvas ? "Type Text" : "Use Pencil"}
                    </Button>
                  </div>
                  {showCanvas ? (
                    <HandwritingCanvas onSave={(data) => setNewEntry({...newEntry, handwritingData: data})} />
                  ) : (
                    <Textarea 
                      value={newEntry.notes}
                      onChange={e => setNewEntry({...newEntry, notes: e.target.value})}
                      placeholder="Begin your reflection..."
                      className="min-h-[220px] bg-[#0B132B] border-[#D4AF37]/20 text-lg leading-relaxed"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-4 border-t border-[#D4AF37]/10 pt-8">
                <Button variant="ghost" onClick={() => setIsAdding(false)}>Discard</Button>
                <Button onClick={handleAddEntry} className="bg-[#D4AF37] text-[#0B132B] font-bold px-10 h-12">Save to Journal</Button>
              </div>
            </Card>
          )}

          <div className="space-y-8 pb-20">
            {filteredEntries.length === 0 && (
              <div className="text-center py-24 border-2 border-dashed border-[#D4AF37]/10 rounded-3xl">
                <div className="w-20 h-20 bg-[#D4AF37]/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Book className="w-10 h-10 text-[#D4AF37]/20" />
                </div>
                <h3 className="text-xl font-serif text-[#6B7A8D]">No entries in this section yet.</h3>
                <p className="text-sm text-[#6B7A8D]/60 mt-2">Start your 13-week journey by creating your first entry.</p>
              </div>
            )}
            
            {filteredEntries.map(entry => (
              <Card key={entry.id} className="group relative overflow-hidden bg-[#1C2541]/40 border-[#D4AF37]/10 hover:border-[#D4AF37]/40 transition-all duration-500">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#D4AF37] opacity-50 group-hover:opacity-100 transition-opacity" />
                
                <div className="p-8 md:p-12">
                  <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] bg-[#D4AF37]/10 px-3 py-1 rounded-full">
                        {new Date(entry.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                      <h3 className="text-3xl font-bold font-serif text-[#F9F6F0] mt-4">{entry.title}</h3>
                      {entry.scripture && (
                        <p className="text-xl font-serif italic text-[#D4AF37]/70 mt-2">
                          {highlightScripture(entry.scripture)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-[#6B7A8D] hover:text-[#D4AF37]"
                        onClick={() => handleReflect(entry)}
                        disabled={reflectingId === entry.id}
                      >
                        {reflectingId === entry.id ? <Loader2 size={18} className="animate-spin" /> : <Brain size={18} />}
                      </Button>
                      <Button variant="ghost" size="icon" className="text-[#6B7A8D] hover:text-red-400" onClick={() => handleDelete(entry.id)}>
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    <div className="md:col-span-12">
                      {entry.handwritingData ? (
                        <div className="bg-white/95 rounded-2xl p-8 shadow-inner overflow-hidden border-2 border-[#D4AF37]/10">
                          <img src={entry.handwritingData} alt="Handwritten entry" className="w-full max-h-[400px] object-contain" />
                        </div>
                      ) : (
                        <div className="relative">
                          <p className="text-xl leading-relaxed text-[#F9F6F0]/80 font-serif whitespace-pre-wrap pl-6 border-l-2 border-[#D4AF37]/10">
                            {highlightScripture(entry.notes || "")}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {reflections[entry.id] && (
                    <div className="mt-8 p-6 bg-[#D4AF37]/5 rounded-2xl border border-[#D4AF37]/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Brain className="w-4 h-4 text-[#D4AF37]" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37]">AI Reflection</span>
                      </div>
                      <p className="text-sm text-[#F9F6F0]/80 leading-relaxed">{reflections[entry.id]}</p>
                    </div>
                  )}

                  {entry.prayer && (
                    <div className="mt-12 p-6 bg-[#0B132B]/50 rounded-2xl border border-[#D4AF37]/10 flex items-start gap-4">
                      <div className="p-2 bg-[#D4AF37]/10 rounded-lg shrink-0">
                        <Heart className="w-5 h-5 text-[#D4AF37]" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37]">Prayer / Personal Meditation</span>
                        <p className="text-sm text-[#6B7A8D] mt-2 italic">"{entry.prayer}"</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
