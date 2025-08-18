import fs from "fs";
import path from "path";

const clipDataFile = "./clipData.json";
const outputFile = "./public/sectionData.json";

function generateSections() {
  if (!fs.existsSync(clipDataFile)) {
    console.error(`Clip data file not found at ${clipDataFile}`);
    return;
  }

  const clipData = JSON.parse(fs.readFileSync(clipDataFile));
  const clips = Object.keys(clipData.clips);

  const sections = {};

  // By default, create one section per clip
  clips.forEach((clipName) => {
    sections[clipName] = {
      firstClip: clipName,
      nextSection: [],
      autoTransition: false
    };
  });

  fs.writeFileSync(outputFile, JSON.stringify({ sections }, null, 2));
  console.log(`✅ Section data written to ${outputFile}`);
  console.log(`Sections created for clips: ${clips.join(", ")}`);
}

generateSections();
