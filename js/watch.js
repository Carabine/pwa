const API_BASE = window.ANIMEI_API
  || (['localhost', '127.0.0.1', ''].includes(window.location.hostname)
    ? 'http://localhost:3005/api/v1'
    : window.location.origin + '/api/v1');

let segments = [];

// ========== DOM ==========

const uploadArea = document.getElementById("upload-area");
const uploadBox = uploadArea.querySelector(".upload-box");
const videoInput = document.getElementById("video-input");
const urlInput = document.getElementById("url-input");
const urlBtn = document.getElementById("url-btn");
const watchArea = document.getElementById("watch-area");
const player = document.getElementById("player");
const playerWrap = document.getElementById("player-wrap");
const transcribeBtn = document.getElementById("transcribe-btn");
const statusBar = document.getElementById("status-bar");
const statusText = document.getElementById("status-text");
const progressFill = document.getElementById("progress-fill");
const subsPanel = document.getElementById("subs-panel");
const subsCount = document.getElementById("subs-count");

const liveSubsEl = document.getElementById("live-subs");
const liveJp = document.getElementById("live-jp");
const liveEn = document.getElementById("live-en");
const liveRu = document.getElementById("live-ru");

const playBtn = document.getElementById("play-btn");
const iconPlay = document.getElementById("icon-play");
const iconPause = document.getElementById("icon-pause");
const prevSegBtn = document.getElementById("prev-seg-btn");
const nextSegBtn = document.getElementById("next-seg-btn");
const backBtn = document.getElementById("back-btn");
const forwardBtn = document.getElementById("forward-btn");
const replaySegBtn = document.getElementById("replay-seg-btn");
const loopBtn = document.getElementById("loop-btn");
const seekBar = document.getElementById("seek-bar");
const speedSelect = document.getElementById("speed-select");
const muteBtn = document.getElementById("mute-btn");
const iconVol = document.getElementById("icon-vol");
const iconMute = document.getElementById("icon-mute");
const volumeBar = document.getElementById("volume-bar");
const pcTime = document.getElementById("pc-time");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");

const saveModal = document.getElementById("save-modal");
const saveWordInput = document.getElementById("save-word");
const saveKana = document.getElementById("save-kana");
const saveRomaji = document.getElementById("save-romaji");
const saveMeaning = document.getElementById("save-meaning");
const saveSentence = document.getElementById("save-sentence");
const saveTranslation = document.getElementById("save-translation");
const saveModalTitle = document.getElementById("save-modal-title");

// ========== VIDEO INPUT ==========

let currentVideoFile = null;
let currentVideoUrl = null;

uploadBox.addEventListener("click", () => videoInput.click());

uploadBox.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadBox.classList.add("dragover");
});

uploadBox.addEventListener("dragleave", () => {
  uploadBox.classList.remove("dragover");
});

uploadBox.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadBox.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("video/")) loadVideoFile(file);
});

videoInput.addEventListener("change", () => {
  if (videoInput.files[0]) loadVideoFile(videoInput.files[0]);
});

urlBtn.addEventListener("click", () => {
  const url = urlInput.value.trim();
  if (url) loadVideoUrl(url);
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") urlBtn.click();
});

function loadVideoFile(file) {
  currentVideoFile = file;
  currentVideoUrl = null;
  player.src = URL.createObjectURL(file);
  uploadArea.classList.add("hidden");
  watchArea.classList.remove("hidden");
  transcribe();
}

function isExternalPlayerUrl(url) {
  return /gencit\.info|opravar\.online|werberk\.pro/.test(url);
}

function loadVideoUrl(url) {
  currentVideoUrl = url;
  currentVideoFile = null;

  if (isExternalPlayerUrl(url)) {
    player.poster = "";
    player.removeAttribute("src");
  } else {
    player.src = url;
  }

  uploadArea.classList.add("hidden");
  watchArea.classList.remove("hidden");
  transcribe();
}

// ========== TRANSCRIPTION VIA SERVER ==========

const STEP_PROGRESS = { download: 10, audio: 30, transcribe: 50, tokenize: 75, translate: 90 };

async function transcribe() {
  transcribeBtn.disabled = true;
  statusBar.classList.add("hidden");

  showLoading("Подготовка...");
  setLoadingStep("download");
  setLoadingProgress(5);

  try {
    let result;

    if (currentVideoUrl) {
      result = await transcribeByUrl(currentVideoUrl);
    } else if (currentVideoFile) {
      loadingStatus.textContent = "Загрузка файла...";
      result = await transcribeByFile(currentVideoFile);
    } else {
      throw new Error("No video loaded");
    }

    segments = result.segments || [];

    if (result.meta?.videoUrl) {
      loadHlsVideo(result.meta.videoUrl);

    }

    setLoadingProgress(100);
    loadingStatus.textContent = `Готово — ${segments.length} сегментов`;
    loadingSteps.querySelectorAll(".loading-step").forEach(s => {
      s.classList.remove("active");
      s.classList.add("done");
    });

    renderSubtitles();
    liveSubsEl.classList.remove("hidden");
    setTimeout(() => hideLoading(), 800);
  } catch (err) {
    loadingStatus.textContent = "Ошибка: " + err.message;
    loadingProgressFill.style.background = "#ef4444";
    loadingOverlay.querySelector(".loading-spinner").style.display = "none";
    const retryBtn = document.createElement("button");
    retryBtn.className = "btn btn--ghost loading-retry";
    retryBtn.textContent = "Назад";
    retryBtn.addEventListener("click", () => {
      hideLoading();
      watchArea.classList.add("hidden");
      uploadArea.classList.remove("hidden");
    });
    loadingOverlay.appendChild(retryBtn);
    console.error(err);
  } finally {
    transcribeBtn.disabled = false;
  }
}

async function transcribeByUrl(url) {
  const res = await fetch(`${API_BASE}/transcribe/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    return new Promise((resolve, reject) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            reject(new Error("Stream ended without result"));
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const msg = JSON.parse(line.slice(6));
            if (msg.type === "step") {
              setLoadingStep(msg.step);
              setLoadingProgress(STEP_PROGRESS[msg.step] || 50);
              loadingStatus.textContent = msg.text;
            } else if (msg.type === "progress") {
              loadingStatus.textContent = msg.text;
              if (msg.pct >= 0) {
                const base = STEP_PROGRESS[msg.step] || 0;
                const nextSteps = Object.values(STEP_PROGRESS);
                const idx = nextSteps.indexOf(base);
                const next = nextSteps[idx + 1] || 100;
                const range = next - base;
                setLoadingProgress(base + Math.round(range * msg.pct / 100));
              }
            } else if (msg.type === "done") {
              resolve(msg.result);
              return;
            } else if (msg.type === "error") {
              reject(new Error(msg.error));
              return;
            }
          }
          read();
        }).catch(reject);
      }
      read();
    });
  }

  return res.json();
}

async function transcribeByFile(file) {
  const form = new FormData();
  form.append("video", file);

  const res = await fetch(`${API_BASE}/transcribe/file`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  return res.json();
}

transcribeBtn.addEventListener("click", transcribe);

// ========== PLAYER CONTROLS ==========

playerWrap.addEventListener("click", (e) => {
  if (e.target.closest(".live-subs")) return;
  togglePlay();
});

function togglePlay() {
  if (player.paused) {
    player.play();
    flashIcon(playIcon);
  } else {
    player.pause();
    flashIcon(pauseIcon);
  }
}

function flashIcon(el) {
  el.classList.remove("hidden", "flash");
  void el.offsetWidth;
  el.classList.add("flash");
  el.addEventListener("animationend", () => {
    el.classList.add("hidden");
    el.classList.remove("flash");
  }, { once: true });
}

playBtn.addEventListener("click", togglePlay);
player.addEventListener("play", updatePlayIcon);
player.addEventListener("pause", updatePlayIcon);

function updatePlayIcon() {
  const paused = player.paused;
  iconPlay.classList.toggle("hidden", !paused);
  iconPause.classList.toggle("hidden", paused);
}

backBtn.addEventListener("click", () => { player.currentTime = Math.max(0, player.currentTime - 3); });
forwardBtn.addEventListener("click", () => { player.currentTime = Math.min(player.duration || 0, player.currentTime + 3); });

function getActiveSegmentIndex() {
  const time = player.currentTime;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (time >= seg.start && (seg.end == null || time < seg.end)) return i;
  }
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start > time) return i;
  }
  return segments.length - 1;
}

prevSegBtn.addEventListener("click", () => {
  if (!segments.length) return;
  const idx = Math.max(0, getActiveSegmentIndex() - 1);
  player.currentTime = segments[idx].start;
  player.play();
});

nextSegBtn.addEventListener("click", () => {
  if (!segments.length) return;
  const idx = Math.min(segments.length - 1, getActiveSegmentIndex() + 1);
  player.currentTime = segments[idx].start;
  player.play();
});

replaySegBtn.addEventListener("click", () => {
  if (!segments.length) return;
  const idx = getActiveSegmentIndex();
  if (idx >= 0) {
    player.currentTime = segments[idx].start;
    player.play();
  }
});

let loopActive = false;
let loopSegIndex = -1;

loopBtn.addEventListener("click", () => {
  loopActive = !loopActive;
  loopBtn.classList.toggle("active", loopActive);
  if (loopActive && segments.length) {
    loopSegIndex = getActiveSegmentIndex();
  } else {
    loopSegIndex = -1;
  }
});

let isSeeking = false;
seekBar.addEventListener("input", () => {
  isSeeking = true;
  player.currentTime = (seekBar.value / 100) * (player.duration || 0);
});
seekBar.addEventListener("change", () => { isSeeking = false; });

fullscreenBtn.addEventListener("click", () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    playerWrap.requestFullscreen().catch(() => {});
  }
});

speedSelect.addEventListener("change", () => {
  player.playbackRate = parseFloat(speedSelect.value);
});

let savedVolume = 1;
muteBtn.addEventListener("click", () => {
  if (player.volume > 0) {
    savedVolume = player.volume;
    player.volume = 0;
    volumeBar.value = 0;
  } else {
    player.volume = savedVolume;
    volumeBar.value = savedVolume;
  }
  updateMuteIcon();
});

function updateMuteIcon() {
  const muted = player.volume === 0;
  iconVol.classList.toggle("hidden", muted);
  iconMute.classList.toggle("hidden", !muted);
}

volumeBar.addEventListener("input", () => {
  player.volume = parseFloat(volumeBar.value);
  updateMuteIcon();
});

player.addEventListener("timeupdate", onTimeUpdate);
player.addEventListener("loadedmetadata", () => {
  seekBar.max = 100;
  updateTimeDisplay();
});

// Fallback sync loop — timeupdate can be unreliable with HLS
(function syncLoop() {
  if (!player.paused && segments.length) {
    onTimeUpdate();
  }
  requestAnimationFrame(syncLoop);
})();

function onTimeUpdate() {
  const time = player.currentTime;
  const dur = player.duration || 0;
  if (!isSeeking && dur) seekBar.value = (time / dur) * 100;
  updateTimeDisplay();
  syncSubtitles(time);
  handleLoop(time);
}

function updateTimeDisplay() {
  pcTime.textContent = `${formatTime(player.currentTime)} / ${formatTime(player.duration || 0)}`;
}

function handleLoop(time) {
  if (!loopActive || loopSegIndex < 0 || loopSegIndex >= segments.length) return;
  const seg = segments[loopSegIndex];
  if (seg.end != null && time >= seg.end) player.currentTime = seg.start;
}

// ========== KEYBOARD SHORTCUTS ==========

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (!saveModal.classList.contains("hidden")) return;

  switch (e.code) {
    case "Space":
      e.preventDefault();
      togglePlay();
      break;
    case "ArrowLeft":
      e.preventDefault();
      if (e.shiftKey) prevSegBtn.click();
      else player.currentTime = Math.max(0, player.currentTime - 3);
      break;
    case "ArrowRight":
      e.preventDefault();
      if (e.shiftKey) nextSegBtn.click();
      else player.currentTime = Math.min(player.duration || 0, player.currentTime + 3);
      break;
    case "ArrowUp":
      e.preventDefault();
      player.volume = Math.min(1, player.volume + 0.1);
      volumeBar.value = player.volume;
      break;
    case "ArrowDown":
      e.preventDefault();
      player.volume = Math.max(0, player.volume - 0.1);
      volumeBar.value = player.volume;
      break;
    case "KeyR": replaySegBtn.click(); break;
    case "KeyL": loopBtn.click(); break;
    case "KeyF": fullscreenBtn.click(); break;
    case "KeyM": muteBtn.click(); break;
    case "BracketLeft": cycleSpeed(-1); break;
    case "BracketRight": cycleSpeed(1); break;
  }
});

function cycleSpeed(dir) {
  const opts = Array.from(speedSelect.options);
  let idx = speedSelect.selectedIndex;
  idx = Math.max(0, Math.min(opts.length - 1, idx + dir));
  speedSelect.selectedIndex = idx;
  player.playbackRate = parseFloat(opts[idx].value);
}

// ========== HLS VIDEO ==========

let currentHls = null;

function loadHlsVideo(url) {
  if (currentHls) {
    currentHls.destroy();
    currentHls = null;
  }

  if (url.includes(".m3u8") && typeof Hls !== "undefined" && Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(player);
    hls.on(Hls.Events.ERROR, (_, data) => {
      console.error("HLS error:", data);
    });
    currentHls = hls;
  } else {
    player.src = url;
  }
}

// ========== LOADING OVERLAY ==========

const loadingOverlay = document.getElementById("loading-overlay");
const loadingStatus = document.getElementById("loading-status");
const loadingSteps = document.getElementById("loading-steps");
const loadingProgressFill = document.getElementById("loading-progress-fill");

function showLoading(text) {
  loadingOverlay.classList.remove("hidden");
  loadingStatus.textContent = text || "Подготовка...";
  loadingProgressFill.style.width = "0%";
  loadingProgressFill.style.background = "";
  loadingOverlay.querySelector(".loading-spinner").style.display = "";
  const retryBtn = loadingOverlay.querySelector(".loading-retry");
  if (retryBtn) retryBtn.remove();
  loadingSteps.querySelectorAll(".loading-step").forEach(s => {
    s.classList.remove("active", "done");
  });
}

function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

function setLoadingStep(stepName) {
  const steps = loadingSteps.querySelectorAll(".loading-step");
  let found = false;
  steps.forEach(s => {
    if (s.dataset.step === stepName) {
      s.classList.add("active");
      s.classList.remove("done");
      found = true;
    } else if (!found) {
      s.classList.remove("active");
      s.classList.add("done");
    }
  });
}

function setLoadingProgress(pct) {
  loadingProgressFill.style.width = pct + "%";
}

// ========== UI HELPERS ==========

function setStatus(text) { statusText.textContent = text; }
function setProgress(pct) { progressFill.style.width = pct + "%"; }

function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ========== RENDER SUBTITLES ==========

function renderSubtitles() {
  subsPanel.innerHTML = "";
  subsCount.textContent = segments.length + " segments";

  segments.forEach((seg, i) => {
    const el = document.createElement("div");
    el.className = "sub-segment";
    el.dataset.index = i;

    const timeEl = document.createElement("div");
    timeEl.className = "sub-segment__time";
    timeEl.textContent = `${formatTime(seg.start)} — ${formatTime(seg.end)}`;

    const wordsEl = document.createElement("div");
    wordsEl.className = "sub-segment__words";

    (seg.tokens || []).forEach((token) => {
      const span = document.createElement("span");
      span.className = "sub-word" + (token.isParticle ? " sub-word--particle" : "");
      span.textContent = token.surface;

      const hasKanji = token.kana && token.kana !== token.surface;
      if (hasKanji) {
        const reading = document.createElement("span");
        reading.className = "sub-word__reading";
        reading.textContent = token.kana;
        span.appendChild(reading);
      }

      span.addEventListener("click", (e) => {
        e.stopPropagation();
        openSaveModal(token, seg.text, seg.english);
      });

      wordsEl.appendChild(span);
    });

    el.appendChild(timeEl);
    el.appendChild(wordsEl);

    const bottomRow = document.createElement("div");
    bottomRow.className = "sub-segment__bottom";

    const transWrap = document.createElement("div");
    transWrap.className = "sub-segment__translations";
    if (seg.english) {
      const enEl = document.createElement("div");
      enEl.className = "sub-segment__translation sub-segment__translation--en";
      enEl.textContent = seg.english;
      transWrap.appendChild(enEl);
    }
    if (seg.russian) {
      const ruEl = document.createElement("div");
      ruEl.className = "sub-segment__translation sub-segment__translation--ru";
      ruEl.textContent = seg.russian;
      transWrap.appendChild(ruEl);
    }
    bottomRow.appendChild(transWrap);

    const aiBtn = document.createElement("button");
    aiBtn.className = "sub-ai-btn";
    aiBtn.textContent = "AI";
    aiBtn.title = "Break down with ChatGPT";
    aiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const prompt = `Разбери японское предложение по грамматике для изучающего японский.

「${seg.text}」${seg.english ? `\n(${seg.english})` : ''}

Формат ответа:

Сначала дай краткий перевод предложения на русский.

Потом разбери каждую грамматическую конструкцию по отдельности (как пронумерованный список). Для каждой:
- Напиши саму конструкцию и её чтение в скобках
- Покажи из каких частей она состоит и как образована (цепочкой со стрелками →)
- Объясни грамматический паттерн (～てみる, ～たい, ～ている и т.д.) — что он значит
- Дай итоговое значение этой части фразы
- Используй 📌 для структуры и 👉 для итога

В конце дай полный смысл всего предложения.

Отвечай на русском. Пиши живым языком, не сухо.`;
      window.open("https://chat.openai.com/?q=" + encodeURIComponent(prompt), "_blank");
    });
    bottomRow.appendChild(aiBtn);

    el.appendChild(bottomRow);

    el.addEventListener("click", () => {
      if (seg.start != null) {
        player.currentTime = seg.start;
        player.play();
      }
    });

    subsPanel.appendChild(el);
  });
}

// ========== SYNC SUBTITLES ==========

let lastActiveIndex = -1;

function syncSubtitles(time) {
  const els = subsPanel.querySelectorAll(".sub-segment");
  let activeIndex = -1;

  els.forEach((el, i) => {
    const seg = segments[i];
    if (!seg) return;
    const isActive = time >= seg.start && (seg.end == null || time < seg.end);
    el.classList.toggle("active", isActive);
    if (isActive) {
      activeIndex = i;
      if (i !== lastActiveIndex && !isElementInView(el, subsPanel)) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  });

  if (activeIndex !== lastActiveIndex) {
    lastActiveIndex = activeIndex;
    if (activeIndex >= 0) {
      const seg = segments[activeIndex];
      liveJp.textContent = seg.text;
      liveEn.textContent = seg.english || "";
      liveRu.textContent = seg.russian || "";
    } else {
      liveJp.textContent = "";
      liveEn.textContent = "";
      liveRu.textContent = "";
    }
  }
}

function isElementInView(el, container) {
  const rect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return rect.top >= containerRect.top && rect.bottom <= containerRect.bottom;
}

// ========== SAVE WORD MODAL ==========

function openSaveModal(token, sentence, english) {
  saveModalTitle.textContent = token.baseForm;
  saveWordInput.value = token.baseForm;
  saveKana.value = token.kana;
  saveRomaji.value = "";
  saveMeaning.value = "";
  saveSentence.value = sentence;
  saveTranslation.value = english || "";
  saveModal.classList.remove("hidden");
  saveMeaning.focus();
}

document.getElementById("save-cancel").addEventListener("click", () => {
  saveModal.classList.add("hidden");
});

saveModal.addEventListener("click", (e) => {
  if (e.target === saveModal) saveModal.classList.add("hidden");
});

document.getElementById("save-confirm").addEventListener("click", async () => {
  // Серверная форма слова: вошёл — уйдёт в аккаунт, гость — сохранится локально.
  const payload = {
    kanji: saveWordInput.value,
    kana: saveKana.value,
    romaji: saveRomaji.value,
    translation: saveMeaning.value,
    sentence: saveSentence.value,
    sentenceTranslation: saveTranslation.value,
    hint: "",
  };

  try {
    await saveWord(payload);
    if (window.animeiTrack) window.animeiTrack("save_word", payload.kanji);
    saveModal.classList.add("hidden");
    if (typeof showSnackbar === "function") {
      showSnackbar("Word saved to dictionary", { duration: 3000, type: "success" });
    }
  } catch (err) {
    console.error("Не удалось сохранить слово:", err);
    if (typeof showSnackbar === "function") {
      showSnackbar("Failed to save word", { duration: 3000, type: "error" });
    }
  }
});
