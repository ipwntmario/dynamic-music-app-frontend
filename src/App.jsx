import { useEffect, useState } from "react";

function App() {
  const [audioCtx, setAudioCtx] = useState(null);
  const [currentSource, setCurrentSource] = useState(null);
  const [status, setStatus] = useState("Idle");
  const [loopData, setLoopData] = useState({});

  const tracks = [
    { name: "Exploration", file: "exploration.ogg" },
    { name: "Battle", file: "battle.ogg" },
    { name: "Tense Moment", file: "tense.ogg" },
  ];

  useEffect(() => {
    // create AudioContext only once
    if (!audioCtx) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      setAudioCtx(ctx);
    }

    // fetch loopData.json once on startup
    fetch("/soundtracks/loopData.json")
      .then((res) => res.json())
      .then((data) => setLoopData(data))
      .catch((err) => console.error("No loopData.json found:", err));
  }, [audioCtx]);

  const playTrack = async (track) => {
    if (!audioCtx) return;

    // stop any currently playing audio
    if (currentSource) {
      currentSource.stop();
    }

    setStatus(`Loading ${track.name}...`);

    // fetch and decode audio into buffer
    const response = await fetch(`/soundtracks/${track.file}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // create a source that loops seamlessly
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    // check if this file has loop points in loopData.json
    const loopInfo = loopData[track.file];
    if (loopInfo && loopInfo.loopEnd) {
      source.loop = true;
      source.loopStart = loopInfo.loopStart || 0;
      source.loopEnd = loopInfo.loopEnd;
      console.log(
        `Using loop points for ${track.file}: start=${source.loopStart}, end=${source.loopEnd}`
      );
    } else {
      // fallback: loop the entire buffer
      source.loop = true;
      console.log(`No loop points found for ${track.file}, looping whole track.`);
    }

    source.start(0);

    setCurrentSource(source);
    setStatus(`Playing: ${track.name}`);
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: "20px" }}>
      <h1>Dynamic Music Player</h1>
      <p>Status: {status}</p>
      <div style={{ marginTop: "20px" }}>
        {tracks.map((track) => (
          <button
            key={track.name}
            onClick={() => playTrack(track)}
            style={{
              margin: "5px",
              padding: "10px 20px",
              cursor: "pointer",
            }}
          >
            {track.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default App;
