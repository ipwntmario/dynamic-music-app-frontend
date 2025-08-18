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

    // 1. Extract loop points
    const metadata = await parseFile(filePath);
    let loopStart = 0.0;
    let loopEnd = metadata.format.duration ?? 0.0;

    if (metadata.native["RIFF"]) {
      const smpl = metadata.native["RIFF"].find(tag => tag.id === "smpl");
      if (smpl && smpl.value?.loops?.length > 0) {
        loopStart = smpl.value.loops[0].start / metadata.format.sampleRate;
        loopEnd = smpl.value.loops[0].end / metadata.format.sampleRate;
      }
    }

    // 2. Convert .wav → .ogg using ffmpeg
    const clipName = path.basename(file, ext);
    const oggPath = path.join(inputDir, `${clipName}.ogg`);

    try {
      execSync(
        `ffmpeg -y -i "${filePath}" -c:a libvorbis -qscale:a 6 -avoid_negative_ts make_zero "${oggPath}"`,
        { stdio: "ignore" }
      );
      console.log(` → Converted to OGG: ${oggPath}`);
    } catch (err) {
      console.error(`Failed to convert ${filePath} to OGG:`, err);
      continue;
    }

    // 3. Add to clipData
    clips[clipName] = {
      file: `${clipName}.ogg`,
      loopStart: parseFloat(loopStart.toFixed(3)),
      loopEnd: parseFloat(loopEnd.toFixed(3)),
      nextClip: [] // GM can edit later
    };

    console.log(
      ` → Clip added: ${clipName}.ogg (loopStart: ${loopStart.toFixed(
        3
      )}, loopEnd: ${loopEnd.toFixed(3)})`
    );
  }

  fs.writeFileSync(outputFile, JSON.stringify({ clips }, null, 2));
  console.log(`✅ Clip data written to ${outputFile}`);
}

extractDurations().catch(console.error);
