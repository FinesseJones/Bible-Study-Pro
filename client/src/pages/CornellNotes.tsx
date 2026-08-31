import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Download, X, Mic, Square, Wand2, Image as ImageIcon, Video, Monitor, Scroll, HelpCircle, Send, ChevronRight, Edit3, Brain, BookOpen, CheckCircle, PanelLeft, PanelRight, Book, HelpCircle as QuestionIcon, RefreshCw, FileDown, MoreVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useLocation } from "wouter";
import { getViewableUrl } from "@/lib/docUrl";
import { useIsMobile } from "@/hooks/useMobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ImportLessonDialog from "@/components/ImportLessonDialog";
import SabbathLessonPdfModal from "@/components/SabbathLessonPdfModal";
import { STRONGS_DICTIONARY, lookupStrongs, StrongsEntry } from "@shared/strongsData";
import { findCompanionPrecepts, PreceptMapping } from "@/lib/precepts";
import { Clock, Tag, Sparkles as SparklesIcon, Printer } from "lucide-react";


const SpeechRecognition = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
}

interface CornellNotesData {
  questions: string[];
  notes: string[];
  summary: string;
}

interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

interface Flashcard {
  front: string;
  back: string;
}

interface StudyGuideData {
  summary: string;
  keyPoints: string[];
  discussionQuestions: string[];
  flashcards: Flashcard[];
}

const LOGOS_URL = "https://app.logos.com/books/LLS%3AKJV1900/references/bible%2Bkjv.64.1.1?zzls=2eMKcTcKLwrEOwoIwFEXDv8OlJW7ChAYkGsK7EScTNkbDo1DDoCkvwpTCtsK%2BFhLDk8O0w5%2FCrcKbw5vDjcK5w6dEw5jCkT1ZA8KyKsOAKcKDwrp1w65qw5dVwpnDicKDwrzDhwzDg2zDlMKKIEEMw5YuXnRdfzjCtsO1wqXCrMOKw7osGMKfw4hoRsO0YsKgQWN5asOyUUEBw68Nw7kDMkIgw73Di8KZXnPDiFzCk1l6DMK3KcKzFlIqIsKoMcOQwp7CncOAG8O%2BwoXCjsOJMsKFwrzCm8KUHsOpC8KQw605wrY%3D&tile=left&linkSetId=A";

export default function CornellNotes({ embedded = false }: { embedded?: boolean }) {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [activeMobileTab, setActiveMobileTab] = useState<"media" | "notes">("media");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [studyId, setStudyId] = useState<number | null>(null);
  const [notesData, setNotesData] = useState<CornellNotesData>({
    questions: [""],
    notes: [""],
    summary: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [leftTab, setLeftTab] = useState<"video" | "pdf" | "logos" | "mic">("video");
  const [rightTab, setRightTab] = useState<"notes" | "guide" | "ai">("notes");
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [waveformData, setWaveformData] = useState<number[]>(new Array(32).fill(0));
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);
  const streamReaderRef = useRef<ReadableStreamDefaultReader | null>(null);

  // Phase 4: Study Guide, Flashcard, and Scripture States
  const [studyGuide, setStudyGuide] = useState<StudyGuideData | null>(null);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  
  // Scripture Lookup states
  const [selectedScripture, setSelectedScripture] = useState<string | null>(null);
  const [scriptureText, setScriptureText] = useState("");
  const [isLoadingScripture, setIsLoadingScripture] = useState(false);
  const [selectedPrecepts, setSelectedPrecepts] = useState<PreceptMapping[]>([]);

  // Sabbath Lesson PDF Modal State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  // Strong's Concordance Popover State
  const [strongsModalEntry, setStrongsModalEntry] = useState<StrongsEntry | null>(null);

  // Spaced-Repetition Flashcards Progress
  const [flashcardScores, setFlashcardScores] = useState<Record<number, "again" | "hard" | "good" | "mastered">>({});

  // Dynamic Multi-Agent Selector State
  const [selectedAgent, setSelectedAgent] = useState<"local" | "vps" | "openrouter">(() => {
    return (localStorage.getItem("preferred_theological_agent") as any) || "local";
  });

  const handleAgentChange = (agent: "local" | "vps" | "openrouter") => {
    setSelectedAgent(agent);
    localStorage.setItem("preferred_theological_agent", agent);
    toast.success(`AI Agent switched to: ${agent === 'local' ? 'Local GPU' : agent === 'vps' ? 'Remote VPS' : 'Gemini Cloud'}`);
  };

  const handleSeekVideo = (seconds: number) => {
    const iframe = document.getElementById("youtube-lesson-player") as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
        "*"
      );
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      toast.info(`Jumping video to ${mins}:${secs.toString().padStart(2, "0")}`);
    }
  };

  const insertTimestamp = (type: "question" | "note", index: number) => {
    const mins = Math.floor(recordingTime / 60);
    const secs = recordingTime % 60;
    const timecode = `[${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}]`;

    if (type === "question") {
      const updated = [...notesData.questions];
      updated[index] = `${updated[index] || ""} ${timecode} `.trim();
      setNotesData({ ...notesData, questions: updated });
    } else {
      const updated = [...notesData.notes];
      updated[index] = `${updated[index] || ""} ${timecode} `.trim();
      setNotesData({ ...notesData, notes: updated });
    }
    toast.success(`Inserted timecode ${timecode}`);
  };

  const utils = trpc.useUtils();

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const [externalLesson, setExternalLesson] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const idFromQuery = params.get("studyId");
      const urlFromQuery = params.get("lessonUrl");
      const titleFromQuery = params.get("lessonTitle");

      if (idFromQuery) {
        setStudyId(Number(idFromQuery));
      } else if (urlFromQuery && titleFromQuery) {
        setExternalLesson({
          title: decodeURIComponent(titleFromQuery),
          url: decodeURIComponent(urlFromQuery)
        });
      }
    }
  }, []);

  const { data: studies = [], refetch: refetchStudies } = trpc.studies.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: existingNotes } = trpc.notes.getByStudy.useQuery(
    { studyId: studyId! },
    { enabled: !!studyId }
  );

  const { data: savedTranscriptRecord } = trpc.liveTranscripts.getByStudy.useQuery(
    { studyId: studyId ?? 0 },
    { enabled: !!studyId }
  );

  useEffect(() => {
    if (savedTranscriptRecord?.transcript) {
      setLiveTranscript(savedTranscriptRecord.transcript);
    } else {
      setLiveTranscript("");
    }
  }, [savedTranscriptRecord]);

  // Phase 4: Fetch linked PDFs to allow document chat (RAG)
  const { data: studyPdfs = [] } = trpc.pdfs.getByStudy.useQuery(
    { studyId: studyId ?? 0 },
    { enabled: !!studyId }
  );

  useEffect(() => {
    if (existingNotes) {
      setNotesData({
        questions: existingNotes.questions ? JSON.parse(existingNotes.questions) : [""],
        notes: existingNotes.notes ? JSON.parse(existingNotes.notes) : [""],
        summary: existingNotes.summary || "",
      });
      setAttachments(existingNotes.attachments ? JSON.parse(existingNotes.attachments) : []);
    }
  }, [existingNotes]);

  // Load liveTranscript & notesData drafts from localStorage on mounting or switching to studyId === 0
  useEffect(() => {
    if (studyId === 0) {
      const savedTranscriptDraft = localStorage.getItem("bsp_live_transcript");
      if (savedTranscriptDraft) {
        setLiveTranscript(savedTranscriptDraft);
        toast.info("Restored live transcript draft from your last session.");
      }
      const savedNotesDraft = localStorage.getItem("bsp_live_notes_data");
      if (savedNotesDraft) {
        try {
          setNotesData(JSON.parse(savedNotesDraft));
        } catch (e) {
          console.error("Failed to parse notes draft:", e);
        }
      }
    }
  }, [studyId]);

  // Persist liveTranscript & notesData to localStorage in real-time when studyId is 0
  useEffect(() => {
    if (studyId === 0) {
      if (liveTranscript) {
        localStorage.setItem("bsp_live_transcript", liveTranscript);
      } else {
        localStorage.removeItem("bsp_live_transcript");
      }
    }
  }, [liveTranscript, studyId]);

  useEffect(() => {
    if (studyId === 0) {
      localStorage.setItem("bsp_live_notes_data", JSON.stringify(notesData));
    }
  }, [notesData, studyId]);

  const createMutation = trpc.notes.create.useMutation();
  const updateMutation = trpc.notes.update.useMutation();
  const synthesizeMutation = trpc.ai.synthesizeNotes.useMutation();
  const generateGuideMutation = trpc.ai.generateStudyGuide.useMutation();
  const saveTranscriptMutation = trpc.liveTranscripts.save.useMutation();

  const saveToDB = useCallback(async (overrideStudyId?: number) => {
    const activeStudyId = overrideStudyId ?? studyId;
    if (!activeStudyId) return;
    setIsSaving(true);
    try {
      const payload = {
        questions: JSON.stringify(notesData.questions),
        notes: JSON.stringify(notesData.notes),
        summary: notesData.summary,
        attachments: JSON.stringify(attachments),
      };

      if (existingNotes?.id) {
        await updateMutation.mutateAsync({ id: existingNotes.id, ...payload });
      } else {
        await createMutation.mutateAsync({ studyId: activeStudyId, ...payload });
      }
      setLastSaved(new Date());
    } catch (error) {
      console.error("Auto-save failed:", error);
    } finally {
      setIsSaving(false);
    }
  }, [studyId, notesData, attachments, existingNotes, createMutation, updateMutation]);

  useEffect(() => {
    if (studyId) {
      const timer = setTimeout(() => {
        saveToDB();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notesData, studyId, saveToDB]);

  const handleSave = async () => {
    try {
      let activeStudyId = studyId;

      if (!activeStudyId || activeStudyId === 0) {
        if (!liveTranscript.trim()) {
          toast.error("Nothing to save. Please select a study or record some live transcript first.");
          return;
        }

        toast.info("Saving live transcript and creating new study...");
        const result = await saveTranscriptMutation.mutateAsync({
          studyId: activeStudyId,
          transcript: liveTranscript,
          duration: recordingTime,
        });

        activeStudyId = result.studyId;
        setStudyId(activeStudyId);
        setIsLiveMode(false);
        await refetchStudies();
        
        // Clean up the unsaved drafts from localStorage
        localStorage.removeItem("bsp_live_transcript");
        localStorage.removeItem("bsp_live_notes_data");
        
        toast.success("Live study created successfully!");
      } else {
        if (liveTranscript.trim()) {
          await saveTranscriptMutation.mutateAsync({
            studyId: activeStudyId,
            transcript: liveTranscript,
            duration: recordingTime,
          });
        }
      }

      await saveToDB(activeStudyId);
      toast.success("Notes saved successfully!");
    } catch (err: any) {
      console.error("Failed to save study/notes:", err);
      toast.error(err.message || "Failed to save");
    }
  };

  const updateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const bars = 32;
    const step = Math.floor(dataArray.length / bars);
    const values = Array.from({ length: bars }, (_, i) => {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j];
      }
      return sum / step / 255;
    });
    setWaveformData(values);
    animationFrameRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  const startWaveform = useCallback(() => {
    if (audioContextRef.current) return;
    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 256;
    updateWaveform();
  }, [updateWaveform]);

  const stopWaveform = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    setWaveformData(new Array(32).fill(0));
  }, []);

  const appendTimestampedBullet = useCallback((text: string) => {
    const timestamp = formatTime(recordingTime);
    const bullet = `[${timestamp}] ${text.trim()}`;
    setNotesData(prev => {
      const currentNotes = [...prev.notes];
      const lastNote = currentNotes[currentNotes.length - 1] || "";
      if (lastNote && !lastNote.endsWith("\n")) {
        currentNotes[currentNotes.length - 1] = lastNote + "\n• " + bullet;
      } else {
        currentNotes[currentNotes.length - 1] = (lastNote || "") + "• " + bullet;
      }
      return { ...prev, notes: currentNotes };
    });
  }, [recordingTime]);

  const detectSmartPause = useCallback(() => {
    const now = Date.now();
    if (now - lastSpeechTimeRef.current > 3000 && isRecordingRef.current) {
      setNotesData(prev => {
        const currentNotes = [...prev.notes];
        const lastNote = currentNotes[currentNotes.length - 1] || "";
        if (lastNote && !lastNote.endsWith("\n\n")) {
          currentNotes[currentNotes.length - 1] = lastNote + "\n\n";
        }
        return { ...prev, notes: currentNotes };
      });
    }
  }, []);

  const toggleRecording = async () => {
    if (!recognition) {
      toast.error("Speech recognition not supported in this browser.");
      return;
    }

    if (isRecordingRef.current) {
      console.log("[Speech] Stopping recording...");
      isRecordingRef.current = false;
      recognition.stop();
      setIsRecording(false);
      setInterimTranscript("");
      stopWaveform();
      if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
      toast.success("Live transcription captured! Click 'AI Sync' to process the notes.");
    } else {
      console.log("[Speech] Starting recording...");
      setLiveTranscript("");
      setInterimTranscript("");
      setIsRecording(true);
      isRecordingRef.current = true;
      startWaveform();
      lastSpeechTimeRef.current = Date.now();
      silenceTimerRef.current = setInterval(detectSmartPause, 1000);
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptSnippet = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptSnippet + " ";
          } else {
            interim += transcriptSnippet;
          }
        }

        if (finalTranscript) {
          setLiveTranscript(prev => prev + finalTranscript);
          setInterimTranscript("");
          lastSpeechTimeRef.current = Date.now();
          appendTimestampedBullet(finalTranscript);
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error:", event.error);
        if (event.error === 'not-allowed') {
          toast.error("Microphone access denied. Please enable it in browser settings.");
          setIsRecording(false);
          isRecordingRef.current = false;
          stopWaveform();
        }
      };

      recognition.onend = () => {
        console.log("[Speech] Recognition ended.");
        if (isRecordingRef.current) {
          try {
            recognition.start();
          } catch (e) {
            console.error("Auto-restart failed:", e);
          }
        } else {
          setIsRecording(false);
          stopWaveform();
        }
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (analyserRef.current && audioContextRef.current) {
          const source = audioContextRef.current.createMediaStreamSource(stream);
          source.connect(analyserRef.current);
        }
        recognition.start();
        toast.info("Listening to live lesson...");
      } catch (e) {
        console.error("Failed to start recording:", e);
        toast.error("Could not access microphone.");
        setIsRecording(false);
        isRecordingRef.current = false;
        stopWaveform();
      }
    }
  };

  const handleAutoGenerate = async () => {
    if (!studyId && !liveTranscript) {
      toast.error("Please select a study or record a live lesson first.");
      return;
    }
    setIsGenerating(true);
    setStreamingContent("");
    setIsStreaming(true);
    
    try {
      const result = await synthesizeMutation.mutateAsync({
        studyId: studyId || undefined,
        liveTranscript: liveTranscript || undefined,
        agent: selectedAgent,
      });
      
      setNotesData({
        questions: result.questions || [],
        notes: result.notes || [],
        summary: result.summary || ""
      });
      setIsStreaming(false);
      toast.success("AI successfully generated your notes!");
    } catch (err) {
      setIsStreaming(false);
      toast.error("Failed to generate notes using AI.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Phase 4.1: Study Guide and Flashcard Generator
  const handleGenerateStudyGuide = async () => {
    setIsGeneratingGuide(true);
    try {
      const activePdfId = studyPdfs[0]?.id;
      const res = await generateGuideMutation.mutateAsync({
        pdfId: activePdfId,
        studyId: studyId || undefined,
        agent: selectedAgent,
      });
      setStudyGuide(res);
      setActiveCardIndex(0);
      setIsCardFlipped(false);
      toast.success("AI generated a complete study guide and interactive flashcards!");
    } catch (err) {
      console.error(err);
      toast.error("Could not generate study guide.");
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  // Phase 4.2: KJV Scripture Lookup service & Companion Precepts
  const handleScriptureClick = async (reference: string) => {
    setSelectedScripture(reference);
    setIsLoadingScripture(true);
    setScriptureText("");
    
    // Automatically find companion precepts for this scripture
    const precepts = findCompanionPrecepts(reference);
    setSelectedPrecepts(precepts);

    try {
      const res = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}?translation=kjv`);
      const data = await res.json();
      if (data.text) {
        setScriptureText(data.text);
      } else {
        setScriptureText("Could not find KJV scripture matching reference.");
      }
    } catch {
      setScriptureText("Failed to lookup KJV scripture. Check internet connection.");
    } finally {
      setIsLoadingScripture(false);
    }
  };

  // Phase 4.2: Parse standard Bible references, Timecodes [MM:SS], and Strong's H/G tags inside text blocks
  const renderTextWithBibleLinks = (text: string) => {
    if (!text) return null;
    
    const TOKEN_REGEX = /(\b(?:Gen(?:esis)?|Exo(?:dus)?|Lev(?:iticus)?|Num(?:bers)?|Deut(?:eronomy)?|Josh(?:ua)?|Judg(?:es)?|Ruth|1\s?Sam(?:uel)?|2\s?Sam(?:uel)?|1\s?Kings?|2\s?Kings?|1\s?Chron(?:icles)?|2\s?Chron(?:icles)?|Ezra|Neh(?:emiah)?|Esth(?:er)?|Job|Psa(?:lm)?s?|Prov(?:erbs)?|Eccl(?:esiates)?|Song(?:\sof\sSolomon)?|Isa(?:iah)?|Jer(?:emiah)?|Lam(?:entations)?|Eze(?:kiel)?|Dan(?:iel)?|Hos(?:ea)?|Joel|Amos|Obad(?:iah)?|Jonah|Mic(?:ah)?|Nah(?:um)?|Hab(?:akkuk)?|Zeph(?:aniah)?|Hag(?:gai)?|Zech(?:ariah)?|Mal(?:achi)?|Matt(?:hew)?|Mark|Luke|John|Acts?|Rom(?:ans)?|1\s?Cor(?:inthians)?|2\s?Cor(?:inthians)?|Gal(?:atians)?|Eph(?:esians)?|Phil(?:ippians)?|Col(?:ossians)?|1\s?Thess(?:alonians)?|2\s?Thess(?:alonians)?|1\s?Tim(?:othy)?|2\s?Tim(?:othy)?|Titus|Philem(?:on)?|Heb(?:rews)?|Jas(?:ames)?|1\s?Pet(?:er)?|2\s?Pet(?:er)?|1\s?John|2\s?John|3\s?John|Jude|Rev(?:elation)?)\s\d+:\d+(?:-\d+)?\b|\[\d{1,2}:\d{2}(?::\d{2})?\]|\b[HG]\d{3,5}\b)/gi;

    const parts = text.split(TOKEN_REGEX);
    const matches = text.match(TOKEN_REGEX) || [];

    return (
      <span className="whitespace-pre-wrap">
        {parts.map((part, index) => {
          const match = matches[index];
          let tokenElem = null;

          if (match) {
            // Timecode match: [MM:SS]
            if (match.startsWith("[") && match.endsWith("]")) {
              const timeStr = match.slice(1, -1);
              const timeParts = timeStr.split(":").map(Number);
              const totalSecs = timeParts.length === 3 ? timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2] : timeParts[0] * 60 + timeParts[1];
              tokenElem = (
                <button
                  key={`tc-${index}`}
                  onClick={() => handleSeekVideo(totalSecs)}
                  className="inline-flex items-center gap-1 text-[#D4AF37] bg-[#D4AF37]/20 border border-[#D4AF37]/40 hover:bg-[#D4AF37]/40 px-1.5 py-0.5 rounded text-[11px] font-bold mx-1 cursor-pointer transition-colors"
                >
                  <Clock size={11} /> {match}
                </button>
              );
            }
            // Strong's Concordance match: H#### or G####
            else if (/^[HG]\d{3,5}$/i.test(match)) {
              const strongEntry = lookupStrongs(match);
              tokenElem = (
                <span
                  key={`st-${index}`}
                  onClick={() => strongEntry && setStrongsModalEntry(strongEntry)}
                  className="text-purple-400 font-semibold underline cursor-pointer hover:text-purple-300 bg-purple-900/30 px-1 rounded mx-0.5"
                  title={`Strong's ${match}`}
                >
                  {match} {strongEntry ? `(${strongEntry.word})` : ""}
                </span>
              );
            }
            // Scripture match
            else {
              tokenElem = (
                <span
                  key={`sc-${index}`}
                  onClick={() => handleScriptureClick(match)}
                  className="text-[#D4AF37] font-semibold underline cursor-pointer hover:text-[#F9F6F0] transition-colors bg-[#D4AF37]/10 px-1 rounded mx-0.5"
                >
                  {match}
                </span>
              );
            }
          }

          return (
            <span key={index}>
              {part}
              {tokenElem}
            </span>
          );
        })}
      </span>
    );
  };

  // Phase 4.3: AI Document Chat (RAG) Stream
  const handleAiSend = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiInput("");
    setAiMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setStreamingContent("");
    setIsStreaming(true);

    try {
      const activePdfId = studyPdfs[0]?.id;
      const pdfQueryParam = activePdfId ? `&pdfId=${activePdfId}` : "";
      
      const response = await fetch(`/api/ai/stream?q=${encodeURIComponent(userMsg)}&userId=${user?.id}${pdfQueryParam}&agent=${selectedAgent}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");
      streamReaderRef.current = reader;

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
            if (json.error) {
              setStreamingContent(`Error: ${json.error}`);
            }
          } catch {
            // Skip malformed
          }
        }
      }

      setAiMessages(prev => [...prev, { role: "assistant", content: fullContent }]);
      setStreamingContent("");
    } catch (err) {
      setStreamingContent("Connection error. Please try again.");
      setTimeout(() => setStreamingContent(""), 3000);
    } finally {
      setIsStreaming(false);
      streamReaderRef.current = null;
    }
  };

  const handleQuestionChange = (index: number, value: string) => {
    const newQuestions = [...notesData.questions];
    newQuestions[index] = value;
    setNotesData({ ...notesData, questions: newQuestions });
  };

  const handleNoteChange = (index: number, value: string) => {
    const newNotes = [...notesData.notes];
    newNotes[index] = value;
    setNotesData({ ...notesData, notes: newNotes });
  };

  const addQuestionField = () => setNotesData({ ...notesData, questions: [...notesData.questions, ""] });
  const addNoteField = () => setNotesData({ ...notesData, notes: [...notesData.notes, ""] });
  const removeQuestionField = (index: number) => setNotesData({ ...notesData, questions: notesData.questions.filter((_, i) => i !== index) });
  const removeNoteField = (index: number) => setNotesData({ ...notesData, notes: notesData.notes.filter((_, i) => i !== index) });

  const getYouTubeId = (url?: string | null) => {
    if (!url) return null;
    const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/);
    return match ? match[1] : null;
  };

  const selectedStudy = studies.find(s => s.id === studyId) || (externalLesson ? {
    id: 0,
    title: externalLesson.title,
    videoUrl: externalLesson.url,
    topic: "Doctrine Study",
    category: "Text Lesson",
    description: "External study resource from IOG"
  } : undefined);

  const videoId = getYouTubeId(selectedStudy?.videoUrl);
  const isPdf = selectedStudy?.videoUrl?.toLowerCase().endsWith(".pdf") || selectedStudy?.videoUrl?.includes("theisraelofgod.com") || selectedStudy?.videoUrl?.includes("drive.google.com") || studyPdfs.length > 0;
  const isDriveFolder = selectedStudy?.videoUrl?.includes("/folders/");

  const handleExportPDF = () => { window.print(); };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B132B]">
        <div className="text-center space-y-4">
          <BookOpen className="w-16 h-16 mx-auto text-[#D4AF37] animate-pulse" />
          <h2 className="text-2xl font-bold text-[#F9F6F0]">Theological Workspace Locked</h2>
          <p className="text-[#6B7A8D]">Please sign in to access your notes and the Teacher.</p>
        </div>
      </div>
    );
  }

  if (studyId === null) {
    return (
      <div className="min-h-screen bg-[#0B132B] flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-xl p-10 bg-[#1C2541]/40 border-[#D4AF37]/20 text-center space-y-6">
          <Scroll className="w-20 h-20 mx-auto text-[#D4AF37]" />
          <h1 className="text-3xl font-bold font-serif text-[#F9F6F0]">Bible Study Workspace</h1>
          <p className="text-[#6B7A8D]">Select a lesson from your library or start a live session.</p>
          <select
            value={studyId !== null ? studyId : ""}
            onChange={(e) => setStudyId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-4 py-3 bg-[#0B132B] border border-[#D4AF37]/30 rounded-xl text-[#F9F6F0] focus:ring-2 focus:ring-[#D4AF37] transition-all"
          >
            <option value="">Choose a Lesson...</option>
            {studies.map((study) => (
              <option key={study.id} value={study.id}>{study.title}</option>
            ))}
          </select>
          <div className="space-y-4">
            <Button 
              className="w-full bg-[#D4AF37] text-[#0B132B] font-bold h-12 text-lg animate-pulse"
              onClick={() => studyId !== null && setStudyId(studyId)}
              disabled={studyId === null}
            >
              Enter Structured Study
            </Button>
            <div className="flex items-center gap-4 py-2">
              <div className="h-px flex-1 bg-[#D4AF37]/10" />
              <span className="text-[10px] text-[#6B7A8D] uppercase tracking-widest font-bold">OR</span>
              <div className="h-px flex-1 bg-[#D4AF37]/10" />
            </div>
            <Button 
              variant="outline"
              className="w-full border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-12 font-bold"
              onClick={() => { setIsLiveMode(true); setStudyId(0); setLeftTab("mic"); }}
            >
              <Mic className="w-4 h-4 mr-2" />
              Independent Live Lesson
            </Button>
            <Button 
              variant="ghost"
              className="w-full text-[#6B7A8D] hover:text-[#D4AF37] h-10 font-bold"
              onClick={() => setLocation("/")}
            >
              ← Back to Home Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const leftPanelContent = (
    <Tabs value={leftTab} onValueChange={(v) => setLeftTab(v as any)} className="h-full flex flex-col">
      <TabsList className="bg-[#1C2541] border-b border-[#D4AF37]/10 w-full rounded-none h-10 px-2 flex-shrink-0">
        <TabsTrigger value="video" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B132B] text-xs">
          <Video className="w-3 h-3 mr-1" /> Video
        </TabsTrigger>
        <TabsTrigger value="pdf" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B132B] text-xs">
          <BookOpen className="w-3 h-3 mr-1" /> PDF Library {studyPdfs.length > 0 && `(${studyPdfs.length})`}
        </TabsTrigger>
        <TabsTrigger value="logos" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B132B] text-xs">
          <BookOpen className="w-3 h-3 mr-1" /> Logos
        </TabsTrigger>
        <TabsTrigger value="mic" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B132B] text-xs">
          <Mic className="w-3 h-3 mr-1" /> Live Mic
        </TabsTrigger>
      </TabsList>

      <TabsContent value="video" className="flex-1 m-0">
        {videoId ? (
          <iframe id="youtube-lesson-player" width="100%" height="100%" src={`https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`} className="w-full h-full" allowFullScreen allow="autoplay" />
        ) : (
          <div className="flex items-center justify-center h-full text-[#6B7A8D]">
            <div className="text-center p-8">
              <Video className="w-12 h-12 mx-auto mb-4 text-[#D4AF37]/50" />
              <p>No video resource for this lesson.</p>
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="pdf" className="flex-1 m-0 flex flex-col">
        {studyPdfs.length > 0 ? (
          <iframe
            src={getViewableUrl(studyPdfs[0].fileUrl) || ""}
            width="100%" height="100%" className="w-full h-full bg-white"
          />
        ) : isPdf ? (
          <iframe
            src={getViewableUrl(selectedStudy?.videoUrl) || ""}
            width="100%" height="100%" className="w-full h-full bg-white"
          />
        ) : isDriveFolder ? (
          <iframe 
            src={`https://drive.google.com/embeddedfolderview?id=${selectedStudy?.videoUrl?.split('/folders/')[1]?.split('?')[0]}#grid`} 
            width="100%" height="100%" className="w-full h-full bg-white"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[#6B7A8D]">
            <div className="text-center p-8">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-[#D4AF37]/50" />
              <p>No PDF resource for this lesson.</p>
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="logos" className="flex-1 m-0">
        <iframe src={LOGOS_URL} width="100%" height="100%" className="w-full h-full" style={{ border: "none" }} />
      </TabsContent>

      <TabsContent value="mic" className="flex-1 m-0 flex flex-col p-6 bg-[#0B132B]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn("w-3 h-3 rounded-full", isRecording ? "bg-red-600 animate-pulse" : "bg-gray-600")} />
            <h2 className="text-lg font-bold font-serif text-[#F9F6F0]">Live Transcription</h2>
          </div>
          {studyId === 0 && (liveTranscript || notesData.summary || notesData.notes.some(n => n.trim()) || notesData.questions.some(q => q.trim())) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm("Are you sure you want to discard this live session draft? This will clear all transcripts and notes.")) {
                  setLiveTranscript("");
                  setNotesData({
                    questions: [""],
                    notes: [""],
                    summary: "",
                  });
                  localStorage.removeItem("bsp_live_transcript");
                  localStorage.removeItem("bsp_live_notes_data");
                  toast.success("Live session draft discarded.");
                }
              }}
              className="text-red-400 hover:text-red-300 hover:bg-red-950/20 text-xs px-2 py-1 h-auto"
            >
              Clear Draft
            </Button>
          )}
        </div>
        
        <div className="flex items-center justify-center gap-1 h-20 mb-4">
          {waveformData.map((val, i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full bg-[#D4AF37]"
              animate={{ height: `${Math.max(4, val * 80)}px`, opacity: val > 0.1 ? 1 : 0.3 }}
              transition={{ duration: 0.05 }}
            />
          ))}
        </div>

        <div className="flex-1 bg-[#1C2541]/40 rounded-2xl border border-[#D4AF37]/10 p-4 overflow-y-auto">
          {(liveTranscript || interimTranscript) ? (
            <p className="text-base leading-relaxed text-[#F9F6F0] whitespace-pre-wrap font-serif italic">
              {liveTranscript}
              <span className="text-[#6B7A8D]">{interimTranscript}</span>
              {isRecording && <span className="inline-block w-2 h-5 bg-[#D4AF37] ml-1 animate-pulse" />}
            </p>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-50">
              <Mic className="w-10 h-10 text-[#D4AF37]" />
              <p className="text-[#F9F6F0] font-bold">Microphone Ready</p>
              <p className="text-xs text-[#6B7A8D]">Click "Go Live" to start.</p>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );

  const rightPanelContent = (
    <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as any)} className="h-full flex flex-col">
      <TabsList className="bg-[#1C2541] border-b border-[#D4AF37]/10 w-full rounded-none h-10 px-2 flex-shrink-0">
        <TabsTrigger value="notes" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B132B] text-xs">
          <Edit3 className="w-3 h-3 mr-1" /> Cornell Notes
        </TabsTrigger>
        <TabsTrigger value="guide" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B132B] text-xs">
          <Scroll className="w-3 h-3 mr-1" /> Study Guide
        </TabsTrigger>
        <TabsTrigger value="ai" className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B132B] text-xs">
          <Brain className="w-3 h-3 mr-1" /> Ask Teacher
        </TabsTrigger>
      </TabsList>

      <TabsContent value="notes" className="flex-1 m-0 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#D4AF37]/10 bg-[#1C2541]/40 flex-shrink-0">
          <span className="text-xs text-[#6B7A8D] font-bold uppercase tracking-wider">Note Editor</span>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className="border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 text-[10px] py-1 h-auto touch-target"
          >
            {isPreviewMode ? "Edit Raw Notes" : "KJV Scripture View"}
          </Button>
        </div>
        
        {isPreviewMode ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0B132B]">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider border-b border-[#D4AF37]/20 pb-1">Cue Questions & Key Inquiries</h3>
              <div className="space-y-3">
                {notesData.questions.map((q, idx) => q && (
                  <div key={idx} className="p-3 bg-[#1C2541]/30 border border-[#D4AF37]/10 rounded-lg text-xs text-[#F9F6F0]">
                    <span className="text-[#D4AF37] font-bold mr-1">Q{idx + 1}:</span> {renderTextWithBibleLinks(q)}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider border-b border-[#D4AF37]/20 pb-1">Detailed Study Notes</h3>
              <div className="space-y-3">
                {notesData.notes.map((n, idx) => n && (
                  <div key={idx} className="p-4 bg-[#1C2541]/20 border border-[#D4AF37]/5 rounded-xl text-xs text-[#F9F6F0] leading-relaxed">
                    {renderTextWithBibleLinks(n)}
                  </div>
                ))}
              </div>
            </div>

            {notesData.summary && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider border-b border-[#D4AF37]/20 pb-1">Theological Summary</h3>
                <div className="p-4 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-xl text-xs text-[#F9F6F0] leading-relaxed font-serif italic">
                  {renderTextWithBibleLinks(notesData.summary)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-0 overflow-y-auto lg:overflow-hidden p-3 lg:p-0">
            {/* Column 1: Cue Questions */}
            <div className="col-span-1 lg:border-r border-[#D4AF37]/10 overflow-y-auto p-3 space-y-2 lg:h-full">
              <div className="flex items-center justify-between">
                <h3 className="text-[#D4AF37] font-bold text-[10px] uppercase tracking-widest">Cue Questions</h3>
                <Button variant="ghost" size="sm" onClick={addQuestionField} className="text-[#D4AF37] h-7 w-7 rounded-full hover:bg-[#D4AF37]/10 flex items-center justify-center text-sm font-bold touch-target">+</Button>
              </div>
              <div className="space-y-2">
                {notesData.questions.map((q, i) => (
                  <div key={i} className="group relative bg-[#1C2541]/20 rounded-xl p-2 border border-[#D4AF37]/5">
                    <div className="flex items-center justify-between mb-1">
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => insertTimestamp("question", i)}
                        className="text-[10px] text-[#D4AF37] hover:bg-[#D4AF37]/10 h-5 px-1.5 gap-1 font-mono"
                      >
                        <Clock size={11} /> + Stamp
                      </Button>
                      {notesData.questions.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeQuestionField(i)} className="h-5 w-5 rounded-full bg-red-900/30 text-red-400 hover:bg-red-900/60 p-0 flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <Textarea 
                      value={q} 
                      onChange={(e) => handleQuestionChange(i, e.target.value)}
                      className="bg-[#1C2541]/40 border-[#D4AF37]/10 min-h-[60px] text-xs text-[#F9F6F0] resize-none"
                      placeholder="Key question (or timestamp)..."
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: Main Notes */}
            <div className="col-span-1 lg:col-span-2 lg:border-r border-[#D4AF37]/10 overflow-y-auto p-3 space-y-2 lg:h-full">
              <div className="flex items-center justify-between">
                <h3 className="text-[#D4AF37] font-bold text-[10px] uppercase tracking-widest">Main Notes</h3>
                <Button variant="ghost" size="sm" onClick={addNoteField} className="text-[#D4AF37] h-7 w-7 rounded-full hover:bg-[#D4AF37]/10 flex items-center justify-center text-sm font-bold touch-target">+</Button>
              </div>
              <div className="space-y-3">
                {notesData.notes.map((n, i) => (
                  <div key={i} className="group relative bg-[#1C2541]/20 rounded-xl p-2 border border-[#D4AF37]/5">
                    <div className="flex items-center justify-between mb-1">
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => insertTimestamp("note", i)}
                        className="text-[10px] text-[#D4AF37] hover:bg-[#D4AF37]/10 h-5 px-1.5 gap-1 font-mono"
                      >
                        <Clock size={11} /> + Stamp
                      </Button>
                      {notesData.notes.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeNoteField(i)} className="h-5 w-5 rounded-full bg-red-900/30 text-red-400 hover:bg-red-900/60 p-0 flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <Textarea 
                      value={n} 
                      onChange={(e) => handleNoteChange(i, e.target.value)}
                      className="bg-[#1C2541]/40 border-[#D4AF37]/10 min-h-[90px] text-xs text-[#F9F6F0] resize-none"
                      placeholder="Scripture breakdown & precepts..."
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Column 3: Summary */}
            <div className="col-span-1 overflow-y-auto p-3 lg:h-full">
              <h3 className="text-[#D4AF37] font-bold text-[10px] uppercase tracking-widest mb-2">Summary</h3>
              <Textarea 
                value={notesData.summary} 
                onChange={(e) => setNotesData({...notesData, summary: e.target.value})}
                className="bg-[#D4AF37]/5 border-[#D4AF37]/20 min-h-[140px] text-xs text-[#F9F6F0] resize-none"
                placeholder="Final conclusion..."
              />
              {isStreaming && (
                <div className="mt-3 p-2 bg-[#D4AF37]/10 rounded-lg border border-[#D4AF37]/20">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-[#D4AF37]" />
                    <span className="text-[10px] text-[#D4AF37]">AI synthesizing...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </TabsContent>

      {/* Phase 4.1: Study Guide tab */}
      <TabsContent value="guide" className="flex-1 m-0 overflow-y-auto p-5 space-y-6">
        {!studyGuide ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <Scroll className="w-16 h-16 text-[#D4AF37] opacity-30" />
            <div>
              <h3 className="text-lg font-bold font-serif text-[#F9F6F0]">Interactive AI Study Guide</h3>
              <p className="text-xs text-[#6B7A8D] mt-1 max-w-sm">Generate comprehensive summaries, discussion questions, and memorization flashcards from this study's theological texts.</p>
            </div>
            <Button 
              onClick={handleGenerateStudyGuide} 
              disabled={isGeneratingGuide} 
              className="bg-[#D4AF37] text-[#0B132B] font-bold px-6 py-2.5 rounded-lg flex items-center gap-2 touch-target"
            >
              {isGeneratingGuide ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Documents...</>
              ) : (
                <><Brain className="w-4 h-4" /> Generate Study Guide</>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3">
              <h2 className="text-xl font-bold font-serif text-[#F9F6F0] flex items-center gap-2">
                <BookOpen size={20} className="text-[#D4AF37]" /> {selectedStudy?.title || "Theological Guide"}
              </h2>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={handleGenerateStudyGuide}
                disabled={isGeneratingGuide}
                className="text-[#D4AF37] text-[10px] uppercase font-bold touch-target"
              >
                <RefreshCw size={12} className="mr-1 animate-spin-slow" /> Regenerate
              </Button>
            </div>

            <div className="space-y-3">
              <h3 className="text-[#D4AF37] font-bold text-xs uppercase tracking-wider">Theological Analysis</h3>
              <div className="p-4 bg-[#1C2541]/40 border border-[#D4AF37]/10 rounded-xl text-xs text-[#F9F6F0] leading-relaxed font-serif">
                {renderTextWithBibleLinks(studyGuide.summary)}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-[#1C2541]/20 border border-[#D4AF37]/5 rounded-xl space-y-3">
                <h4 className="text-[#D4AF37] font-bold text-xs uppercase tracking-wider flex items-center gap-1">
                  <Scroll size={14} /> Key Takeaways
                </h4>
                <ul className="space-y-2">
                  {studyGuide.keyPoints?.map((pt, i) => (
                    <li key={i} className="text-xs text-[#F9F6F0] flex items-start gap-2">
                      <span className="text-[#D4AF37] font-bold mt-0.5">•</span>
                      <span>{renderTextWithBibleLinks(pt)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 bg-[#1C2541]/20 border border-[#D4AF37]/5 rounded-xl space-y-3">
                <h4 className="text-[#D4AF37] font-bold text-xs uppercase tracking-wider flex items-center gap-1">
                  <QuestionIcon size={14} /> Discussion Questions
                </h4>
                <ul className="space-y-2">
                  {studyGuide.discussionQuestions?.map((q, i) => (
                    <li key={i} className="text-xs text-[#F9F6F0] flex items-start gap-2">
                      <span className="text-[#D4AF37] font-bold mt-0.5">{i+1}.</span>
                      <span>{renderTextWithBibleLinks(q)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Interactive flashcards block */}
            {studyGuide.flashcards?.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[#D4AF37] font-bold text-xs uppercase tracking-wider">Theological Flashcard Deck</h3>
                <div className="relative h-44 cursor-pointer" onClick={() => setIsCardFlipped(!isCardFlipped)}>
                  <AnimatePresence mode="wait">
                    {!isCardFlipped ? (
                      <motion.div
                        key="front"
                        initial={{ rotateY: 90, opacity: 0 }}
                        animate={{ rotateY: 0, opacity: 1 }}
                        exit={{ rotateY: -90, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-[#1C2541]/50 border border-[#D4AF37]/20 rounded-2xl p-6 flex flex-col justify-between items-center text-center shadow-lg"
                      >
                        <span className="text-[10px] text-[#D4AF37]/50 uppercase tracking-widest font-bold">Front • Theological Term / Inquest</span>
                        <p className="text-sm font-serif font-bold text-[#F9F6F0] max-w-sm mt-4">
                          {studyGuide.flashcards[activeCardIndex]?.front}
                        </p>
                        <span className="text-[10px] text-[#D4AF37] font-bold animate-pulse">Click to Reveal KJV Proof</span>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="back"
                        initial={{ rotateY: -90, opacity: 0 }}
                        animate={{ rotateY: 0, opacity: 1 }}
                        exit={{ rotateY: 90, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-[#D4AF37]/10 border border-[#D4AF37] rounded-2xl p-6 flex flex-col justify-between items-center text-center shadow-lg"
                      >
                        <span className="text-[10px] text-[#D4AF37] uppercase tracking-widest font-bold">Back • KJV Scripture Alignment</span>
                        <p className="text-xs font-serif italic leading-relaxed text-[#F9F6F0] max-w-sm mt-3 overflow-y-auto">
                          {renderTextWithBibleLinks(studyGuide.flashcards[activeCardIndex]?.back)}
                        </p>
                        <span className="text-[10px] text-white/30 font-bold">Click to Flip Back</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Spaced-Repetition Leitner Buttons */}
                <div className="flex items-center justify-center gap-2 pt-2 border-t border-[#D4AF37]/10">
                  <span className="text-[10px] text-[#6B7A8D] font-bold uppercase mr-1">Recall:</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFlashcardScores(prev => ({ ...prev, [activeCardIndex]: "again" }));
                      toast.info("Marked for 1-day review.");
                      if (activeCardIndex < studyGuide.flashcards.length - 1) {
                        setActiveCardIndex(p => p + 1);
                        setIsCardFlipped(false);
                      }
                    }}
                    className="border-red-500/30 text-red-400 hover:bg-red-950/30 text-[10px] h-7 px-2"
                  >
                    🔴 Again (1d)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFlashcardScores(prev => ({ ...prev, [activeCardIndex]: "hard" }));
                      toast.info("Marked for 3-day review.");
                      if (activeCardIndex < studyGuide.flashcards.length - 1) {
                        setActiveCardIndex(p => p + 1);
                        setIsCardFlipped(false);
                      }
                    }}
                    className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-950/30 text-[10px] h-7 px-2"
                  >
                    🟡 Hard (3d)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFlashcardScores(prev => ({ ...prev, [activeCardIndex]: "good" }));
                      toast.success("Marked for 7-day review.");
                      if (activeCardIndex < studyGuide.flashcards.length - 1) {
                        setActiveCardIndex(p => p + 1);
                        setIsCardFlipped(false);
                      }
                    }}
                    className="border-green-500/30 text-green-400 hover:bg-green-950/30 text-[10px] h-7 px-2"
                  >
                    🟢 Good (7d)
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setFlashcardScores(prev => ({ ...prev, [activeCardIndex]: "mastered" }));
                      toast.success("Scripture Mastered! 🏆");
                      if (activeCardIndex < studyGuide.flashcards.length - 1) {
                        setActiveCardIndex(p => p + 1);
                        setIsCardFlipped(false);
                      }
                    }}
                    className="bg-[#D4AF37] text-[#0B132B] font-bold text-[10px] h-7 px-2"
                  >
                    🏆 Mastered
                  </Button>
                </div>

                <div className="flex justify-between items-center px-2">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    disabled={activeCardIndex === 0}
                    onClick={() => { setActiveCardIndex(p => p - 1); setIsCardFlipped(false); }}
                    className="text-[#D4AF37] disabled:opacity-30 touch-target"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-[#6B7A8D]">Card {activeCardIndex + 1} of {studyGuide.flashcards.length}</span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    disabled={activeCardIndex === studyGuide.flashcards.length - 1}
                    onClick={() => { setActiveCardIndex(p => p + 1); setIsCardFlipped(false); }}
                    className="text-[#D4AF37] disabled:opacity-30 touch-target"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </TabsContent>

      <TabsContent value="ai" className="flex-1 m-0 flex flex-col">
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          <div className="bg-[#1C2541]/40 p-3 rounded-xl border border-[#D4AF37]/10 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] text-[#6B7A8D] mb-1 uppercase tracking-tighter">IOG Theological Assistant</p>
                <p className="text-xs text-[#F9F6F0]">Ready to assist with <span className="text-[#D4AF37] italic">"{selectedStudy?.title}"</span>.</p>
              </div>
              <select
                value={selectedAgent}
                onChange={(e) => handleAgentChange(e.target.value as any)}
                className="bg-[#0B132B] border border-[#D4AF37]/30 rounded px-2 py-1 text-[10px] text-[#F9F6F0] focus:ring-1 focus:ring-[#D4AF37] outline-none cursor-pointer"
              >
                <option value="openrouter">Gemini Cloud</option>
                <option value="local">Local GPU (OpenClaw)</option>
                <option value="vps">Remote VPS (OpenMono)</option>
              </select>
            </div>
            {studyPdfs.length > 0 && (
              <div className="mt-2 text-[10px] text-amber-300 bg-amber-950/20 border border-amber-900/40 p-1.5 rounded flex items-center gap-1.5">
                <BookOpen size={12} /> Specific Document Chat active for: <strong>{studyPdfs[0].fileName}</strong>
              </div>
            )}
          </div>
          {aiMessages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] p-3 rounded-xl text-xs ${
                m.role === 'user' 
                  ? 'bg-[#D4AF37] text-[#0B132B] rounded-tr-none' 
                  : 'bg-white/5 text-[#F9F6F0] border border-white/10 rounded-tl-none'
              }`}>
                {renderTextWithBibleLinks(m.content)}
              </div>
            </div>
          ))}
          {streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[90%] p-3 rounded-xl text-xs bg-white/5 text-[#F9F6F0] border border-white/10 rounded-tl-none">
                <span className="streaming-cursor">{renderTextWithBibleLinks(streamingContent)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-[#D4AF37]/10 bg-[#1C2541]/20">
          <div className="flex gap-2">
            <Input 
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiSend()}
              placeholder="Ask about context, scriptures, or history..." 
              className="bg-[#0B132B] border-[#D4AF37]/20 text-xs h-10" 
            />
            <Button 
              onClick={handleAiSend} 
              disabled={!aiInput.trim() || isStreaming}
              className="bg-[#D4AF37] text-[#0B132B] h-10 px-4 touch-target"
            >
              {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="h-screen bg-[#0B132B] overflow-hidden flex flex-col">
      {/* Dynamic Popover scripture lookups */}
      <AnimatePresence>
        {selectedScripture && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-[#1C2541] border border-[#D4AF37]/30 rounded-2xl p-6 shadow-2xl space-y-4 relative"
            >
              <button 
                onClick={() => setSelectedScripture(null)}
                className="absolute right-4 top-4 p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white"
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-2 text-[#D4AF37]">
                <Book size={24} />
                <h3 className="text-xl font-bold font-serif">{selectedScripture}</h3>
              </div>
              <div className="bg-[#0B132B] rounded-xl p-4 border border-[#D4AF37]/10 min-h-[120px] max-h-[220px] overflow-y-auto">
                {isLoadingScripture ? (
                  <div className="h-24 flex items-center justify-center gap-2 text-[#6B7A8D]">
                    <Loader2 className="animate-spin text-[#D4AF37]" /> Finding scripture...
                  </div>
                ) : (
                  <p className="text-sm font-serif italic leading-relaxed text-[#F9F6F0] whitespace-pre-wrap">
                    "{scriptureText}"
                  </p>
                )}
              </div>

              {/* Companion Precepts (Precept Upon Precept) */}
              {selectedPrecepts.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#D4AF37]/20">
                  <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-wider flex items-center gap-1">
                    <SparklesIcon size={12} /> Companion Precepts (Precept Upon Precept):
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {selectedPrecepts.flatMap(p => p.precepts).map((pr, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-black/40 border border-white/5 text-xs flex flex-col gap-0.5">
                        <span 
                          onClick={() => handleScriptureClick(pr.reference)} 
                          className="font-bold text-[#D4AF37] cursor-pointer hover:underline"
                        >
                          {pr.reference}
                        </span>
                        <span className="text-white/80 text-[11px] italic font-serif">"{pr.description}"</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <span className="text-[10px] text-white/30 uppercase tracking-wider font-bold">King James Version (KJV)</span>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Strong's Concordance Modal */}
        {strongsModalEntry && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-[#1C2541] border border-purple-500/40 rounded-2xl p-6 shadow-2xl space-y-4 relative"
            >
              <button 
                onClick={() => setStrongsModalEntry(null)}
                className="absolute right-4 top-4 p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white"
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-2 text-purple-400">
                <Tag size={22} />
                <h3 className="text-xl font-bold font-serif">Strong's {strongsModalEntry.id}</h3>
              </div>
              <div className="bg-[#0B132B] rounded-xl p-4 border border-purple-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-serif text-white font-bold">{strongsModalEntry.word}</span>
                  <span className="text-xs text-purple-300 font-mono">/{strongsModalEntry.pronounce}/</span>
                </div>
                <div className="text-xs text-[#6B7A8D]">Transliteration: <strong className="text-white">{strongsModalEntry.translit}</strong> ({strongsModalEntry.lang.toUpperCase()})</div>
                <p className="text-xs text-[#F9F6F0] leading-relaxed pt-2 border-t border-white/10">{strongsModalEntry.definition}</p>
                <div className="pt-2 text-[11px] text-[#D4AF37]">
                  <strong>KJV Translations:</strong> {strongsModalEntry.kjvUsage}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Official Sabbath Lesson PDF Builder Modal */}
      {studyId && (
        <SabbathLessonPdfModal 
          studyId={studyId} 
          studyTitle={selectedStudy?.title} 
          isOpen={isPdfModalOpen} 
          onClose={() => setIsPdfModalOpen(false)} 
        />
      )}

      <div className="bg-[#1C2541]/90 backdrop-blur-md border-b border-[#D4AF37]/20 p-3">
        <div className="flex flex-row items-center justify-between gap-2">
          {/* Back button and Title */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setLocation("/")} 
              className="text-[#D4AF37] px-2 shrink-0 touch-target"
            >
              <ChevronRight className="rotate-180 w-5 h-5" />
              <span className="hidden sm:inline ml-1 text-xs">Back</span>
            </Button>
            <h1 className="text-sm sm:text-base md:text-lg font-bold font-serif text-[#F9F6F0] truncate max-w-[150px] sm:max-w-xs md:max-w-md">
              {selectedStudy?.title || (studyId === 0 ? "Live Theological Session" : "Loading Lesson...")}
            </h1>
            {!isMobile && lastSaved && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full animate-pulse"
              >
                <CheckCircle className="w-3 h-3" />
                Saved
              </motion.span>
            )}
          </div>

          {/* Desktop Controls */}
          {!isMobile ? (
            <div className="flex items-center gap-2 shrink-0">
              <ImportLessonDialog 
                onSuccess={(newId) => {
                  setStudyId(newId);
                }}
              />

              <Button
                size="sm"
                onClick={() => setIsPdfModalOpen(true)}
                title="Build Official Sabbath Lesson PDF Sheet"
                className="bg-[#D4AF37]/15 border border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/30 font-bold"
              >
                <Printer className="w-4 h-4 mr-1.5" /> Sabbath PDF
              </Button>

              <Button 
                size="sm" 
                onClick={() => setIsLiveMode(!isLiveMode)} 
                className={cn(
                  "font-bold transition-all border",
                  isLiveMode 
                    ? "bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]" 
                    : "bg-[#1C2541] border-[#D4AF37]/30 text-[#D4AF37]/50"
                )}
              >
                <Monitor className="w-4 h-4 mr-2" />
                {isLiveMode ? "Live Mode" : "Visual Mode"}
              </Button>

              <Button 
                size="sm" 
                onClick={toggleRecording} 
                className={cn(
                  "font-bold transition-all",
                  isRecording 
                    ? "bg-red-600 hover:bg-red-700 animate-pulse text-white" 
                    : "bg-[#1C2541] border border-[#D4AF37]/30 text-[#D4AF37]"
                )}
              >
                {isRecording ? (
                  <><Square className="w-4 h-4 mr-2" /> {formatTime(recordingTime)}</>
                ) : (
                  <><Mic className="w-4 h-4 mr-2" /> Go Live</>
                )}
              </Button>

              <Button size="sm" onClick={handleAutoGenerate} disabled={isGenerating} className="bg-[#D4AF37] text-[#0B132B] font-bold">
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                AI Sync
              </Button>
              <Button size="sm" onClick={handleSave} className="bg-[#1C2541] border border-[#D4AF37]/30 text-[#D4AF37]">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Save
              </Button>
              <Button
                size="sm"
                onClick={handleExportPDF}
                title="Export notes as PDF"
                className="bg-[#1C2541] border border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10"
              >
                <FileDown className="w-4 h-4 mr-1" /> Export
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStudyId(null)} className="text-[#6B7A8D]">
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            /* Mobile controls - single trigger button */
            <div className="flex items-center gap-1 shrink-0">
              {lastSaved && (
                <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-1 rounded-full flex items-center gap-0.5">
                  <CheckCircle className="w-3 h-3" /> Saved
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileMenuOpen(true)}
                className="text-[#D4AF37] hover:bg-[#1C2541] rounded-xl h-10 w-10 flex items-center justify-center border border-[#D4AF37]/10 touch-target"
              >
                <MoreVertical className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Sliding Segment Control */}
      {isMobile && (
        <div className="flex bg-[#0B132B] p-1.5 rounded-xl border border-[#D4AF37]/20 m-2 shrink-0">
          <button
            onClick={() => setActiveMobileTab("media")}
            className={cn(
              "flex-1 py-2 text-center text-xs font-extrabold rounded-lg transition-all duration-300 touch-target",
              activeMobileTab === "media"
                ? "bg-[#D4AF37] text-[#0B132B] shadow-md shadow-[#D4AF37]/20 scale-[1.02]"
                : "text-[#6B7A8D]"
            )}
          >
            <Video className="w-3.5 h-3.5 inline mr-1.5" />
            Visual Media
          </button>
          <button
            onClick={() => setActiveMobileTab("notes")}
            className={cn(
              "flex-1 py-2 text-center text-xs font-extrabold rounded-lg transition-all duration-300 touch-target",
              activeMobileTab === "notes"
                ? "bg-[#D4AF37] text-[#0B132B] shadow-md shadow-[#D4AF37]/20 scale-[1.02]"
                : "text-[#6B7A8D]"
            )}
          >
            <Edit3 className="w-3.5 h-3.5 inline mr-1.5" />
            Notes & AI Teacher
          </button>
        </div>
      )}

      {/* Mobile Sheet for Actions */}
      <Sheet open={isMobile && isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="bottom" className="bg-[#1C2541] border-t border-[#D4AF37]/35 text-[#F9F6F0] rounded-t-3xl p-6 pb-8 z-50">
          <SheetHeader className="pb-4 border-b border-[#D4AF37]/10 mb-4">
            <SheetTitle className="text-left text-[#D4AF37] font-serif text-lg font-bold flex items-center justify-between">
              <span>Lesson Controls</span>
              {lastSaved && (
                <span className="text-xs font-sans text-green-400 bg-green-400/10 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Saved
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => {
                setIsLiveMode(!isLiveMode);
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "w-full h-12 justify-start font-bold text-sm px-4 rounded-xl border transition-all touch-target",
                isLiveMode
                  ? "bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]"
                  : "bg-[#0B132B] border-[#D4AF37]/20 text-[#6B7A8D] hover:text-[#D4AF37]"
              )}
            >
              <Monitor className="w-5 h-5 mr-3 shrink-0" />
              {isLiveMode ? "Switch to Visual Mode" : "Switch to Live Mode"}
            </Button>

            <Button
              onClick={() => {
                toggleRecording();
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "w-full h-12 justify-start font-bold text-sm px-4 rounded-xl transition-all touch-target",
                isRecording
                  ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                  : "bg-[#0B132B] border border-[#D4AF37]/20 text-[#D4AF37]"
              )}
            >
              {isRecording ? (
                <>
                  <Square className="w-5 h-5 mr-3 shrink-0 text-white" />
                  Stop Recording ({formatTime(recordingTime)})
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5 mr-3 shrink-0" />
                  Go Live / Audio Recording
                </>
              )}
            </Button>

            <Button
              onClick={() => {
                handleAutoGenerate();
                setIsMobileMenuOpen(false);
              }}
              disabled={isGenerating}
              className="w-full h-12 justify-start font-bold text-sm px-4 rounded-xl bg-[#D4AF37] text-[#0B132B] hover:bg-[#F9F6F0] touch-target"
            >
              {isGenerating ? (
                <Loader2 className="w-5 h-5 mr-3 shrink-0 animate-spin" />
              ) : (
                <Wand2 className="w-5 h-5 mr-3 shrink-0" />
              )}
              AI Sync & Insights
            </Button>

            <Button
              onClick={() => {
                handleSave();
                setIsMobileMenuOpen(false);
              }}
              disabled={isSaving}
              className="w-full h-12 justify-start font-bold text-sm px-4 rounded-xl bg-[#0B132B] border border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10 touch-target"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 mr-3 shrink-0 animate-spin" />
              ) : (
                <Save className="w-5 h-5 mr-3 shrink-0" />
              )}
              Save Cornell Notes
            </Button>

            <Button
              onClick={() => {
                handleExportPDF();
                setIsMobileMenuOpen(false);
              }}
              className="w-full h-12 justify-start font-bold text-sm px-4 rounded-xl bg-[#0B132B] border border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10 touch-target"
            >
              <FileDown className="w-5 h-5 mr-3 shrink-0" />
              Export to PDF
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {!isMobile ? (
        <PanelGroup direction="horizontal" className="flex-1">
          <Panel defaultSize={55} minSize={30} className="bg-black">
            {leftPanelContent}
          </Panel>

        <PanelResizeHandle className="w-1 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/30 transition-colors cursor-col-resize" />

        <PanelResizeHandle className="w-1 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/30 transition-colors cursor-col-resize" />

        <Panel defaultSize={45} minSize={25}>
          {rightPanelContent}
        </Panel>
      </PanelGroup>
    ) : (
      <div className="flex-1 flex flex-col overflow-hidden relative pb-16">
        {activeMobileTab === "media" ? (
          <div className="flex-1 bg-black overflow-hidden flex flex-col">
            {leftPanelContent}
          </div>
        ) : (
          <div className="flex-1 bg-[#0B132B] overflow-hidden flex flex-col">
            {rightPanelContent}
          </div>
        )}
      </div>
    )}

      <style>{`
        @media print {
          /* Hide everything except the notes area */
          body * { visibility: hidden; }
          .print-notes-area, .print-notes-area * { visibility: visible; }
          .print-notes-area {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100vw !important; height: auto !important;
            overflow: visible !important;
            background: white;
            color: black;
            font-family: 'Georgia', serif;
            padding: 32px;
          }
          .no-print { display: none !important; }
          /* Cornell Notes grid */
          .cornell-print-grid {
            display: grid;
            grid-template-columns: 1fr 2fr 1fr;
            gap: 16px;
            border: 1px solid #ccc;
            border-radius: 4px;
          }
          .cornell-col {
            padding: 12px;
            border-right: 1px solid #ccc;
            min-height: 400px;
          }
          .cornell-col:last-child { border-right: none; }
          .cornell-col-header {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: #a08020;
            border-bottom: 1px solid #ccc;
            padding-bottom: 6px;
            margin-bottom: 10px;
          }
          .cornell-item {
            font-size: 12px;
            margin-bottom: 8px;
            line-height: 1.6;
          }
          .cornell-summary {
            margin-top: 20px;
            padding: 12px;
            background: #fffde7;
            border: 1px solid #e0c040;
            border-radius: 4px;
          }
          .print-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 2px solid #D4AF37;
          }
        }
      `}</style>

      {/* Printable Cornell Notes layout (hidden in UI, shown on print) */}
      <div className="print-notes-area" style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <div className="print-header">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Bible Study Pro — Cornell Notes</h1>
            <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>
              Study: {studies.find(s => s.id === studyId)?.title || 'Live Session'} · Exported: {new Date().toLocaleDateString()}
            </p>
          </div>
          <div style={{ fontSize: 10, color: '#999', textAlign: 'right' }}>
            The Israel of God<br />Pastor Henry Buie · Riverdale, IL
          </div>
        </div>
        <div className="cornell-print-grid">
          <div className="cornell-col">
            <div className="cornell-col-header">Cue Questions</div>
            {notesData.questions.filter(Boolean).map((q, i) => (
              <div key={i} className="cornell-item"><strong>Q{i + 1}:</strong> {q}</div>
            ))}
          </div>
          <div className="cornell-col">
            <div className="cornell-col-header">Main Notes</div>
            {notesData.notes.filter(Boolean).map((n, i) => (
              <div key={i} className="cornell-item" style={{ marginBottom: 12 }}>{n}</div>
            ))}
          </div>
          <div className="cornell-col">
            <div className="cornell-col-header">Summary</div>
            <div className="cornell-item">{notesData.summary}</div>
          </div>
        </div>
        {liveTranscript && (
          <div style={{ marginTop: 20, padding: 12, border: '1px solid #ccc', borderRadius: 4 }}>
            <div className="cornell-col-header">Live Transcript</div>
            <p style={{ fontSize: 11, lineHeight: 1.7, fontStyle: 'italic' }}>{liveTranscript}</p>
          </div>
        )}
      </div>
    </div>
  );
}
