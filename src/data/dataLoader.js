export async function loadAllData() {
  const [clips, sections, tracks] = await Promise.all([
    fetch("clipData.json").then((res) => res.json()).catch(() => ({ clips: {} })),
    fetch("sectionData.json").then((res) => res.json()).catch(() => ({ sections: {} })),
    fetch("trackData.json").then((res) => res.json()).catch(() => ({ tracks: {} })),
  ]);

  return {
    clips: clips.clips || {},
    sections: sections.sections || {},
    tracks: tracks.tracks || {},
  };
}
