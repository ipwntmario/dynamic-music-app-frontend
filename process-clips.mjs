#!/usr/bin/env node
// extract-durations.mjs
// Append-only clipData updater + WAV→OGG converter.
//
// Behavior:
// - Reads ./clipData.json { "clips": { ... } } if present.
// - Scans ./audio for *.wav not starting with "_".
// - For each baseName:
//     - If clips[baseName] exists AND ./audio/<baseName>.ogg exists => SKIP
//     - If clips[baseName] exists AND .ogg missing => CONVERT ONLY (no JSON change)
//     - If clips[baseName] missing => CONVERT (if needed) + ADD entry:
//           file: "<baseName>.ogg"
//           loopPoint: duration(_<baseName>.wav) if exists, else duration(<baseName>.wav)
//           clipEnd: duration(<baseName>.wav)
// - Never deletes/overwrites existing clip keys; no loopStart on new entries.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pExecFile = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- CONFIG (adjust if your layout differs) ----
const AUDIO_DIR = path.resolve(__dirname, "./public/audio");
const CLIPDATA_PATH = path.resolve(__dirname, "./public/clipData.json");
// -----------------------------------------------

async function ensureFileJSON(filepath, fallbackValue) {
  try {
    const buf = await fs.readFile(filepath, "utf8");
    const json = JSON.parse(buf);
    return json;
  } catch (err) {
    if (err.code === "ENOENT") return fallbackValue;
    console.warn(`⚠️  Could not parse ${path.basename(filepath)}; starting fresh for safety.`);
    return fallbackValue;
  }
}

function secondsFromProbeOut(str) {
  const n = Number(String(str).trim());
  return Number.isFinite(n) ? n : 0;
}

async function ffprobeDurationSeconds(filePath) {
  // Prints only duration number
  const { stdout } = await pExecFile("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath
  ], { windowsHide: true });
  return secondsFromProbeOut(stdout);
}

async function convertWavToOgg(inputWav, outputOgg) {
  // Skip if already exists
  if (fssync.existsSync(outputOgg)) return false;
  // Simple opus conversion; tweak bitrate if you want
  await pExecFile("ffmpeg", [
    "-y",
    "-i", inputWav,
    "-c:a", "libopus",
    "-b:a", "160k",
    outputOgg
  ], { windowsHide: true });
  return true;
}

async function main() {
  // 1) Load existing clipData (append-only)
  const existing = await ensureFileJSON(CLIPDATA_PATH, { clips: {} });
  if (!existing.clips || typeof existing.clips !== "object") {
    existing.clips = {};
  }
  const clips = existing.clips;

  // 2) Enumerate main WAVs (exclude files starting with "_")
  const entries = await fs.readdir(AUDIO_DIR, { withFileTypes: true });
  const wavs = entries
    .filter(d => d.isFile() && d.name.toLowerCase().endsWith(".wav") && !d.name.startsWith("_"))
    .map(d => d.name);

  const added = [];
  const convertedOnly = [];
  const skipped = [];

  for (const wavName of wavs) {
    const base = wavName.slice(0, -4); // strip .wav
    const wavPath = path.join(AUDIO_DIR, wavName);
    const oggName = `${base}.ogg`;
    const oggPath = path.join(AUDIO_DIR, oggName);

    const helperWavName = `_${base}.wav`;
    const helperWavPath = path.join(AUDIO_DIR, helperWavName);
    const hasHelper = fssync.existsSync(helperWavPath);

    const existsInJSON = Object.prototype.hasOwnProperty.call(clips, base);
    const oggExists = fssync.existsSync(oggPath);

    // Case A: entry exists + ogg exists => skip entirely
    if (existsInJSON && oggExists) {
      skipped.push(base);
      continue;
    }

    // Ensure there is an OGG (convert if missing)
    if (!oggExists) {
      await convertWavToOgg(wavPath, oggPath);
    }

    // Case B: entry exists but ogg was missing => we converted; don't touch JSON
    if (existsInJSON) {
      convertedOnly.push(base);
      continue;
    }

    // Case C: new entry => probe durations and add
    // clipEnd: duration of main WAV
    const clipEndSec = await ffprobeDurationSeconds(wavPath);

    // loopPoint: if helper (_<name>.wav) exists, use its duration; else main duration
    let loopPointSec = clipEndSec;
    if (hasHelper) {
      loopPointSec = await ffprobeDurationSeconds(helperWavPath);
    }

    // Build new clip entry (append-only; omit loopStart)
    clips[base] = {
      file: oggName,
      loopPoint: loopPointSec,
      clipEnd: clipEndSec,
      nextClip: []
      // (nextClip, type, etc. can be edited by hand or other tools; we don't touch them)
    };

    added.push(base);
  }

  // 3) Write back clipData.json (pretty, append-only changes)
  //    We do not remove or rename any existing keys; we just added new ones.
  const pretty = JSON.stringify({ clips }, null, 2) + "\n";
  await fs.writeFile(CLIPDATA_PATH, pretty, "utf8");

  // 4) Report
  console.log(`\nDone.`);
  console.log(`  Added clips:        ${added.length ? added.join(", ") : "(none)"}`);
  console.log(`  Converted only:     ${convertedOnly.length ? convertedOnly.join(", ") : "(none)"}`);
  console.log(`  Skipped (up-to-date): ${skipped.length ? skipped.join(", ") : "(none)"}\n`);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
