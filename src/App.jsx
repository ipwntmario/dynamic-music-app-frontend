import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "./audio/audioEngine";
import { useMusicData } from "./data/useMusicData";
import TrackSelector from "./components/TrackSelector";
import Transport from "./components/Transport";
import StatusBar from "./components/StatusBar";
import SectionPanel from "./components/SectionPanel";

export default function App() {
  const { clips, sections, tracks, loading } = useMusicData();

  const [status, setStatus] = useState("Idle");
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [fadeOutEnabled, setFadeOutEnabled] = useState(true);
  const [currentSectionName, setCurrentSectionName] = useState(null);
  const [queuedSectionName, setQueuedSectionName] = useState(null);

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

  // when a track is selected, set current section to its firstSection
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

  // Autoplay policy tip: only create/ resume AudioContext on first user gesture
  // You can do this via a "Enable Audio" button if you hit browser restrictions.

  const firstSection = useMemo(() => {
    if (!selectedTrack) return null;
    const track = tracks[selectedTrack];
    return track ? track.firstSection : null;
  }, [tracks, selectedTrack]);

  // when user taps Play (existing Transport), also update currentSection for UI
  // (Stage 1: this is just for display; engine transition hookup comes in Stage 2)
  const handlePlaySection = (sectionName) => {
    setCurrentSectionName(sectionName);
    engine.playSection(sectionName);
    setQueuedSectionName(null);
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: 20 }}>
      <h1>Wizamp</h1>
      <StatusBar text={loading ? "Loading data…" : status} />

      {/* track selector unchanged */}
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

      {/* transport unchanged, but call our wrapper */}
      {selectedTrack && firstSection && (
        <Transport
          firstSectionName={firstSection}
          firstSectionLabel={sections[firstSection]?.defaultDisplayName}
          onPlaySection={handlePlaySection}
          onStop={() => engine.stopTrack(true)}
        />
      )}

      {/* NEW: section panel shows options branching from the *current* section */}
      {currentSectionName && (
        <SectionPanel
          sections={sections}
          currentSectionName={currentSectionName}
          queuedSectionName={queuedSectionName}
          onToggleQueuedSection={(nameOrNull) => {
            setQueuedSectionName(nameOrNull);
            // Stage 1: UI only. (We’ll call engine in Stage 2.)
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
