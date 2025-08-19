import fs from "fs";
import path from "path";
import { parseFile } from "music-metadata";
import { execSync } from "child_process";

const inputDir = "./public/audio";
const outputFile = "./public/clipData.json";

async function extractDurations() {
  const files = fs.readdirSync(inputDir);
  const clips = {};

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const baseName = path.basename(file, ext);

    // Skip non-wavs
    if (ext !== ".wav") continue;

    // Skip files that start with "_" (used only for loop reference)
    if (baseName.startsWith("_")) {
      console.log(`Skipping helper file: ${file}`);
      continue;
    }

    const filePath = path.join(inputDir, file);
    console.log(`Processing file: ${filePath}`);

    // 1. Check for matching "_" prefixed file (for loop reference)
    const refFile = `_${baseName}${ext}`;
    const refPath = path.join(inputDir, refFile);
    const loopSourcePath = fs.existsSync(refPath) ? refPath : filePath;
    if (loopSourcePath === refPath) {
      console.log(` → Using loop reference file: ${refFile}`);
    }

    // 2. Use ffprobe to get exact duration
    let exactDuration = 0.0;
    try {
      const durationStr = execSync(
        `ffprobe -i "${loopSourcePath}" -show_entries format=duration -v quiet -of csv="p=0"`
      )
        .toString()
        .trim();
      exactDuration = parseFloat(durationStr);
    } catch (err) {
      console.error(`Failed to probe ${loopSourcePath}:`, err.message);
      continue;
    }

    // 3. Extract loop points from smpl chunk if available
    const metadata = await parseFile(loopSourcePath);
    let loopStart = 0.0;
    let loopEnd = exactDuration; // default to exact duration

    if (metadata.native["RIFF"]) {
      const smpl = metadata.native["RIFF"].find(tag => tag.id === "smpl");
      if (smpl && smpl.value?.loops?.length > 0) {
        loopStart = smpl.value.loops[0].start / metadata.format.sampleRate;
        loopEnd = smpl.value.loops[0].end / metadata.format.sampleRate;
      }
    }

    // 4. Convert .wav → .ogg using ffmpeg
    const oggPath = path.join(inputDir, `${baseName}.ogg`);
    try {
      execSync(
        `ffmpeg -y -i "${filePath}" -c:a libvorbis -qscale:a 5 -avoid_negative_ts make_zero "${oggPath}"`,
        { stdio: "ignore" }
      );
      console.log(` → Converted to OGG: ${oggPath}`);
    } catch (err) {
      console.error(`Failed to convert ${filePath} to OGG:`, err);
      continue;
    }

    // 5. Add to clipData
    clips[baseName] = {
      file: `${baseName}.ogg`,
      loopStart: parseFloat(loopStart.toFixed(6)), // high precision
      loopEnd: parseFloat(loopEnd.toFixed(6)),
      nextClip: []
    };

    console.log(
      ` → Clip added: ${baseName}.ogg (loopStart: ${loopStart.toFixed(
        6
      )}, loopEnd: ${loopEnd.toFixed(6)})`
    );
  }

  fs.writeFileSync(outputFile, JSON.stringify({ clips }, null, 2));
  console.log(`✅ Clip data written to ${outputFile}`);
}

extractDurations().catch(console.error);
