import { useEffect, useState, useRef } from "react";

function App() {
  const [audioCtx, setAudioCtx] = useState(null);
  const [currentSource, setCurrentSource] = useState(null);
  const [status, setStatus] = useState("Idle");

  const [clipData, setClipData] = useState({});
  const [sectionData, setSectionData] = useState({});
  const [trackData, setTrackData] = useState({});
  const [selectedTrack, setSelectedTrack] = useState(null);

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

    fetch("clipData.json")
      .then((res) => res.json())
      .then((data) => setClipData(data.clips || {}))
      .catch((err) => console.error("clipData.json not found:", err));

    fetch("sectionData.json")
      .then((res) => res.json())
      .then((data) => setSectionData(data.sections || {}))
      .catch((err) => console.error("sectionData.json not found:", err));

    fetch("trackData.json")
      .then((res) => res.json())
      .then((data) => setTrackData(data.tracks || {}))
      .catch((err) => console.error("trackData.json not found:", err));
  }, [audioCtx]);

  const playSection = async (sectionName) => {
    if (!audioCtx) return;

    const section = sectionData[sectionName];
    if (!section) {
      console.error(`Section '${sectionName}' not found`);
      return;
    }

    const firstClipName = section.firstClip;
    const clip = clipData[firstClipName];
    if (!clip) {
      console.error(`Clip '${firstClipName}' not found`);
      return;
    }

    await playClip(firstClipName, clip);
  };

  const playClip = async (clipName, clip) => {
    // Stop any existing clip & clear previous timers
    if (currentSource && currentSource.loopEndEvent) {
      clearTimeout(currentSource.loopEndEvent);
    }
    stopTrack(false);

    setStatus(`Loading ${clipName}...`);

    // Load current clip
    const response = await fetch(`/audio/${clip.file}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNodeRef.current);

    // Determine if we have a next clip
    if (clip.nextClip && clip.nextClip.length > 0) {
      const nextClipName =
        clip.nextClip.length === 1
          ? clip.nextClip[0]
          : clip.nextClip[Math.floor(Math.random() * clip.nextClip.length)];
      const nextClip = clipData[nextClipName];

      if (nextClip) {
        // Preload next clip without starting it
        const nextResp = await fetch(`/audio/${nextClip.file}`);
        const nextArrayBuffer = await nextResp.arrayBuffer();
        const nextAudioBuffer = await audioCtx.decodeAudioData(nextArrayBuffer);

        // Schedule next clip at loopEnd
        const loopDuration = (clip.loopEnd || audioBuffer.duration) - (clip.loopStart || 0);
        source.loopEndEvent = setTimeout(() => {
          const nextSource = audioCtx.createBufferSource();
          nextSource.buffer = nextAudioBuffer;
          nextSource.connect(gainNodeRef.current);
          nextSource.start(0);

          setCurrentSource(nextSource);
          setStatus(`Playing: ${nextClipName}`);

          // Set up subsequent looping or nextClip scheduling
          scheduleNextClip(nextClipName, nextClip, nextSource, nextAudioBuffer);
        }, loopDuration * 1000);
      }
    } else {
      // No nextClip, loop current clip normally
      source.loop = true;
      source.loopStart = clip.loopStart || 0;
      source.loopEnd = clip.loopEnd || audioBuffer.duration;
    }

    source.start(0);
    setCurrentSource(source);
    setStatus(`Playing: ${clipName}`);
  };

  // Helper to schedule next clips in the chain
  const scheduleNextClip = (clipName, clip, sourceNode, audioBuffer) => {
    if (clip.nextClip && clip.nextClip.length > 0) {
      const nextClipName =
        clip.nextClip.length === 1
          ? clip.nextClip[0]
          : clip.nextClip[Math.floor(Math.random() * clip.nextClip.length)];
      const nextClip = clipData[nextClipName];

      if (nextClip) {
        fetch(`/audio/${nextClip.file}`)
          .then((res) => res.arrayBuffer())
          .then((arrBuf) => audioCtx.decodeAudioData(arrBuf))
          .then((nextAudioBuffer) => {
            const loopDuration = (clip.loopEnd || audioBuffer.duration) - (clip.loopStart || 0);
            sourceNode.loopEndEvent = setTimeout(() => {
              const nextSource = audioCtx.createBufferSource();
              nextSource.buffer = nextAudioBuffer;
              nextSource.connect(gainNodeRef.current);
              nextSource.start(0);
              setCurrentSource(nextSource);
              setStatus(`Playing: ${nextClipName}`);
              scheduleNextClip(nextClipName, nextClip, nextSource, nextAudioBuffer);
            }, loopDuration * 1000);
          });
      }
    }
  };

  const handleClipEnd = (clipName, clip) => {
    if (clip.nextClip && clip.nextClip.length > 0) {
      const next =
        Array.isArray(clip.nextClip) && clip.nextClip.length > 1
          ? clip.nextClip[Math.floor(Math.random() * clip.nextClip.length)]
          : clip.nextClip[0] || clip.nextClip;

      const nextClip = clipData[next];
      if (nextClip) {
        playClip(next, nextClip);
        return;
      }
    }

    // if no nextClip: stop
    setStatus("Stopped");
    setCurrentSource(null);
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
        <label>
          Select Track:{" "}
          <select
            value={selectedTrack || ""}
            onChange={(e) => setSelectedTrack(e.target.value)}
          >
            <option value="" disabled>
              -- choose a track --
            </option>
            {Object.entries(trackData).map(([trackName, track]) => (
              <option key={trackName} value={trackName}>
                {track.defaultDisplayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedTrack && (
        <div style={{ marginTop: "20px" }}>
          <button
            onClick={() =>
              playSection(trackData[selectedTrack].firstSection)
            }
            style={{ margin: "5px", padding: "10px 20px", cursor: "pointer" }}
          >
            {
              sectionData[trackData[selectedTrack].firstSection]
                ?.defaultDisplayName
            }
          </button>

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
      )}

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
