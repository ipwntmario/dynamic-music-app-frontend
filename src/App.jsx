import { useEffect, useState, useRef } from "react";

function App() {
  const [audioCtx, setAudioCtx] = useState(null);
  const [currentSource, setCurrentSource] = useState(null);
  const [status, setStatus] = useState("Idle");
  const [loopData, setLoopData] = useState({});
  const [fadeOutEnabled, setFadeOutEnabled] = useState(true);

  // keep gainNode in a ref so it persists
  const gainNodeRef = useRef(null);

  const tracks = [
    { name: "Exploration", file: "exploration.ogg" },
    { name: "Battle", file: "battle.ogg" },
    { name: "Tense Moment", file: "tense.ogg" },
  ];

  useEffect(() => {
    if (!audioCtx) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      setAudioCtx(ctx);

      // Create a gainNode for volume control
      const gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      gainNode.gain.setValueAtTime(1, ctx.currentTime);
      gainNodeRef.current = gainNode;
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
    stopTrack(false); // false = don't fade when switching tracks

    setStatus(`Loading ${track.name}...`);

    // fetch and decode audio
    const response = await fetch(`/soundtracks/${track.file}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // create a source that loops seamlessly
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNodeRef.current);

    // check if this file has loop points
    const loopInfo = loopData[track.file];
    if (loopInfo && loopInfo.loopEnd) {
      source.loop = true;
      source.loopStart = loopInfo.loopStart || 0;
      source.loopEnd = loopInfo.loopEnd;
      console.log(
        `Using loop points for ${track.file}: start=${source.loopStart}, end=${source.loopEnd}`
      );
    } else {
      source.loop = true; // fallback
      console.log(`No loop points found for ${track.file}, looping whole track.`);
    }

    source.start(0);
    setCurrentSource(source);
    setStatus(`Playing: ${track.name}`);
  };

  const stopTrack = (withFade = true) => {
    if (!currentSource || !audioCtx || !gainNodeRef.current) return;

    if (withFade && fadeOutEnabled) {
      const fadeDuration = 4.0; // seconds (can later be user-configurable)
      const now = audioCtx.currentTime;
      gainNodeRef.current.gain.cancelScheduledValues(now);
      gainNodeRef.current.gain.setValueAtTime(
        gainNodeRef.current.gain.value,
        now
      );
      gainNodeRef.current.gain.linearRampToValueAtTime(0, now + fadeDuration);

      // stop source after fade
      currentSource.stop(now + fadeDuration);
      setTimeout(() => {
        setCurrentSource(null);
        setStatus("Stopped");
        gainNodeRef.current.gain.setValueAtTime(1, audioCtx.currentTime); // reset
      }, fadeDuration * 1000 + 100);
    } else {
      currentSource.stop();
      setCurrentSource(null);
      setStatus("Stopped");
    }
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

        <button
          onClick={() => stopTrack(true)}
          style={{
            margin: "5px",
            padding: "10px 20px",
            background: "tomato",
            color: "white",
            cursor: "pointer",
          }}
        >
          Stop
        </button>
      </div>

      <div style={{ marginTop: "20px" }}>
        <label>
          <input
            type="checkbox"
            checked={fadeOutEnabled}
            onChange={(e) => setFadeOutEnabled(e.target.checked)}
          />{" "}
          Fade out on stop
        </label>
      </div>
    </div>
  );
}

export default App;
