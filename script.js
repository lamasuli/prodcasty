/* ============================================================
   PODCASTY — script.js
   Author: [Your Name]
   Course: CCSW321 – Web Development
   Description:
     Fetches YouTube video metadata via YouTube Data API v3,
     then sends that data to Claude (Anthropic API) to produce
     an AI analysis (summary, key concepts, quiz).
     Uses AJAX (fetch) for all API communication.
     DOM is updated dynamically — no page refresh.
   ============================================================ */

// ============================================================
// 🔑  API KEYS — replace these with your real keys
// ============================================================
const YOUTUBE_API_KEY   = "YOUR_YOUTUBE_DATA_API_KEY_HERE";
const ANTHROPIC_API_KEY = "YOUR_ANTHROPIC_API_KEY_HERE";

// Anthropic API endpoint
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// YouTube Data API base
const YT_API_BASE   = "https://www.googleapis.com/youtube/v3/videos";

// ============================================================
// DOM references
// ============================================================
const urlInput        = document.getElementById("urlInput");
const analyzeBtn      = document.getElementById("analyzeBtn");
const errorBox        = document.getElementById("errorBox");
const errorMsg        = document.getElementById("errorMsg");
const loadingSection  = document.getElementById("loadingSection");
const loadingText     = document.getElementById("loadingText");
const resultsSection  = document.getElementById("resultsSection");
const clearBtn        = document.getElementById("clearBtn");
const newAnalysisBtn  = document.getElementById("newAnalysisBtn");

// Meta card elements
const metaThumb       = document.getElementById("metaThumb");
const metaDuration    = document.getElementById("metaDuration");
const metaTitle       = document.getElementById("metaTitle");
const metaChannel     = document.getElementById("metaChannel");
const statViews       = document.getElementById("statViews");
const statLikes       = document.getElementById("statLikes");
const statPublished   = document.getElementById("statPublished");
const metaTags        = document.getElementById("metaTags");

// Analysis card elements
const summaryBlock    = document.getElementById("summaryBlock");
const summaryText     = document.getElementById("summaryText");
const conceptsBlock   = document.getElementById("conceptsBlock");
const pointsList      = document.getElementById("pointsList");
const quizBlock       = document.getElementById("quizBlock");
const quizList        = document.getElementById("quizList");

// Checkbox options
const chkConcepts     = document.querySelector("input[name='concepts']");
const chkSummary      = document.querySelector("input[name='summary']");
const chkQuiz         = document.querySelector("input[name='quiz']");

// ============================================================
// EVENT LISTENERS
// ============================================================

// Event 1: click — Analyze button triggers analysis
analyzeBtn.addEventListener("click", () => {
  const url = urlInput.value.trim();
  if (!url) {
    showError("Please paste a YouTube URL first.");
    return;
  }
  runAnalysis(url);
});

// Event 2: keyup — pressing Enter in the input triggers analysis
urlInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    const url = urlInput.value.trim();
    if (!url) {
      showError("Please paste a YouTube URL first.");
      return;
    }
    hideError();
    runAnalysis(url);
  }
  // Live-clear the error as user types
  if (urlInput.value.trim() === "") {
    hideError();
  }
});

// Event 3: click — Clear results button removes all result DOM elements
clearBtn.addEventListener("click", () => {
  clearResults();
});

// Event 4: click — "New Analysis" resets the form
newAnalysisBtn.addEventListener("click", () => {
  clearResults();
  urlInput.value = "";
  urlInput.focus();
});

// Event 5: dblclick (on each point) — copy concept text to clipboard
// This is attached dynamically when points are created (see renderPoints)

// ============================================================
// UTILITY — Extract YouTube Video ID from a URL
// ============================================================
/**
 * Parses a YouTube URL to extract the video ID.
 * Supports: standard watch links, short youtu.be links, embed links.
 * @param {string} input - Raw URL or bare video ID
 * @returns {string|null} video ID or null if not parseable
 */
function extractVideoId(input) {
  // If it's already a bare 11-character ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);
    // youtu.be/VIDEO_ID
    if (url.hostname === "youtu.be") return url.pathname.slice(1);
    // youtube.com/watch?v=VIDEO_ID
    if (url.searchParams.has("v")) return url.searchParams.get("v");
    // youtube.com/embed/VIDEO_ID
    const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];
  } catch (_) {
    // Not a valid URL — fall through
  }
  return null;
}

// ============================================================
// UTILITY — Format large numbers (e.g. 1,400,000 → 1.4M)
// ============================================================
function formatNumber(n) {
  const num = parseInt(n, 10);
  if (isNaN(num)) return "—";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000)     return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

// ============================================================
// UTILITY — Format ISO 8601 duration (PT4M13S → 4:13)
// ============================================================
function formatDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  const ss = s < 10 ? "0" + s : s;
  if (h > 0) {
    const mm = m < 10 ? "0" + m : m;
    return `${h}:${mm}:${ss}`;
  }
  return `${m}:${ss}`;
}

// ============================================================
// UTILITY — Format ISO date (2023-04-01T...) → "Apr 2023"
// ============================================================
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ============================================================
// SHOW / HIDE HELPERS
// ============================================================
function showError(msg) {
  errorMsg.textContent = msg;
  errorBox.classList.add("visible");
}

function hideError() {
  errorBox.classList.remove("visible");
}

function showLoading(msg = "Working…") {
  loadingText.textContent = msg;
  loadingSection.classList.add("visible");
  resultsSection.classList.remove("visible");
}

function hideLoading() {
  loadingSection.classList.remove("visible");
}

function showResults() {
  resultsSection.classList.add("visible");
}

// ============================================================
// CLEAR RESULTS — dynamically removes DOM elements
// ============================================================
function clearResults() {
  // Dynamically remove all point items from the list
  while (pointsList.firstChild) pointsList.removeChild(pointsList.firstChild);
  // Dynamically remove all quiz items
  while (quizList.firstChild) quizList.removeChild(quizList.firstChild);
  // Dynamically remove all tag chips
  while (metaTags.firstChild) metaTags.removeChild(metaTags.firstChild);

  // Hide sections
  resultsSection.classList.remove("visible");
  hideError();
  hideLoading();
}

// ============================================================
// STEP 1 — Fetch YouTube video metadata (AJAX call #1)
// ============================================================
/**
 * Calls the YouTube Data API v3 to get video snippet + statistics.
 * @param {string} videoId
 * @returns {Object} parsed video data object
 */
async function fetchYouTubeData(videoId) {
  // Build the request URL with required parts
  const params = new URLSearchParams({
    id:   videoId,
    part: "snippet,statistics,contentDetails",
    key:  YOUTUBE_API_KEY,
  });

  const response = await fetch(`${YT_API_BASE}?${params}`);

  // Check HTTP-level errors
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Check if the API returned any results
  if (!data.items || data.items.length === 0) {
    throw new Error("Video not found. Check the URL and try again.");
  }

  // Check for API-level errors (e.g., invalid key)
  if (data.error) {
    throw new Error(`YouTube API: ${data.error.message}`);
  }

  const item     = data.items[0];
  const snippet  = item.snippet;
  const stats    = item.statistics;
  const details  = item.contentDetails;

  // Return the 5+ data points required by the assignment
  return {
    title:       snippet.title,                                 // Data point 1: title
    channel:     snippet.channelTitle,                         // Data point 2: channel
    description: snippet.description,                          // used for AI analysis
    thumbnail:   snippet.thumbnails?.maxres?.url
                 || snippet.thumbnails?.high?.url
                 || snippet.thumbnails?.default?.url,          // Data point 3: thumbnail
    views:       stats.viewCount    || "0",                    // Data point 4: views
    likes:       stats.likeCount    || "0",                    // Data point 5: likes
    published:   snippet.publishedAt,                          // Data point 6: publish date
    duration:    details.duration   || "",                     // Data point 7: duration
    tags:        snippet.tags       || [],                      // bonus: topic tags
  };
}

// ============================================================
// STEP 2 — Send data to Claude API for analysis (AJAX call #2)
// ============================================================
/**
 * Sends video title + description to Claude and asks for
 * a structured JSON response with summary, key concepts, quiz.
 * @param {Object} videoData - data returned by fetchYouTubeData
 * @returns {Object} { summary, concepts, quiz }
 */
async function fetchAIAnalysis(videoData) {
  // Build the user options string
  const wantSummary  = chkSummary.checked;
  const wantConcepts = chkConcepts.checked;
  const wantQuiz     = chkQuiz.checked;

  // Craft a clear, structured prompt for Claude
  const prompt = `
You are an educational assistant. Analyze the following YouTube video and respond ONLY with a valid JSON object (no markdown, no extra text).

Video title: "${videoData.title}"
Channel: "${videoData.channel}"
Description:
"""
${videoData.description.slice(0, 3000)}
"""

Respond with this exact JSON structure:
{
  "summary": "${wantSummary ? "A 2-3 sentence plain-language summary of what this video is about" : ""}",
  "concepts": ${wantConcepts ? '["concept 1 as a full sentence", "concept 2", "concept 3", "concept 4", "concept 5", "concept 6"]' : "[]"},
  "quiz": ${wantQuiz ? '[{"question": "Q1?", "answer": "A1"}, {"question": "Q2?", "answer": "A2"}, {"question": "Q3?", "answer": "A3"}]' : "[]"}
}

Rules:
- Each concept must be a complete, standalone sentence that teaches something.
- Keep the summary under 60 words.
- Quiz questions should test real understanding.
- Do NOT add any text outside the JSON.
  `.trim();

  // AJAX call to Anthropic API
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      // Required for browser-side requests (CORS pre-flight)
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Claude API error: ${errData?.error?.message || response.statusText}`);
  }

  const data = await response.json();

  // Extract the text content from Claude's response
  const rawText = data.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("");

  // Strip any accidental markdown fences just in case
  const clean = rawText.replace(/```json|```/gi, "").trim();

  // Parse the JSON safely
  try {
    return JSON.parse(clean);
  } catch (parseErr) {
    throw new Error("Could not parse AI response. Please try again.");
  }
}

// ============================================================
// STEP 3 — Render video metadata into the DOM
// ============================================================
function renderMeta(video) {
  metaThumb.src   = video.thumbnail;
  metaThumb.alt   = video.title;
  metaDuration.textContent = formatDuration(video.duration);
  metaTitle.textContent    = video.title;
  metaChannel.textContent  = video.channel;

  statViews.textContent     = `👁 ${formatNumber(video.views)} views`;
  statLikes.textContent     = `♥ ${formatNumber(video.likes)} likes`;
  statPublished.textContent = `📅 ${formatDate(video.published)}`;

  // Dynamically create tag chip elements (DOM creation)
  const topTags = video.tags.slice(0, 5);
  topTags.forEach(tag => {
    const chip = document.createElement("span");    // ← dynamic DOM creation
    chip.className   = "tag-chip";
    chip.textContent = tag;
    metaTags.appendChild(chip);
  });
}

// ============================================================
// STEP 4 — Render AI analysis (summary, concepts, quiz)
// ============================================================
function renderAnalysis(analysis) {
  // --- Summary ---
  if (chkSummary.checked && analysis.summary) {
    summaryText.textContent = analysis.summary;
    summaryBlock.style.display = "block";
  } else {
    summaryBlock.style.display = "none";
  }

  // --- Key concepts (dynamically created li elements) ---
  if (chkConcepts.checked && Array.isArray(analysis.concepts)) {
    const concepts = analysis.concepts.filter(c => c && c.trim());

    concepts.forEach((concept, i) => {
      // Dynamically create a <li> element for each concept
      const li = document.createElement("li");         // ← dynamic DOM creation
      li.className = "point-item";
      li.setAttribute("title", "Double-click to copy");

      const numSpan = document.createElement("span");
      numSpan.className   = "point-num";
      numSpan.textContent = i + 1;

      const textSpan = document.createElement("span");
      textSpan.className   = "point-text";
      textSpan.textContent = concept;

      li.appendChild(numSpan);
      li.appendChild(textSpan);

      // Event 5: dblclick — copy concept text to clipboard
      li.addEventListener("dblclick", () => {
        navigator.clipboard.writeText(concept).then(() => {
          li.classList.add("copied");
          textSpan.textContent = "✓ Copied!";
          // Reset after 1.5s (DOM manipulation)
          setTimeout(() => {
            li.classList.remove("copied");
            textSpan.textContent = concept;
          }, 1500);
        }).catch(() => {
          // Fallback if clipboard API not available
          textSpan.textContent = "(Copy not available in this browser)";
          setTimeout(() => { textSpan.textContent = concept; }, 2000);
        });
      });

      pointsList.appendChild(li);
    });

    conceptsBlock.style.display = "block";
  } else {
    conceptsBlock.style.display = "none";
  }

  // --- Quiz (dynamically created items, click to reveal answer) ---
  if (chkQuiz.checked && Array.isArray(analysis.quiz) && analysis.quiz.length > 0) {
    analysis.quiz.forEach((qa, i) => {
      const li = document.createElement("li");        // ← dynamic DOM creation
      li.className = "quiz-item";

      const q = document.createElement("div");
      q.className   = "quiz-q";
      q.textContent = `Q${i + 1}: ${qa.question}`;

      const toggle = document.createElement("div");
      toggle.className   = "quiz-toggle";
      toggle.textContent = "Click to reveal answer ↓";

      const a = document.createElement("div");
      a.className   = "quiz-a";
      a.textContent = qa.answer;

      li.appendChild(q);
      li.appendChild(toggle);
      li.appendChild(a);

      // Click to reveal / hide the answer
      li.addEventListener("click", () => {
        const revealed = a.classList.toggle("revealed");
        toggle.textContent = revealed ? "Hide answer ↑" : "Click to reveal answer ↓";
      });

      quizList.appendChild(li);
    });

    quizBlock.style.display = "block";
  } else {
    quizBlock.style.display = "none";
  }
}

// ============================================================
// MAIN — Orchestrate the full analysis pipeline
// ============================================================
async function runAnalysis(rawUrl) {
  // 1) Reset state
  clearResults();
  hideError();

  // 2) Extract video ID
  const videoId = extractVideoId(rawUrl);
  if (!videoId) {
    showError("Could not parse a YouTube video ID from that URL. Please check and try again.");
    return;
  }

  // 3) Disable button to prevent double-submits
  analyzeBtn.disabled = true;
  analyzeBtn.classList.add("loading");

  try {
    // 4) Fetch YouTube metadata (AJAX call #1)
    showLoading("Fetching video info from YouTube…");
    const videoData = await fetchYouTubeData(videoId);

    // 5) Fetch AI analysis from Claude (AJAX call #2)
    showLoading("Analyzing with Claude AI…");
    const analysis = await fetchAIAnalysis(videoData);

    // 6) Render everything into the DOM
    renderMeta(videoData);
    renderAnalysis(analysis);

    // 7) Show results, hide loading
    hideLoading();
    showResults();

  } catch (err) {
    // Error handling — show a clear, user-friendly message
    hideLoading();
    console.error("[Podcasty]", err);

    // Translate common errors into friendly messages
    let friendlyMsg = err.message;
    if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      friendlyMsg = "Network error. Check your internet connection and try again.";
    } else if (err.message.includes("401") || err.message.includes("403")) {
      friendlyMsg = "API key rejected. Check that your keys are correct and have the right permissions.";
    } else if (err.message.includes("quota")) {
      friendlyMsg = "API quota exceeded. Please wait and try again later.";
    }

    showError(friendlyMsg);

  } finally {
    // Always re-enable the button
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove("loading");
  }
}
