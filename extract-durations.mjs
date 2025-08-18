import fs from "fs";
import path from "path";
import { parseFile } from "music-metadata";

const inputDir = "./public/soundtracks";
const outputFile = "./clipData.json";

async function extractDurations() {
  const files = fs.readdirSync(inputDir);
  const clips = {};

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();

    // Only process .wav files for loop points
    if (ext !== ".wav") continue;

    const filePath = path.join(inputDir, file);
    console.log(`Processing file: ${filePath}`);

    const metadata = await parseFile(filePath);

    // Default loop points (if not found in metadata)
    let loopStart = 0.0;
    let loopEnd = metadata.format.duration ?? 0.0;

    // Try to extract smpl chunk loop points if available
    if (metadata.native["RIFF"]) {
      const smpl = metadata.native["RIFF"].find(tag => tag.id === "smpl");
      if (smpl && smpl.value?.loops?.length > 0) {
        loopStart = smpl.value.loops[0].start / metadata.format.sampleRate;
        loopEnd = smpl.value.loops[0].end / metadata.format.sampleRate;
      }
    }

    // Store clip data (rename .wav → .ogg for playback)
    const clipName = path.basename(file, ext);
    clips[clipName] = {
      file: clipName + ".ogg",
      loopStart: parseFloat(loopStart.toFixed(3)),
      loopEnd: parseFloat(loopEnd.toFixed(3)),
      next: [] // GM can edit later
    };

    console.log(` → Clip added: ${clipName}.ogg (loopStart: ${loopStart.toFixed(3)}, loopEnd: ${loopEnd.toFixed(3)})`);
  }

  fs.writeFileSync(outputFile, JSON.stringify({ clips }, null, 2));
  console.log(`✅ Clip data written to ${outputFile}`);
}

extractDurations().catch(console.error);
