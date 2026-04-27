#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const kuromoji = require("kuromoji");
const wanakana = require("wanakana");

const DICT_PATH = path.join(
  path.dirname(require.resolve("kuromoji")),
  "..",
  "dict"
);

function parseSrt(text) {
  const blocks = text.replace(/\r\n/g, "\n").trim().split(/\n\n+/);
  const entries = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!timeMatch) continue;

    const start = toSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
    const end = toSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
    const text = lines.slice(2).join(" ").replace(/<[^>]+>/g, "").trim();

    if (text) {
      entries.push({ start, end, text });
    }
  }
  return entries;
}

function toSeconds(h, m, s, ms) {
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
}

function matchSubtitles(jpSubs, enSubs) {
  return jpSubs.map((jp) => {
    let bestMatch = null;
    let bestOverlap = 0;

    for (const en of enSubs) {
      const overlapStart = Math.max(jp.start, en.start);
      const overlapEnd = Math.min(jp.end, en.end);
      const overlap = overlapEnd - overlapStart;

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = en;
      }
    }

    return {
      start: jp.start,
      end: jp.end,
      japanese: jp.text,
      english: bestMatch ? bestMatch.text : "",
    };
  });
}

function tokenizeSentence(tokenizer, sentence) {
  const tokens = tokenizer.tokenize(sentence);
  const words = [];

  for (const token of tokens) {
    if (["助詞", "記号", "助動詞"].includes(token.pos)) continue;

    const reading = token.reading || token.surface_form;
    const kana = wanakana.toHiragana(reading, { passRomaji: false });
    const romaji = wanakana.toRomaji(reading);

    words.push({
      word: token.surface_form,
      baseForm: token.basic_form !== "*" ? token.basic_form : token.surface_form,
      kana,
      romaji,
      pos: token.pos,
      posDetail: token.pos_detail_1,
    });
  }
  return words;
}

function generateId() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`Usage: node parse-subs.js <japanese.srt> [english.srt] [--video <url>] [--output <file>]

Arguments:
  japanese.srt    Path to Japanese subtitle file (.srt)
  english.srt     Path to English subtitle file (.srt, optional)
  --video <url>   Base video URL or local path (optional)
  --output <file> Output JSON file (default: output.json)
  --clip-dir <d>  Directory to save ffmpeg clip commands (optional)

Examples:
  node parse-subs.js subs_jp.srt subs_en.srt --video anime.mp4 --output words.json
  node parse-subs.js subs_jp.srt --output words.json`);
    process.exit(1);
  }

  const jpFile = args[0];
  let enFile = null;
  let videoUrl = "";
  let outputFile = "output.json";
  let clipDir = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--video") videoUrl = args[++i];
    else if (args[i] === "--output") outputFile = args[++i];
    else if (args[i] === "--clip-dir") clipDir = args[++i];
    else if (!enFile && !args[i].startsWith("--")) enFile = args[i];
  }

  console.log("Loading Japanese subtitles...");
  const jpText = fs.readFileSync(jpFile, "utf-8");
  const jpSubs = parseSrt(jpText);
  console.log(`  Found ${jpSubs.length} Japanese subtitle entries`);

  let enSubs = [];
  if (enFile) {
    console.log("Loading English subtitles...");
    const enText = fs.readFileSync(enFile, "utf-8");
    enSubs = parseSrt(enText);
    console.log(`  Found ${enSubs.length} English subtitle entries`);
  }

  const matched = enFile ? matchSubtitles(jpSubs, enSubs) : jpSubs.map((s) => ({
    start: s.start,
    end: s.end,
    japanese: s.text,
    english: "",
  }));

  console.log("Loading kuromoji tokenizer...");
  const tokenizer = await new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: DICT_PATH }).build((err, t) => {
      if (err) reject(err);
      else resolve(t);
    });
  });

  console.log("Tokenizing sentences...");

  const allWords = new Map();
  const sentences = [];

  for (const entry of matched) {
    const tokens = tokenizeSentence(tokenizer, entry.japanese);

    sentences.push({
      start: entry.start,
      end: entry.end,
      japanese: entry.japanese,
      english: entry.english,
      words: tokens.map((t) => t.baseForm),
    });

    for (const token of tokens) {
      const key = token.baseForm;
      if (!allWords.has(key)) {
        allWords.set(key, {
          word: token.baseForm,
          kana: token.kana,
          romaji: token.romaji,
          occurrences: [],
        });
      }
      allWords.get(key).occurrences.push({
        sentence: entry.japanese,
        translation: entry.english,
        start: entry.start,
        end: entry.end,
      });
    }
  }

  const wordsOutput = [];
  for (const [, w] of allWords) {
    const best = w.occurrences[0];
    wordsOutput.push({
      id: generateId(),
      kanji: w.word,
      kana: w.kana,
      romaji: w.romaji,
      translation: "",
      sentence: best.sentence,
      sentenceTranslation: best.translation,
      videoStart: Math.round(best.start),
      videoEnd: Math.round(best.end),
      hint: "",
      videoUrl: videoUrl || "",
    });
  }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      jpSubFile: path.basename(jpFile),
      enSubFile: enFile ? path.basename(enFile) : null,
      totalSentences: sentences.length,
      uniqueWords: wordsOutput.length,
    },
    words: wordsOutput,
    sentences,
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nDone! Written ${wordsOutput.length} words and ${sentences.length} sentences to ${outputFile}`);

  if (clipDir && videoUrl) {
    fs.mkdirSync(clipDir, { recursive: true });
    const script = sentences
      .map(
        (s, i) =>
          `ffmpeg -ss ${s.start} -to ${s.end} -i "${videoUrl}" -c copy "${clipDir}/clip_${String(i).padStart(4, "0")}.mp4"`
      )
      .join("\n");
    const scriptFile = path.join(clipDir, "extract_clips.sh");
    fs.writeFileSync(scriptFile, script, "utf-8");
    console.log(`Clip extraction script written to ${scriptFile}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
