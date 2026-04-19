
const YOUTUBE_API_KEY = "AIzaSyBwjjLPme8N3EJQ-SHRRvvIs5QsQZnDvok";
const OPENROUTER_API_KEY = "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";

const YT_API_BASE = "https://www.googleapis.com/youtube/v3/videos";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// ============================================================
// DOM REFERENCES
// ============================================================
const urlInput = document.getElementById("urlInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const errorBox = document.getElementById("errorBox");
const errorMsg = document.getElementById("errorMsg");
const loadingSection = document.getElementById("loadingSection");
const loadingText = document.getElementById("loadingText");
const resultsSection = document.getElementById("resultsSection");
const clearBtn = document.getElementById("clearBtn");
const newAnalysisBtn = document.getElementById("newAnalysisBtn");

const metaThumb = document.getElementById("metaThumb");
const metaDuration = document.getElementById("metaDuration");
const metaTitle = document.getElementById("metaTitle");
const metaChannel = document.getElementById("metaChannel");
const statViews = document.getElementById("statViews");
const statLikes = document.getElementById("statLikes");
const statPublished = document.getElementById("statPublished");
const metaTags = document.getElementById("metaTags");

const summaryBlock = document.getElementById("summaryBlock");
const summaryText = document.getElementById("summaryText");
const conceptsBlock = document.getElementById("conceptsBlock");
const pointsList = document.getElementById("pointsList");
const quizBlock = document.getElementById("quizBlock");
const quizList = document.getElementById("quizList");

// ============================================================
// EVENT LISTENERS
// ============================================================
analyzeBtn.addEventListener("click", () => {
  if (!urlInput.value.trim()) {
    showError("Please paste a YouTube URL first.");
    return;
  }
  runAnalysis(urlInput.value.trim());
});

urlInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") analyzeBtn.click();
});

clearBtn.addEventListener("click", clearResults);
newAnalysisBtn.addEventListener("click", () => {
  clearResults();
  urlInput.value = "";
  urlInput.focus();
});

// ============================================================
// UTILITIES
// ============================================================
function extractVideoId(input) {
  if (/^[\w-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.searchParams.get("v")) return url.searchParams.get("v");
    if (url.hostname === "youtu.be") return url.pathname.slice(1);
  } catch {}
  return null;
}

function formatNumber(n) {
  const num = parseInt(n, 10);
  if (isNaN(num)) return "—";
  if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toString();
}

function formatDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = m[1] || 0, min = m[2] || 0, s = m[3] || 0;
  return h ? `${h}:${String(min).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${min}:${String(s).padStart(2,"0")}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ============================================================
// UI HELPERS
// ============================================================
function showError(msg) {
  errorMsg.textContent = msg;
  errorBox.classList.add("visible");
}

function hideError() {
  errorBox.classList.remove("visible");
}

function showLoading(msg) {
  loadingText.textContent = msg;
  loadingSection.classList.add("visible");
  resultsSection.classList.remove("visible");
}

function hideLoading() {
  loadingSection.classList.remove("visible");
  resultsSection.classList.add("visible");
}

function clearResults() {
  pointsList.innerHTML = "";
  quizList.innerHTML = "";
  metaTags.innerHTML = "";
  resultsSection.classList.remove("visible");
  hideError();
  hideLoading();
}

// ============================================================
// STEP 1 — YouTube API
// ============================================================
async function fetchYouTubeData(videoId) {
  const params = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    id: videoId,
    key: YOUTUBE_API_KEY
  });

  const res = await fetch(`${YT_API_BASE}?${params}`);
  const data = await res.json();
  if (!data.items || !data.items.length) throw new Error("Video not found.");

  const v = data.items[0];
  return {
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    description: v.snippet.description,
    thumbnail: v.snippet.thumbnails.high.url,
    views: v.statistics.viewCount,
    likes: v.statistics.likeCount,
    published: v.snippet.publishedAt,
    duration: v.contentDetails.duration,
    tags: v.snippet.tags || []
  };
}

// ============================================================
// STEP 2 — OpenRouter AI Analysis
// ============================================================
async function fetchAIAnalysis(video) {
  const prompt = `
Analyze the following YouTube video and return ONLY valid JSON.

Title: ${video.title}
Description:
${video.description.slice(0, 3000)}

Return this exact JSON structure:
{
  "summary": "Short summary",
  "concepts": ["Concept 1", "Concept 2", "Concept 3"],
  "quiz": [{"question":"Q?","answer":"A"}]
}
  `.trim();

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "http://localhost",
      "X-Title": "Podcasty CCSW321"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 500
    })
  });

  const data = await res.json();

  let rawText = data.choices[0].message.content.trim();
  rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI response is not valid JSON.");

  return JSON.parse(rawText.slice(start, end + 1));
}

// ============================================================
// STEP 3 — Render video metadata
// ============================================================
function renderMeta(video) {
  metaThumb.src = video.thumbnail;
  metaThumb.alt = video.title;
  metaDuration.textContent = formatDuration(video.duration);
  metaTitle.textContent = video.title;
  metaChannel.textContent = video.channel;
  statViews.textContent = `👁 ${formatNumber(video.views)} views`;
  statLikes.textContent = `♥ ${formatNumber(video.likes)} likes`;
  statPublished.textContent = `📅 ${formatDate(video.published)}`;

  metaTags.innerHTML = "";
  video.tags.slice(0, 5).forEach(tag => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag;
    metaTags.appendChild(chip);
  });
}

// ============================================================
// STEP 4 — Render AI analysis
// ============================================================
function renderAnalysis(analysis) {
  summaryText.textContent = analysis.summary || "";
  summaryBlock.style.display = analysis.summary ? "block" : "none";

  pointsList.innerHTML = "";
  if (Array.isArray(analysis.concepts)) {
    analysis.concepts.forEach((c, i) => {
      const li = document.createElement("li");
      li.textContent = `${i + 1}. ${c}`;
      pointsList.appendChild(li);
    });
    conceptsBlock.style.display = "block";
  }

  quizList.innerHTML = "";
  if (Array.isArray(analysis.quiz) && analysis.quiz.length) {
    analysis.quiz.forEach((q, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>Q${i + 1}:</strong> ${q.question}<br><em>${q.answer}</em>`;
      quizList.appendChild(li);
    });
    quizBlock.style.display = "block";
  }
}

// ============================================================
// MAIN PIPELINE
// ============================================================
async function runAnalysis(url) {
  clearResults();
  const id = extractVideoId(url);
  if (!id) return showError("Invalid YouTube URL.");

  try {
    showLoading("Fetching video data…");
    const video = await fetchYouTubeData(id);

    showLoading("Analyzing with AI…");
    const analysis = await fetchAIAnalysis(video);

    renderMeta(video);
    renderAnalysis(analysis);
    hideLoading();
    
/* ✅ Auto-scroll to results */
resultsSection.scrollIntoView({
  behavior: "smooth",
  block: "start"
});

  } catch (err) {
    showError(err.message);
  }
}
