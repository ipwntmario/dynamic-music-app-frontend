import { useEffect, useState, useRef } from "react";

function App() {
  const [audioCtx, setAudioCtx] = useState(null);
  const [currentSource, setCurrentSource] = useState(null);
  const [status, setStatus] = useState("Idle");

  const [clipData, setClipData] = useState({});
  const [sectionData, setSectionData] = useState({});
  const [fadeOutEnabled, setFadeOutEnabled] = useState(true);

  const gainNodeRef = useRef(null);

  useEffect(() => {
    if (!audioCtx) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      setAudioCtx(ctx);

      const gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      gainNode.gain.setValueAtTime(1, ctx.currentTime);
      gainNodeRef.current = gainNode;
    }

    // load JSON files
    fetch("/audio/clipData.json")
      .then((res) => res.json())
      .then((data) => setClipData(data.clips || {}))
      .catch((err) => console.error("clipData.json not found:", err));

    fetch("/audio/sectionData.json")
      .then((res) => res.json())
      .then((data) => setSectionData(data.sections || {}))
      .catch((err) => console.error("sectionData.json not found:", err));
  }, [audioCtx]);

  const playSection = async (sectionName) => {
    if (!audioCtx) return;

    const section = sectionData[sectionName];
    if (!section) {
      console.error(`Section '${sectionName}' not found in sectionData.json`);
      return;
    }

    const firstClipName = section.firstClip;
    const clip = clipData[firstClipName];
    if (!clip) {
      console.error(`Clip '${firstClipName}' not found in clipData.json`);
      return;
    }

    await playClip(firstClipName, clip);
  };

  const playClip = async (clipName, clip) => {
    stopTrack(false); // stop current playback, no fade for transitions

    setStatus(`Loading ${clipName}...`);

    const response = await fetch(`/audio/${clip.file}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNodeRef.current);

    if (clip.loopEnd) {
      source.loop = true;
      source.loopStart = clip.loopStart || 0;
      source.loopEnd = clip.loopEnd;
      console.log(
        `Using loop points for ${clipName}: start=${source.loopStart}, end=${source.loopEnd}`
      );
    } else {
      source.loop = true;
      console.log(`No loop points found for ${clipName}, looping whole track.`);
    }

    source.start(0);
    setCurrentSource(source);
    setStatus(`Playing: ${clipName}`);
  };

  const stopTrack = (withFade = true) => {
    if (!currentSource || !audioCtx || !gainNodeRef.current) return;

    if (withFade && fadeOutEnabled) {
      const fadeDuration = 4.0;
      const now = audioCtx.currentTime;
      gainNodeRef.current.gain.cancelScheduledValues(now);
      gainNodeRef.current.gain.setValueAtTime(
        gainNodeRef.current.gain.value,
        now
      );
      gainNodeRef.current.gain.linearRampToValueAtTime(0, now + fadeDuration);

      currentSource.stop(now + fadeDuration);
      setTimeout(() => {
        setCurrentSource(null);
        setStatus("Stopped");
        gainNodeRef.current.gain.setValueAtTime(1, audioCtx.currentTime);
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
        {Object.keys(sectionData).map((sectionName) => (
          <button
            key={sectionName}
            onClick={() => playSection(sectionName)}
            style={{ margin: "5px", padding: "10px 20px", cursor: "pointer" }}
          >
            {sectionName}
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
