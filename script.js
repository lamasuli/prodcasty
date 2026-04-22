
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

// ✅ checkboxes (by name, not id)
const optSummary  = document.querySelector('input[name="summary"]');
const optConcepts = document.querySelector('input[name="concepts"]');
const optQuiz     = document.querySelector('input[name="quiz"]');

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

urlInput.addEventListener("keyup", e => {
  if (e.key === "Enter") analyzeBtn.click();
});

// ✅ restart from scratch
function clearResults() {
  // اخفاء بلوكات التحليل
  summaryBlock.style.display = "none";
  conceptsBlock.style.display = "none";
  quizBlock.style.display = "none";

  // تفريغ المحتوى
  summaryText.textContent = "";
  pointsList.innerHTML = "";
  quizList.innerHTML = "";
  metaTags.innerHTML = "";

  // اخفاء قسم النتائج
  resultsSection.classList.remove("visible");

  // اخفاء الأخطاء واللودينق
  hideError();
  hideLoading();
}
newAnalysisBtn.addEventListener("click", () => window.location.reload());

// ============================================================
// UTILITIES
// ============================================================
function extractVideoId(input) {
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
  return h
    ? `${h}:${String(min).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    : `${min}:${String(s).padStart(2,"0")}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric"
  });
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

  if (!data.items?.length) throw new Error("Video not found.");

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
// STEP 2 — AI ANALYSIS (SUMMARY + INSIGHTS + QUIZ)
// ============================================================
async function fetchAIAnalysis(video, options) {

  const sections = [];
  if (options.summary) sections.push("summary");
  if (options.insights) sections.push("insights");
  if (options.quiz) sections.push("quiz");

  const prompt = `
You are analyzing a long YouTube podcast.

Return ONLY valid JSON.
Include ONLY these sections: ${sections.join(", ")}

Rules:
- Summary: 3 paragraphs, feels like watching the full podcast.
- Insights: practical, actionable, non-generic.
- Quiz: test understanding (why / scenario-based), not memorization.

JSON format:
{
  "summary": "Detailed summary",
  "insights": [
    {
      "title": "Insight title",
      "why": "Why this matters",
      "when": "When to apply it",
      "example": "Concrete example"
    }
  ],
  "quiz": [
    {
      "question": "Scenario or why question?",
      "answer": "Explanation-based answer"
    }
  ]
}

Title: ${video.title}
Description:
${video.description.slice(0, 3000)}
`.trim();

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "http://localhost",
      "X-Title": "Podcasty"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 900,
      response_format: { type: "json_object" }
    })
  });

  const data = await res.json();
  if (!data.choices?.length) throw new Error("AI returned no result.");

  const raw = data.choices[0].message.content;

  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    console.error("Invalid AI JSON:", raw);
    throw new Error("AI response was not valid JSON.");
  }
}

// ============================================================
// STEP 3 — RENDER META
// ============================================================
function renderMeta(video) {
  metaThumb.src = video.thumbnail;
  metaDuration.textContent = formatDuration(video.duration);
  metaTitle.textContent = video.title;
  metaChannel.textContent = video.channel;
  statViews.textContent = `👁 ${formatNumber(video.views)}`;
  statLikes.textContent = `♥ ${formatNumber(video.likes)}`;
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
// STEP 4 — RENDER ANALYSIS (CARDS + QUIZ)
// ============================================================
function renderAnalysis(analysis, options) {

  // ✅ Summary
  summaryBlock.style.display = options.summary ? "block" : "none";
  summaryText.textContent = analysis.summary || "";

  // ✅ Insights → Cards
  conceptsBlock.style.display = options.insights ? "block" : "none";
  pointsList.innerHTML = "";

  if (Array.isArray(analysis.insights)) {
    analysis.insights.forEach(insight => {
      const li = document.createElement("li");
      li.className = "insight-card";
      li.innerHTML = `
        <h4>${insight.title}</h4>
        <p><strong>Why it matters:</strong> ${insight.why}</p>
        <p><strong>When to use:</strong> ${insight.when}</p>
        <p><strong>Example:</strong> ${insight.example}</p>
      `;
      pointsList.appendChild(li);
    });
  }

  // ✅ Quiz (thinking-based)
  quizBlock.style.display = options.quiz ? "block" : "none";
  quizList.innerHTML = "";

  if (Array.isArray(analysis.quiz)) {
    analysis.quiz.forEach((q, i) => {
      const li = document.createElement("li");
      li.className = "quiz-card";
      li.innerHTML = `
        <p><strong>Q${i + 1}:</strong> ${q.question}</p>
        <details>
          <summary>Show answer</summary>
          <p class="quiz-answer">${q.answer}</p>
        </details>
      `;
      quizList.appendChild(li);
    });
  }
}

// ============================================================
// REVEAL ANIMATIONS
// ============================================================
function revealSections() {
  document
    .querySelectorAll(".summary-block, .concepts-block, .quiz-block")
    .forEach((el, i) => {
      el.classList.remove("visible");
      el.classList.add("reveal");
      setTimeout(() => el.classList.add("visible"), i * 200);
    });
}

// ============================================================
// MAIN PIPELINE
// ============================================================
async function runAnalysis(url) {

  hideError();
  const id = extractVideoId(url);
  if (!id) return showError("Invalid YouTube URL.");

  const options = {
    summary: optSummary.checked,
    insights: optConcepts.checked,
    quiz: optQuiz.checked
  };

  try {
    showLoading("Fetching video data…");
    const video = await fetchYouTubeData(id);

    showLoading("Analyzing with AI…");
    const analysis = await fetchAIAnalysis(video, options);

    renderMeta(video);
    renderAnalysis(analysis, options);
    revealSections();

    hideLoading();
    resultsSection.scrollIntoView({ behavior: "smooth" });

  } catch (err) {
    hideLoading();
    showError(err.message);
  }
}
``