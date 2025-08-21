import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "./audio/audioEngine";
import { useMusicData } from "./data/useMusicData";
import TrackSelector from "./components/TrackSelector";
import Transport from "./components/Transport";
import SectionPanel from "./components/SectionPanel";
import StatusBar from "./components/StatusBar";

export default function App() {
  const { clips, sections, tracks, loading } = useMusicData();

  const [status, setStatus] = useState("Idle");
  const [selectedTrack, setSelectedTrack] = useState(null);

  const [playDisabled, setPlayDisabled] = useState(false);

  // Section state used by the UI
  const [currentSectionName, setCurrentSectionName] = useState(null);
  const [queuedSectionName, setQueuedSectionName] = useState(null);

  // Setings menu
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fadeOutSeconds, setFadeOutSeconds] = useState(6); // default 4

  // Create engine once
  const engineRef = useRef(null);
  if (!engineRef.current) {
    engineRef.current = new AudioEngine({
      onStatus: setStatus,
      onSectionChange: (name) => setCurrentSectionName(name ?? null),
      onQueueChange: (nameOrNull) => setQueuedSectionName(nameOrNull),
      onReady: () => setPlayDisabled(false),  // when engine finished resetting
    });
  }
  const engine = engineRef.current;

  // Keep engine data in sync
  useEffect(() => {
    engine.setData({ clips, sections, tracks });
  }, [engine, clips, sections, tracks]);

  // Keep engine fade setting in sync
  useEffect(() => {
    engine.setFadeOutSeconds?.(fadeOutSeconds);
  }, [engine, fadeOutSeconds]);

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

  const autoLockedTargets = useMemo(() => {
    const section = sections[currentSectionName];
    if (section?.type !== "auto") return [];
    const ns = section?.nextSection;
    return Array.isArray(ns) ? ns : (ns ? [ns] : []);
  }, [sections, currentSectionName]);


  // derive playing state
  const isPlaying = /^Playing/.test(status);

  // Handlers
  const handlePlay = () => {
    // start wherever the current section pointer is (reset puts it at first section)
    if (currentSectionName) {
      engine.playSection(currentSectionName);
    } else if (firstSection) {
      engine.playSection(firstSection);
    }
  };

  const handlePlaySection = (sectionName) => {
    setQueuedSectionName(null);
    engine.clearQueuedSection?.();
    engine.playSection(sectionName);
  };

  const handleStop = async () => {
    setPlayDisabled(true);
    await engine.stopAndReload();  // resolves after fade+reset
    setPlayDisabled(false);
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

      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <button
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
          style={{
            background: "transparent",
            border: "none",
            fontSize: 22,
            cursor: "pointer",
          }}
          title="Settings"
        >
          ⚙️
        </button>
      </div>

      {selectedTrack && (
        <Transport
          isPlaying={isPlaying}
          onPlay={handlePlay}
          onStop={handleStop}
          playLabel="Play"
          playDisabled={playDisabled}
        />
      )}

      {currentSectionName && (
        <SectionPanel
          sections={sections}
          currentSectionName={currentSectionName}
          queuedSectionName={queuedSectionName}
          autoLockedTargets={autoLockedTargets}
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

      {settingsOpen && (
        <div
          onClick={() => setSettingsOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 360, background: "#2d2d2d", borderRadius: 12, padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer" }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                Fade-out on Stop
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.1}
                  value={fadeOutSeconds}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setFadeOutSeconds(Math.max(0, Math.min(30, v)));
                  }}
                  style={{ width: 90, padding: "6px 8px" }}
                />
                <span>seconds of fade-out when Stop is pressed</span>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
                (0 = instantaneous, max 30s)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
