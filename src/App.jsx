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

  // Section state used by the UI
  const [currentSectionName, setCurrentSectionName] = useState(null);
  const [queuedSectionName, setQueuedSectionName] = useState(null);

  // Setings menu
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fadeOutSeconds, setFadeOutSeconds] = useState(6); // default 4

  const [playDisabled, setPlayDisabled] = useState(false);

  const [statusOpen, setStatusOpen] = useState(true);   // collapsible status
  const [clipProgress, setClipProgress] = useState(0);  // 0..1 visual bar

  // Volume settings
  const [trackVolUIOpen, setTrackVolUIOpen] = useState(false);
  const [trackVolume, setTrackVolume] = useState(1); // 0..1
  const [userVolume, setUserVolume] = useState(1);   // 0..1 (local)


  // Create engine once
  const engineRef = useRef(null);
  if (!engineRef.current) {
    engineRef.current = new AudioEngine({
      onStatus: setStatus,
      onSectionChange: (name) => setCurrentSectionName(name ?? null),
      onQueueChange: (nameOrNull) => setQueuedSectionName(nameOrNull),
      onReady: () => { setPlayDisabled(false); setClipProgress(0); },  // when engine finished resetting
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

    // RAF loop for clip progress
    useEffect(() => {
      let raf = 0;
      const tick = () => {
        const info = engine.getPlaybackInfo?.();
        setClipProgress(info?.progress01 ?? 0);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [engine]);


  // derive playing state
  const isPlaying = /^Playing/.test(status);

  // derive if not "simple" track
  const isComplexTrack = tracks[selectedTrack]?.simple === false;

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
    setClipProgress(0);            // <- snap progress bar to 0 after stop completes
  };

  const loadSavedTrackVolume = (name) => {
    try {
      const k = `wizamp:trackVolume:${name}`;
      const v = localStorage.getItem(k);
      const num = v == null ? 1 : Math.max(0, Math.min(1, Number(v)));
      return Number.isFinite(num) ? num : 1;
    } catch { return 1; }
  };

  const saveTrackVolume = (name, vol) => {
    try {
      const k = `wizamp:trackVolume:${name}`;
      localStorage.setItem(k, String(vol));
    } catch {}
  };

  const handleSelectTrack = async (name) => {
    setSelectedTrack(name);
    const savedVol = loadSavedTrackVolume(name);
    setTrackVolume(savedVol);
    await engine.preloadTrack(name, { trackVolume: savedVol });
  };

  useEffect(() => { engine.setUserVolume?.(userVolume); }, [engine, userVolume]);
  useEffect(() => {
    // whenever trackVolume changes for the selected track, apply + persist
    if (!selectedTrack) return;
    engine.setTrackVolume?.(trackVolume);
    saveTrackVolume(selectedTrack, trackVolume);
  }, [engine, selectedTrack, trackVolume]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 20 }}>

      {/* Settings Icon */}
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

      {/* Title */}
      <h1 style={{ marginTop: 0, marginBottom: 16 }}>Wizamp</h1>

      {/* Track Controls */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Track:</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <TrackSelector
            tracks={tracks}
            value={selectedTrack}
            onChange={handleSelectTrack}
          />

          {/* 🔊 Track volume toggle */}
          {selectedTrack && (
            <div style={{ position: "relative" }}>
              <button
                aria-label="Track volume"
                onClick={() => setTrackVolUIOpen(o => !o)}
                style={{ background: "transparent", border: "1px solid #555", color: "white", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
                title="Track volume (shared)"
              >
                🔊
              </button>

              {trackVolUIOpen && (
                <div
                  style={{
                    position: "absolute", top: "110%", left: 0,
                    background: "#2a2a2a", color: "white", border: "1px solid #555", borderRadius: 8,
                    padding: 10, minWidth: 220, zIndex: 2
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>Track volume (shared)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 22, textAlign: "right" }}>0</span>
                    <input
                      type="range" min={0} max={1} step={0.01}
                      value={trackVolume}
                      onChange={(e) => setTrackVolume(Number(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <span style={{ width: 22, textAlign: "left" }}>1</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTrack && (
            <Transport
              isPlaying={isPlaying}
              onPlay={handlePlay}
              onStop={handleStop}
              playLabel="Play"
              playDisabled={playDisabled}
              stopStyle={isComplexTrack ? { background: "#400000" } : undefined}
            />
          )}
        </div>
      </section>


      {/* Section Controls */}
      {currentSectionName && (
        <section style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            {sections[currentSectionName]?.defaultDisplayName ?? currentSectionName}
          </div>
          <SectionPanel
            sections={sections}
            currentSectionName={currentSectionName}
            queuedSectionName={queuedSectionName}
            autoLockedTargets={autoLockedTargets}
            onToggleQueuedSection={(nameOrNull) => {
              setQueuedSectionName(nameOrNull);
              if (nameOrNull) engine.queueSectionTransition(nameOrNull);
              else engine.clearQueuedSection();
            }}
            largeButtons
          />
      </section>
      )}

      {/* Clip Information (progress bar from 0 to loopPoint) */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ height: 10, background: "#444", borderRadius: 6, overflow: "hidden" }} aria-label="Clip position">
          <div style={{ width: `${Math.round(clipProgress * 100)}%`, height: "100%", background: "#0aa", transition: "width 80ms linear" }} />
        </div>
      </section>

      {/* Status (collapsible) */}
      <section>
        <button
          onClick={() => setStatusOpen(s => !s)}
          style={{ background: "transparent", color: "white", border: "1px solid #555", borderRadius: 6, padding: "4px 10px", cursor: "pointer", marginBottom: 8 }}
        >
          {statusOpen ? "−" : "+"} Status
        </button>
        {statusOpen && (
          <div>
            <StatusBar text={loading ? "Loading data…" : status} />
          </div>
        )}
      </section>

      {/* Settings modal */}
      {settingsOpen && (
        <div
          onClick={() => setSettingsOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 360, background: "#2d2d2d", color: "white", borderRadius: 12, padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Settings</h2>
              <button onClick={() => setSettingsOpen(false)} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "white" }} aria-label="Close">✕</button>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                Fade-out on Stop
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number" min={0} max={30} step={0.1}
                  value={fadeOutSeconds}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      const clamped = Math.max(0, Math.min(30, v));
                      setFadeOutSeconds(clamped);
                    }
                  }}
                  style={{ width: 90, padding: "6px 8px" }}
                />
                <span>seconds of fade-out when Stop is pressed</span>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#bbb" }}>(0 = instantaneous, max 30s)</div>
            </div>
          </div>
        </div>
      )}

      {/* Per-user volume (local) */}
        <div style={{ position: "fixed", right: 20, bottom: 20, background: "#2a2a2a", color: "white",
                      border: "1px solid #555", borderRadius: 10, padding: "8px 12px", zIndex: 1 }}>
          <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4, textAlign: "center" }}>
            Your volume
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 22, textAlign: "right" }}>0</span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={userVolume}
              onChange={(e) => setUserVolume(Number(e.target.value))}
              style={{ width: 180 }}
              title="This affects only your device"
            />
            <span style={{ width: 22, textAlign: "left" }}>1</span>
          </div>
        </div>
    </div>
  );
}