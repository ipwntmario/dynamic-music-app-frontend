const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const folder = __dirname; // current folder
const outputFile = path.join(folder, "loopData.json");

const result = {};

fs.readdirSync(folder).forEach((file) => {
  const ext = path.extname(file).toLowerCase();

  // Only process .wav files
  if (ext === ".wav") {
    try {
      // Run ffprobe to extract loop metadata
      const metadata = execSync(
        `ffprobe -v error -show_entries stream_tags=LOOPSTART,LOOPEND -of default=noprint_wrappers=1:nokey=0 "${file}"`,
        { encoding: "utf8" }
      );

      let loopStart = 0;
      let loopEnd = null;

      metadata.split("\n").forEach((line) => {
        if (line.startsWith("TAG:LOOPSTART=")) {
          loopStart = parseInt(line.split("=")[1]);
        }
        if (line.startsWith("TAG:LOOPEND=")) {
          loopEnd = parseInt(line.split("=")[1]);
        }
      });

      // Convert samples → seconds (assume 44100 Hz)
      const sampleRate = 44100;
      loopStart = loopStart / sampleRate;
      if (loopEnd) loopEnd = loopEnd / sampleRate;

      // Store in JSON, but replace .wav → .ogg
      const oggName = file.replace(/\.wav$/i, ".ogg");

      result[oggName] = {
        loopStart,
        loopEnd,
      };

      console.log(`Processed ${file} → ${oggName}`);
    } catch (err) {
      console.error(`Failed to process ${file}:`, err.message);
    }
  }
});

// Write JSON file
fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
console.log(`Loop data saved to ${outputFile}`);
