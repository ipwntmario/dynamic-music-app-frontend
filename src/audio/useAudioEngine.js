import { useState, useEffect } from "react";
import { initAudio, preloadTrack, playSection, stopTrack } from "./audioEngine";
import { loadAllData } from "../data/dataLoader";

export function useAudioEngine() {
  const [audioCtx, setAudioCtx] = useState(null);
  const [status, setStatus] = useState("Idle");
  const [clipData, setClipData] = useState({});
  const [sectionData, setSectionData] = useState({});
  const [trackData, setTrackData] = useState({});
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [currentSection, setCurrentSection] = useState(null);
  const [queuedSection, setQueuedSection] = useState(null);
  const [fadeOutEnabled, setFadeOutEnabled] = useState(true);

  useEffect(() => {
    const ctx = initAudio();
    setAudioCtx(ctx);

    loadAllData().then(({ clips, sections, tracks }) => {
      setClipData(clips);
      setSectionData(sections);
      setTrackData(tracks);
    });
  }, []);

  return {
    audioCtx,
    status, setStatus,
    clipData, sectionData, trackData,
    selectedTrack, setSelectedTrack,
    currentSection, setCurrentSection,
    queuedSection, setQueuedSection,
    fadeOutEnabled, setFadeOutEnabled,
    preloadTrack, playSection, stopTrack,
  };
}
