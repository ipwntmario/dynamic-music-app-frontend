import { useEffect, useState } from "react";

function App() {
  const [audioCtx, setAudioCtx] = useState(null);
  const [currentSource, setCurrentSource] = useState(null);
  const [status, setStatus] = useState("Idle");
  const [tracks, setTracks] = useState([]); // start empty, load from JSON
  const [loopData, setLoopData] = useState(null);

  // Create AudioContext only once
  useEffect(() => {
    if (!audioCtx) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      setAudioCtx(ctx);
    }
  }, [audioCtx]);

  // Load loopData.json once when the app starts
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/soundtracks/loopData.json");
        const data = await response.json();
        setLoopData(data);

        // Turn JSON into track list
        const loadedTracks = Object.keys(data).map((filename) => ({
          name: filename.replace(/\.[^/.]+$/, ""), // remove extension
          file: filename,
        }));
        setTracks(loadedTracks);
      } catch (err) {
        console.error("Failed to load loopData.json", err);
      }
    };

    loadData();
  }, []);

  const playTrack = async (track) => {
    if (!audioCtx || !loopData) return;

    // Stop any currently playing audio
    if (currentSource) {
      currentSource.stop();
    }

    setStatus(`Loading ${track.name}...`);

    // Fetch and decode audio into buffer
    const response = await fetch(`/soundtracks/${track.file}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Create a source that loops seamlessly
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;

    // Apply loop points from loopData.json
    const meta = loopData[track.file];
    if (meta) {
      source.loopStart = meta.loopStart;
      source.loopEnd = meta.loopEnd;
    }

    source.connect(audioCtx.destination);
    source.start(0);

    setCurrentSource(source);
    setStatus(`Playing: ${track.name}`);
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: "20px" }}>
      <h1>Dynamic Music Player</h1>
      <p>Status: {status}</p>

      {tracks.length === 0 ? (
        <p>Loading tracks...</p>
      ) : (
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
      )}
    </div>
  );
}

export default App;
