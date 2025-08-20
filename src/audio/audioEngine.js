let audioCtx;
let masterGain;
let activeClips = {};
let scheduledEvents = [];

/**
 * Initialize audio context and master gain.
 */
export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

/**
 * Preload all clips in a track into AudioBuffers.
 */
export async function preloadTrack(track, clipData) {
  if (!audioCtx) initAudio();
  const clipNames = track?.clips || [];

  for (const clipName of clipNames) {
    const clip = clipData[clipName];
    if (clip && !clip.buffer) {
      const res = await fetch(clip.filePath);
      const arrayBuffer = await res.arrayBuffer();
      clip.buffer = await audioCtx.decodeAudioData(arrayBuffer);
    }
  }
}

/**
 * Play a single clip.
 */
export function playClip(
  clipName,
  clipData,
  sectionData,
  queuedSection,
  setCurrentSection,
  setQueuedSection,
  setStatus
) {
  const clip = clipData[clipName];
  if (!clip || !clip.buffer) return;

  const source = audioCtx.createBufferSource();
  source.buffer = clip.buffer;

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 1;
  source.connect(gainNode).connect(masterGain);

  const startTime = audioCtx.currentTime;
  const clipStart = clip.clipStart || 0;
  const clipEnd = clip.clipEnd || clip.buffer.duration;
  const loopStart = clip.loopStart ?? clipStart;
  const loopEnd = clip.loopEnd ?? clipEnd;
  const loopPoint = clip.loopPoint ?? loopStart;

  source.loop = true;
  source.loopStart = loopStart;
  source.loopEnd = loopEnd;

  source.start(startTime, clipStart);

  activeClips[clipName] = {
    source,
    gainNode,
    startTime,
    clipStart,
    clipEnd,
    loopPoint,
  };

  const duration = clipEnd - clipStart;

  const scheduleEvent = (when, cb) => {
    const id = setTimeout(cb, when * 1000);
    scheduledEvents.push(id);
  };

  // Schedule transition at loopPoint
  scheduleEvent(loopPoint, () => {
    const nextSection = queuedSection;
    if (nextSection && sectionData[nextSection]) {
      setQueuedSection(null);
      playSection(nextSection, sectionData, clipData, setCurrentSection, setQueuedSection, setStatus);
    }
  });

  // Schedule stop at clipEnd
  scheduleEvent(duration, () => {
    source.stop();
    delete activeClips[clipName];
  });

  setCurrentSection(clip.section);
  setStatus(`Playing section: ${clip.section}, clip: ${clipName}`);
}

/**
 * Play a section (picks first clip of the section).
 */
export function playSection(
  sectionName,
  sectionData,
  clipData,
  setCurrentSection,
  setQueuedSection,
  setStatus
) {
  const section = sectionData[sectionName];
  if (!section || !section.clips?.length) return;

  const clipName = section.clips[0];
  playClip(clipName, clipData, sectionData, null, setCurrentSection, setQueuedSection, setStatus);
}

/**
 * Stop everything, optionally with fade-out.
 */
export function stopTrack(withFade = true, fadeOutEnabled = true) {
  if (withFade && fadeOutEnabled) {
    const fadeTime = 2;
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + fadeTime);

    setTimeout(() => {
      Object.values(activeClips).forEach(({ source }) => source.stop());
      activeClips = {};
      scheduledEvents.forEach((id) => clearTimeout(id));
      scheduledEvents = [];
      masterGain.gain.setValueAtTime(1, audioCtx.currentTime);
    }, fadeTime * 1000);
  } else {
    Object.values(activeClips).forEach(({ source }) => source.stop());
    activeClips = {};
    scheduledEvents.forEach((id) => clearTimeout(id));
    scheduledEvents = [];
  }
}
