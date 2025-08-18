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
    if (ext !== ".wav") continue;

    const filePath = path.join(inputDir, file);
    console.log(`Processing file: ${filePath}`);

    // 1. Use ffprobe to get exact duration
    let exactDuration = 0.0;
    try {
      const durationStr = execSync(
        `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`
      )
        .toString()
        .trim();
      exactDuration = parseFloat(durationStr);
    } catch (err) {
      console.error(`Failed to probe ${file}:`, err.message);
      continue;
    }

    // 2. Extract loop points from smpl chunk if available
    const metadata = await parseFile(filePath);
    let loopStart = 0.0;
    let loopEnd = exactDuration; // default to exact duration from ffprobe

    if (metadata.native["RIFF"]) {
      const smpl = metadata.native["RIFF"].find(tag => tag.id === "smpl");
      if (smpl && smpl.value?.loops?.length > 0) {
        loopStart = smpl.value.loops[0].start / metadata.format.sampleRate;
        loopEnd = smpl.value.loops[0].end / metadata.format.sampleRate;
      }
    }

    // 3. Convert .wav → .ogg using ffmpeg
    const clipName = path.basename(file, ext);
    const oggPath = path.join(inputDir, `${clipName}.ogg`);

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

    // 4. Add to clipData
    clips[clipName] = {
      file: `${clipName}.ogg`,
      loopStart: parseFloat(loopStart.toFixed(6)), // more precision
      loopEnd: parseFloat(loopEnd.toFixed(6)),     // use ffprobe precision
      nextClip: []
    };

    console.log(
      ` → Clip added: ${clipName}.ogg (loopStart: ${loopStart.toFixed(
        6
      )}, loopEnd: ${loopEnd.toFixed(6)})`
    );
  }

  fs.writeFileSync(outputFile, JSON.stringify({ clips }, null, 2));
  console.log(`✅ Clip data written to ${outputFile}`);
}

extractDurations().catch(console.error);
