// A small class so React components stay tiny.
// Holds: AudioContext, master gain, active clips, scheduled events.
// Exposes the same methods you already use.

export class AudioEngine {
  constructor({ onStatus, onSectionChange, onQueueChange, onReady } = {}) {
    this.onStatus = onStatus || (() => {});
    this.onSectionChange = onSectionChange || (() => {});
    this.onQueueChange = onQueueChange || (() => {});
    this.onReady = onReady || (() => {});

    this.audioCtx = null;
    this.masterGain = null;
    this.fadeOutSeconds = 4;

    this.lastTrackName = null;

    this.currentSectionName = null;
    this.queuedNextSectionName = null;

    this.activeClips = {};
    this.lastPlayingClipName = null;

    this.scheduledTimeouts = [];
    this.clipData = {};
    this.sectionData = {};
    this.trackData = {};

    this.userGain = null;   // per-user, local
    this.trackGain = null;  // per-track, shared
    this.currentTrackVolume = 1; // 0..1 (for UI syncing, optional)

  }

  setData({ clips, sections, tracks }) {
    this.clipData = clips || {};
    this.sectionData = sections || {};
    this.trackData = tracks || {};
  }

  setTrackVolume(vol01) {
    const ctx = this.ensureContext();
    const v = Math.max(0, Math.min(1, Number(vol01) || 0));
    this.trackGain?.gain.setValueAtTime(v, ctx.currentTime);
    this.currentTrackVolume = v;
  }

  setUserVolume(vol01) {
    const ctx = this.ensureContext();
    const v = Math.max(0, Math.min(1, Number(vol01) || 0));
    this.userGain?.gain.setValueAtTime(v, ctx.currentTime);
  }

  ensureContext() {
    if (this.audioCtx) return this.audioCtx;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // create nodes
    const userGain   = ctx.createGain();   userGain.gain.setValueAtTime(1, ctx.currentTime);
    const trackGain  = ctx.createGain();   trackGain.gain.setValueAtTime(1, ctx.currentTime);

    // final destination: source -> clipGain -> trackGain -> userGain -> destination
    trackGain.connect(userGain).connect(ctx.destination);

    // keep refs (masterGain stays for back-compat, but we route to trackGain now)
    this.audioCtx   = ctx;
    this.userGain   = userGain;
    this.trackGain  = trackGain;
    this.masterGain = trackGain; // <— sources still “connect(..., this.masterGain)”
    return ctx;
  }

  setFadeOutSeconds(secs) {                         // ← NEW
    const s = Math.max(0, Math.min(30, Number(secs) || 0));
    this.fadeOutSeconds = s;
  }

  clearScheduled() {
    this.scheduledTimeouts.forEach(clearTimeout);
    this.scheduledTimeouts = [];
  }

  setCurrentSection(name) {
    this.currentSectionName = name || null;
    this.onSectionChange?.(this.currentSectionName);
  }

  queueSectionTransition(name) {
    this.queuedNextSectionName = name || null;
    this.onQueueChange(this.queuedNextSectionName);   // NEW
  }

  clearQueuedSection() {
    this.queuedNextSectionName = null;
    this.onQueueChange(null);                         // NEW
  }

  stopTrack(withFade = true) {
    if (!this.audioCtx) return;
    this.clearScheduled();

    // ensure progress bar can reset to 0 in the UI
    this.lastPlayingClipName = null;

    Object.values(this.activeClips).forEach(({ source, gainNode }) => {
      const fade = this.fadeOutSeconds; // your configurable fade
      if (withFade && fade > 0) {
        const now = this.audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + fade);
        setTimeout(() => { try { source.stop(); } catch {} }, fade * 1000 + 50);
      } else {
        try { source.stop(); } catch {}
      }
    });

    this.activeClips = {};
    this.onStatus("Stopped");
  }

  async preloadTrack(trackName, opts = {}) {
    const ctx = this.ensureContext();
    this.stopTrack(false);
    this.lastTrackName = trackName;

    // apply provided per-track volume if present
    const { trackVolume } = opts || {};
    if (typeof trackVolume === "number") {
      this.setTrackVolume(trackVolume);
    }

    const track = this.trackData[trackName];
    if (!track || !track.allClips) return;

    this.activeClips = {};

    for (const clipName of track.allClips) {
      const clip = this.clipData[clipName];
      if (!clip) continue;

      const res = await fetch(`/audio/${clip.file}`);
      const arr = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arr);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      source.connect(gainNode).connect(this.masterGain);
      source.start(0);

      this.activeClips[clipName] = { source, gainNode, buffer };
    }

    this.onStatus(`Track '${trackName}' preloaded`);
  }

  async resetToTrackStart() {
    if (!this.lastTrackName) return;

    // ensure progress bar can reset to 0 in the UI
    this.lastPlayingClipName = null;

    this.clearQueuedSection?.();
    this.stopTrack(false); // hard stop
    await this.preloadTrack(this.lastTrackName);
    const track = this.trackData[this.lastTrackName];
    if (track?.firstSection) this.setCurrentSection(track.firstSection);

    // tells App that we're fully reset (use this to zero the bar)
    this.onReady?.();
  }

  stopAndReload() {
    const fade = this.fadeOutSeconds;              // ← use live value at click time
    return new Promise((resolve) => {
      this.stopTrack(true);
      const id = setTimeout(async () => {
        await this.resetToTrackStart();
        resolve();
      }, (fade > 0 ? fade * 1000 + 80 : 80));      // ← handle 0s “instant”
      this.scheduledTimeouts.push(id);
    });
  }

  playSection(sectionName) {
    const section = this.sectionData[sectionName];
    if (!section) {
      console.error(`Section '${sectionName}' not found`);
      return;
    }
    this.setCurrentSection(sectionName);
    this.playClip(section.firstClip);
  }

  playClip = (clipName) => {
    const ctx = this.ensureContext();
    const clip = this.clipData[clipName];
    const entry = this.activeClips[clipName];
    if (!clip || !entry) {
      console.error(`Clip '${clipName}' not found or not loaded`);
      return;
    }

    const { buffer } = entry;
    const now = ctx.currentTime;

    // stop previous instance for this clip
    if (entry.source) {
      try { entry.source.stop(); } catch {}
    }

    // new source per “play”
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const hasNextInClip = Array.isArray(clip.nextClip) && clip.nextClip.length > 0;
    const sectionOfClip = this.sectionData[this.currentSectionName];
    const inEndSection = sectionOfClip?.type === "end";
    const noNextClip = !clip.nextClip || (Array.isArray(clip.nextClip) && clip.nextClip.length === 0);
    const treatAsTerminal = inEndSection && noNextClip; // terminal in an "end" section


    const loopEndPoint = (!hasNextInClip)
      ? (clip.loopPoint ?? buffer.duration)
      : (clip.clipEnd ?? buffer.duration);

    // If terminal-in-end-section, do NOT loop; we want to play out to clipEnd and finish.
    source.loop = (!hasNextInClip && !treatAsTerminal) ? true : false;
    source.loopStart = clip.loopStart || 0;
    source.loopEnd  = loopEndPoint;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    source.connect(gainNode).connect(this.masterGain);
    source.start(0, clip.loopStart || 0);

    // --- AUTO-TRANSITION LOGIC ---
    // If current section has autoTransition, and this clip "self-loops"
    // (its nextClip points to its own name), auto-queue the next section.
    if (this.currentSectionName) {
      const section = this.sectionData[this.currentSectionName];
      const isAuto = section?.type === "auto";

      const nextSections = Array.isArray(section?.nextSection)
        ? section.nextSection
        : (section?.nextSection ? [section.nextSection] : []);

      const hasTarget = nextSections.length > 0;

      const selfLoops =
        Array.isArray(clip.nextClip)
          ? clip.nextClip.includes(clipName)
          : clip.nextClip === clipName;

      if (isAuto && hasTarget && selfLoops && !this.queuedNextSectionName) {
        const targetSection = nextSections[0];
        this.queueSectionTransition(targetSection);
      }
    }
    // --- END AUTO-TRANSITION LOGIC ---

    // record timing so we can reschedule on loopers
    const startedAt = now;
    const offsetAtStart = clip.loopStart || 0;

    // update ref (include timing fields)
    this.activeClips[clipName] = { source, gainNode, buffer, startedAt, offsetAtStart };

    // remember the currently playing clip for the progress bar
    this.lastPlayingClipName = clipName;

    // fade in
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(1.0, now + 0.2);

    this.onStatus(`Playing: ${clipName}`);

    // Always schedule a loop-point check so late queues are honored
    const scheduleLoopCheck = () => {
      // how long from *now* until we reach the next loop point?
      const elapsed = this.audioCtx.currentTime - startedAt;
      const timeFromStartToLoop = (clip.loopPoint ?? buffer.duration) - offsetAtStart;

      let waitSec = timeFromStartToLoop - elapsed;
      // If we already passed it (can happen if code paused in dev tools), roll to next cycle
      if (waitSec < 0) {
        // On non-looping sources (hasNextInClip), we still want an immediate check
        // to avoid missing the window.
        if (!source.loop) {
          waitSec = 0;
        } else {
          const cycle = (clip.loopPoint ?? buffer.duration) - (clip.loopStart || 0);
          waitSec = ((-waitSec) % cycle);
        }
      }

      const id = setTimeout(() => {
        let nextClipName = null;
        const hasNextInClip = Array.isArray(clip.nextClip) && clip.nextClip.length > 0;

        if (this.queuedNextSectionName) {
          const targetSection = this.sectionData[this.queuedNextSectionName];
          nextClipName = targetSection?.firstClip || null;
          if (targetSection) this.setCurrentSection(this.queuedNextSectionName);
          this.clearQueuedSection();
        } else if (hasNextInClip) {
          const arr = clip.nextClip;
          nextClipName = arr.length > 1 ? arr[Math.floor(Math.random() * arr.length)] : arr[0];
        }

        if (nextClipName && this.clipData[nextClipName] && this.activeClips[nextClipName]) {
          this.playClip(nextClipName);
        } else {
          if (source.loop) {
            // looping: keep watching future loop points (late queue may arrive)
            scheduleLoopCheck();
          } else {
            // non-looping: terminal?
            const section = this.sectionData[this.currentSectionName];
            const inEnd = section?.type === "end";
            const noNext = !clip.nextClip || (Array.isArray(clip.nextClip) && clip.nextClip.length === 0);
            const isTerminalInEnd = inEnd && noNext;

            if (isTerminalInEnd) {
              const clipEndTime = clip.clipEnd ?? buffer.duration;
              const delta = clipEndTime - (clip.loopPoint ?? buffer.duration);
              gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime + Math.max(0, delta));
              const id2 = setTimeout(() => this.resetToTrackStart(), Math.max(0, delta) * 1000 + 60);
              this.scheduledTimeouts.push(id2);
              return;
            }
          }
        }

        // Default fade at clipEnd when not handled above
        const clipEndTime = clip.clipEnd ?? buffer.duration;
        const delta = clipEndTime - (clip.loopPoint ?? buffer.duration);
        gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime + Math.max(0, delta));

      }, Math.max(0, waitSec) * 1000);

      this.scheduledTimeouts.push(id);
    };

    scheduleLoopCheck();

  }

  // Used by the clip progress bar
  getPlaybackInfo() {
    const name = this.lastPlayingClipName;
    if (!name) return null;
    const entry = this.activeClips[name];
    if (!entry) return null;
    const clip = this.clipData[name] || {};
    const { buffer, startedAt, offsetAtStart } = entry;
    if (!this.audioCtx || !buffer) return null;

    const now = this.audioCtx.currentTime;
    const loopPoint = clip.loopPoint ?? buffer.duration;
    const elapsed = Math.max(0, now - (startedAt ?? 0));
    const pos = (offsetAtStart ?? 0) + elapsed;        // seconds since clip start position
    const norm = Math.max(0, Math.min(1, loopPoint > 0 ? pos / loopPoint : 0));
    return { clipName: name, positionSec: pos, loopPointSec: loopPoint, progress01: norm };
  }

  // For future net-sync: schedule by *audio time*
  schedule(fn, atAudioTime) {
    const ctx = this.ensureContext();
    const ms = Math.max(0, (atAudioTime - ctx.currentTime) * 1000);
    const id = setTimeout(fn, ms);
    this.scheduledTimeouts.push(id);
  }
}
