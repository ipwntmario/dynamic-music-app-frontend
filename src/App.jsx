import { useEffect, useState, useRef } from "react";

function App() {
  const [audioCtx, setAudioCtx] = useState(null);
  const [status, setStatus] = useState("Idle");

  const [clipData, setClipData] = useState({});
  const [sectionData, setSectionData] = useState({});
  const [trackData, setTrackData] = useState({});
  const [selectedTrack, setSelectedTrack] = useState(null);

  const [fadeOutEnabled, setFadeOutEnabled] = useState(true);

  const masterGainRef = useRef(null);
  const activeClipsRef = useRef({}); // { clipName: { source, gainNode, buffer } }
  const scheduledEventsRef = useRef([]);

  useEffect(() => {
    if (!audioCtx) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      setAudioCtx(ctx);

      const gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      gainNode.gain.setValueAtTime(1, ctx.currentTime);
      masterGainRef.current = gainNode;
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

  const clearScheduledEvents = () => {
    scheduledEventsRef.current.forEach((id) => clearTimeout(id));
    scheduledEventsRef.current = [];
  };

  const stopTrack = (withFade = true) => {
    if (!audioCtx) return;

    clearScheduledEvents();

    Object.values(activeClipsRef.current).forEach(({ source, gainNode }) => {
      if (withFade && fadeOutEnabled) {
        const fadeDuration = 8.0;
        const now = audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + fadeDuration);

        setTimeout(() => {
          try {
            source.stop();
          } catch {}
        }, fadeDuration * 1000 + 50);
      } else {
        try {
          source.stop();
        } catch {}
      }
    });

    activeClipsRef.current = {};
    setStatus("Stopped");
  };

  const preloadTrack = async (trackName) => {
    stopTrack(false);

    const track = trackData[trackName];
    if (!track || !track.allClips) return;

    activeClipsRef.current = {};

    for (const clipName of track.allClips) {
      const clip = clipData[clipName];
      if (!clip) continue;

      const response = await fetch(`/audio/${clip.file}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await audioCtx.decodeAudioData(arrayBuffer);

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);

      source.connect(gainNode).connect(masterGainRef.current);
      source.start(0);

      activeClipsRef.current[clipName] = { source, gainNode, buffer };
    }

    setStatus(`Track '${trackName}' preloaded`);
  };

  const playSection = async (sectionName) => {
    const section = sectionData[sectionName];
    if (!section) {
      console.error(`Section '${sectionName}' not found`);
      return;
    }
    const firstClipName = section.firstClip;
    playClip(firstClipName);
  };

  const playClip = (clipName) => {
    const clip = clipData[clipName];
    const entry = activeClipsRef.current[clipName];
    if (!clip || !entry) {
      console.error(`Clip '${clipName}' not found or not loaded`);
      return;
    }

    const { buffer } = entry;
    const now = audioCtx.currentTime;

    // if there's already a source playing for this clip, stop it
    if (entry.source) {
      try {
        entry.source.stop();
      } catch {}
    }

    // make a new BufferSource each time we "play" a clip
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    // Determine loop endpoint
    const loopEndPoint = (!clip.nextClip || clip.nextClip.length === 0)
      ? clip.loopPoint ?? buffer.duration  // loop to loopPoint if no nextClip
      : clip.clipEnd ?? buffer.duration;   // play full file if transitioning out

    // Only loop if no nextClip
    source.loop = !clip.nextClip || clip.nextClip.length === 0;
    source.loopStart = clip.loopStart || 0;
    source.loopEnd = loopEndPoint;

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, now);

    source.connect(gainNode).connect(masterGainRef.current);
    source.start(0, clip.loopStart || 0);

    // update ref
    activeClipsRef.current[clipName] = { source, gainNode, buffer };

    // fade in
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(1.0, now + 0.2);

    setStatus(`Playing: ${clipName}`);

    // schedule transition if clip has nextClip
    if (clip.nextClip && clip.nextClip.length > 0) {
      const timeUntilLoopPoint = (clip.loopPoint ?? buffer.duration) - (clip.loopStart || 0);

      const timeoutId = setTimeout(() => {
        // pick next clip
        const next = Array.isArray(clip.nextClip) && clip.nextClip.length > 1
          ? clip.nextClip[Math.floor(Math.random() * clip.nextClip.length)]
          : clip.nextClip[0];

        if (clipData[next] && activeClipsRef.current[next]) {
          playClip(next);
        }

        // immediately set volume to 0 at clipEnd
        const clipEndTime = clip.clipEnd ?? buffer.duration;
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime + (clipEndTime - (clip.loopPoint ?? buffer.duration)));
      }, timeUntilLoopPoint * 1000);

      scheduledEventsRef.current.push(timeoutId);
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: "20px" }}>
      <h1>Wizamp</h1>
      <p>Status: {status}</p>

      <div style={{ marginTop: "20px" }}>
        <label>
          Select Track:{" "}
          <select
            value={selectedTrack || ""}
            onChange={async (e) => {
              const newTrack = e.target.value;
              setSelectedTrack(newTrack);
              await preloadTrack(newTrack);
            }}
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
