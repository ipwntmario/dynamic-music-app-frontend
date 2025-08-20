import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "./audio/AudioEngine";
import { useMusicData } from "./data/useMusicData";
import TrackSelector from "./components/TrackSelector";
import Transport from "./components/Transport";
import SectionPanel from "./components/SectionPanel";
import StatusBar from "./components/StatusBar";

export default function App() {
  const { clips, sections, tracks, loading } = useMusicData();

  const [status, setStatus] = useState("Idle");
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [fadeOutEnabled, setFadeOutEnabled] = useState(true);

  // Section state used by the UI
  const [currentSectionName, setCurrentSectionName] = useState(null);
  const [queuedSectionName, setQueuedSectionName] = useState(null);

  // Create engine once
  const engineRef = useRef(null);
  if (!engineRef.current) {
    engineRef.current = new AudioEngine({
      onStatus: setStatus,
      onSectionChange: (name) => setCurrentSectionName(name ?? null),
    });
  }
  const engine = engineRef.current;

  // Keep engine data in sync
  useEffect(() => {
    engine.setData({ clips, sections, tracks });
  }, [engine, clips, sections, tracks]);

  // Keep engine fade setting in sync
  useEffect(() => {
    engine.setFadeOutEnabled(fadeOutEnabled);
  }, [engine, fadeOutEnabled]);

  // When a track is selected, point UI at its first section
  useEffect(() => {
    if (!selectedTrack) {
      setCurrentSectionName(null);
      setQueuedSectionName(null);
      return;
    }
    const first = tracks[selectedTrack]?.firstSection || null;
    setCurrentSectionName(first);
    setQueuedSectionName(null);
  }, [selectedTrack, tracks]);

  // Derived: firstSection of the selected track (for Transport button label)
  const firstSection = useMemo(() => {
    if (!selectedTrack) return null;
    const track = tracks[selectedTrack];
    return track ? track.firstSection : null;
  }, [selectedTrack, tracks]);

  // Handlers
  const handlePlaySection = (sectionName) => {
    setQueuedSectionName(null);
    engine.clearQueuedSection?.();
    engine.playSection(sectionName);
  };

  const handleStop = () => {
    engine.stopTrack(true);
  };

  const handleSelectTrack = async (name) => {
    setSelectedTrack(name);
    await engine.preloadTrack(name);
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: 20 }}>
      <h1>Wizamp</h1>
      <StatusBar text={loading ? "Loading data…" : status} />

      <div style={{ marginTop: 20 }}>
        <TrackSelector
          tracks={tracks}
          value={selectedTrack}
          onChange={handleSelectTrack}
        />
      </div>

      {selectedTrack && firstSection && (
        <Transport
          firstSectionName={firstSection}
          firstSectionLabel={sections[firstSection]?.defaultDisplayName}
          onPlaySection={handlePlaySection}
          onStop={handleStop}
        />
      )}

      {currentSectionName && (
        <SectionPanel
          sections={sections}
          currentSectionName={currentSectionName}
          queuedSectionName={queuedSectionName}
          onToggleQueuedSection={(nameOrNull) => {
            setQueuedSectionName(nameOrNull);
            if (nameOrNull) {
              engine.queueSectionTransition(nameOrNull);
              console.log("Queued section:", nameOrNull);
            }
            else engine.clearQueuedSection();
          }}
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
