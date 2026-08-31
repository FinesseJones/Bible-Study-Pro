import { getAllStudyItems, getYouTubeThumbnailUrl } from "../../../shared/studyData";
import { useState, useMemo } from "react";

type StudyItem = {
  title: string;
  video: string;
  topic: string;
  notes?: {
    questions?: string[];
    notes?: string[];
    summary?: string;
  };
  summary?: string;
  scriptures?: string[];
  pdf?: string;
  keywords?: string[];
  date_added?: string;
};

const Home = () => {
  const allItems = getAllStudyItems();
  const [searchQuery, setSearchQuery] = useState("");
  const [notesState, setNotesState] = useState<Record<string, string>>({});
  const [summaryState, setSummaryState] = useState<Record<string, string>>({});

  // Enhanced search function that searches across all specified fields
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems;
    
    const searchLower = searchQuery.toLowerCase();
    
    return allItems.filter(item => {
      // Search in title
      if (item.title?.toLowerCase().includes(searchLower)) return true;
      
      // Search in topic
      if (item.topic?.toLowerCase().includes(searchLower)) return true;
      
      // Search in summary (direct field)
      if (item.summary?.toLowerCase().includes(searchLower)) return true;
      
      // Search in notes (nested structure)
      if (item.notes?.notes?.some(note => note.toLowerCase().includes(searchLower))) return true;
      
      // Search in questions (nested structure)
      if (item.notes?.questions?.some(question => question.toLowerCase().includes(searchLower))) return true;
      
      // Search in scriptures array
      if (item.scriptures?.some(scripture => scripture.toLowerCase().includes(searchLower))) return true;
      
      // Search in keywords array
      if (item.keywords?.some(keyword => keyword.toLowerCase().includes(searchLower))) return true;
      
      return false;
    });
  }, [allItems, searchQuery]);

  // Limit rendered results to 100 items for performance
  const displayedItems = useMemo(() => {
    return filteredItems.slice(0, 100);
  }, [filteredItems]);

  const handleNotesChange = (id: string, value: string) => {
    setNotesState(prev => ({ ...prev, [id]: value }));
  };

  const handleSummaryChange = (id: string, value: string) => {
    setSummaryState(prev => ({ ...prev, [id]: value }));
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>🔥 Bible Study Library</h1>

      <input
        placeholder="Search Sabbath, Salvation, Law..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ width: "100%", padding: 10, marginBottom: 20 }}
      />

      <p><strong>Total Lessons:</strong> {allItems.length}</p>
      <p><strong>Showing:</strong> {displayedItems.length} of {filteredItems.length} results</p>

      {displayedItems.map((item, index) => {
        // Create a unique ID for each item based on title and index
        const itemId = `${item.title.replace(/[^\w]/g, "_")}-${index}`;
        
        return (
          <div key={itemId} style={{ marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #eee" }}>
            <div style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: "1.1em"}}>{item.title || "Untitled"}</strong><br />
              <small style={{ color: "#666"}}>{item.topic || "General"}</small>
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <a href={item.video || "#"} target="_blank" rel="noopener noreferrer" style={{ color: "#0070f3", textDecoration: "none" }}>
                ▶ Watch Lesson
              </a>
              {item.pdf && (
                <>
                  &nbsp;|&nbsp;
                  <a href={`/pdfs/${item.pdf}`} target="_blank" rel="noopener noreferrer" style={{ color: "#0070f3", textDecoration: "none" }}>
                    📄 PDF
                  </a>
                </>
              )}
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label htmlFor={`notes-${itemId}`} style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>
                Notes:
              </label>
              <textarea
                id={`notes-${itemId}`}
                value={notesState[itemId] || ""}
                onChange={(e) => handleNotesChange(itemId, e.target.value)}
                placeholder="Take notes here..."
                style={{ width: "100%", height: 80, padding: 8, border: "1px solid #ddd", borderRadius: 4, fontFamily: "inherit" }}
              />
            </div>
            
            <div>
              <label htmlFor={`summary-${itemId}`} style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>
                Summary:
              </label>
              <textarea
                id={`summary-${itemId}`}
                value={summaryState[itemId] || ""}
                onChange={(e) => handleSummaryChange(itemId, e.target.value)}
                placeholder="Write summary here..."
                style={{ width: "100%", height: 60, padding: 8, border: "1px solid #ddd", borderRadius: 4, fontFamily: "inherit" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Home;