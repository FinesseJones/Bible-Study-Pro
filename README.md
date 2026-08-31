# 📖 Bible Study Pro

> **The Ultimate Theological Bible Study, Cornell Notes, and Sabbath Lesson Platform for The Israel of God (IOG).**

Bible Study Pro is a high-performance, local-first Bible study workstation and progressive web app (PWA) engineered for deep scripture analysis, video broadcasts, Google Drive library synchronization, and official Sabbath lesson generation.

---

## 🌟 Key Features

### 1. 📜 Official Sabbath Lesson PDF Builder (Riverdale Standard)
- Automatically compiles structured Sabbath Lesson reading sheets matching the official Israel of God Riverdale format.
- Includes official header banner, teacher/reader metadata, foundational precept, sequential KJV scripture reading table, key inquiry questions, theological summary, and Riverdale ministry contact footer.
- Export directly to printable PDF, save to Scripture Vault, or open side-by-side in Cornell Notes.

### 2. 📝 Cornell Notes Workspace & Video Sync
- Split-screen study combining video broadcasts (YouTube / live streams), Google Drive PDFs, Scripture Vault documents, and live microphone transcription.
- **⏱️ Timestamped Video Bookmarks**: Insert `[MM:SS]` timecodes into notes with one click. Clicking any timecode badge seeks the video player to that exact second.

### 3. 📖 Strong's Concordance (Hebrew & Greek)
- Instant lexical lookup for Hebrew (`H####`) and Greek (`G####`) root words.
- Displays original biblical script, transliteration, pronunciation, and complete Strong's theological definitions.

### 4. ⚡ Precept-Upon-Precept Cross-Reference Engine
- Automatically surfaces companion scriptures (*"precept upon precept, line upon line"*) when clicking any verse reference.

### 5. 🧠 Spaced Repetition Leitner Flashcards
- Memorization system inside the AI Study Guide tab with active recall interval ratings (*Again 1d*, *Hard 3d*, *Good 7d*, *Mastered*).

---

## 📱 Access From Any Device (Phone, Tablet, Laptop)

### 🏡 On Your Local Network (Same Wi-Fi)
Open your web browser on your iPhone, iPad, Android phone, or secondary laptop:
```
http://10.0.0.203:5001
```

### 📲 Install as Native Mobile App (PWA)
1. **iOS (iPhone/iPad)**: Open `http://10.0.0.203:5001` in Safari ➔ Tap **Share** (square with arrow) ➔ Tap **"Add to Home Screen"**.
2. **Android**: Open in Chrome ➔ Tap the three dots (⋮) ➔ Tap **"Install App"** or **"Add to Home screen"**.
3. **Mac/Windows**: Open in Chrome/Edge ➔ Click the **Install** icon in the address bar.

---

## 🛠️ Tech Stack
- **Frontend**: React 19, TypeScript, TailwindCSS, Radix UI, Lucide Icons, Framer Motion, Vite PWA
- **Backend**: Node.js, Express, tRPC, Drizzle ORM, MySQL
- **AI & Sync**: Ollama (Qwen 2.5 Coder / Qwen 3.6 / Llama 3.1), Google Drive API, YouTube Data API
