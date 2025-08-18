const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Directory containing your audio files
const audioDir = path.join(__dirname, "public/soundtracks");

// Output file
const outputFile = path.join(__dirname, "loopData.json");

// Supported formats
const supported = [".wav", ".ogg", ".mp3"];

const result = {};

fs.readdirSync(audioDir).forEach(file => {
  const ext = path.extname(file).toLowerCase();
  if (!supported.includes(ext)) return;

  const filePath = path.join(audioDir, file);

  try {
    // Run ffprobe to get duration in seconds
    const duration = execSync(
      `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`
    )
      .toString()
      .trim();

    result[file] = {
      loopStart: 0.0,
      loopEnd: parseFloat(duration)
    };
  } catch (err) {
    console.error(`Failed to probe ${file}:`, err.message);
  }
});

// Write to JSON
fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
console.log("Loop data written to", outputFile);
