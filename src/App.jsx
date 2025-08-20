import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "./audio/AudioEngine";
import { useMusicData } from "./data/useMusicData";
import TrackSelector from "./components/TrackSelector";
import Transport from "./components/Transport";
import StatusBar from "./components/StatusBar";

export default function App() {
  const { clips, sections, tracks, loading } = useMusicData();

  const [status, setStatus] = useState("Idle");
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [fadeOutEnabled, setFadeOutEnabled] = useState(true);

  const engineRef = useRef(null);
  if (!engineRef.current) {
    engineRef.current = new AudioEngine({ onStatus: setStatus });
  }
  const engine = engineRef.current;

  // keep engine data & settings current
  useEffect(() => {
    engine.setData({ clips, sections, tracks });
  }, [engine, clips, sections, tracks]);

  useEffect(() => {
    engine.setFadeOutEnabled(fadeOutEnabled);
  }, [engine, fadeOutEnabled]);

  // Autoplay policy tip: only create/ resume AudioContext on first user gesture
  // You can do this via a "Enable Audio" button if you hit browser restrictions.

  const firstSection = useMemo(() => {
    if (!selectedTrack) return null;
    const track = tracks[selectedTrack];
    return track ? track.firstSection : null;
  }, [tracks, selectedTrack]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 20 }}>
      <h1>Wizamp</h1>

      <StatusBar text={loading ? "Loading data…" : status} />

      <div style={{ marginTop: 20 }}>
        <TrackSelector
          tracks={tracks}
          value={selectedTrack}
          onChange={async (name) => {
            setSelectedTrack(name);
            await engine.preloadTrack(name);
          }}
        />
      </div>

      {selectedTrack && firstSection && (
        <Transport
          firstSectionName={firstSection}
          firstSectionLabel={sections[firstSection]?.defaultDisplayName}
          onPlaySection={(sectionName) => engine.playSection(sectionName)}
          onStop={() => engine.stopTrack(true)}
        />
      )}

      <div style={{ marginTop: 20 }}>
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
