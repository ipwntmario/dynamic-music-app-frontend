// A small class so React components stay tiny.
// Holds: AudioContext, master gain, active clips, scheduled events.
// Exposes the same methods you already use.

export class AudioEngine {
  constructor({ onStatus, onSectionChange, onQueueChange } = {}) {
    this.onStatus = onStatus || (() => {});
    this.onSectionChange = onSectionChange || (() => {});
    this.onQueueChange = onQueueChange || (() => {}); // NEW
    this.audioCtx = null;
    this.masterGain = null;
    this.fadeOutEnabled = true;

    this.currentSectionName = null;
    this.queuedNextSectionName = null;
    this.lastTrackName = null;  // NEW

    this.activeClips = {};       // { clipName: { source, gainNode, buffer } }
    this.scheduledTimeouts = []; // [timeoutId]
    this.clipData = {};
    this.sectionData = {};
    this.trackData = {};
  }

  setData({ clips, sections, tracks }) {
    this.clipData = clips || {};
    this.sectionData = sections || {};
    this.trackData = tracks || {};
  }

  ensureContext() {
    if (this.audioCtx) return this.audioCtx;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(1, ctx.currentTime);
    this.audioCtx = ctx;
    this.masterGain = gain;
    return ctx;
  }

  setFadeOutEnabled(bool) {
    this.fadeOutEnabled = !!bool;
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
    this.queuedNextSectionName = name || null; // pass null to clear
    this.onQueueChange(this.queuedNextSectionName);   // NEW
  }

  clearQueuedSection() {
    this.queuedNextSectionName = null;
    this.onQueueChange(null);                         // NEW
  }

  stopTrack(withFade = true) {
    if (!this.audioCtx) return;
    this.clearScheduled();

    Object.values(this.activeClips).forEach(({ source, gainNode }) => {
      if (withFade && this.fadeOutEnabled) {
        const fade = 8.0;
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

  async preloadTrack(trackName) {
    const ctx = this.ensureContext();
    this.stopTrack(false);
    this.lastTrackName = trackName; // NEW

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
    this.clearQueuedSection();
    this.stopTrack(false); // hard stop without fade
    await this.preloadTrack(this.lastTrackName); // puts us back to “Track 'X' preloaded”
    const track = this.trackData[this.lastTrackName];
    if (track?.firstSection) this.setCurrentSection(track.firstSection);
  }

  stopAndReload() {
    const fade = 8.0;              // keep in sync with stopTrack’s fade
    this.stopTrack(true);
    const id = setTimeout(() => this.resetToTrackStart(), fade * 1000 + 80);
    this.scheduledTimeouts.push(id);
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
    const loopEndPoint = (!hasNextInClip)
      ? (clip.loopPoint ?? buffer.duration)
      : (clip.clipEnd ?? buffer.duration);

    source.loop = !hasNextInClip;
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
      const auto = !!section?.autoTransition;

      // normalize nextSection to array
      const nextSections = Array.isArray(section?.nextSection)
        ? section.nextSection
        : (section?.nextSection ? [section.nextSection] : []);

      const hasTarget = nextSections.length > 0;

      // detect self-looping clip
      const selfLoops =
        Array.isArray(clip.nextClip)
          ? clip.nextClip.includes(clipName)
          : clip.nextClip === clipName;

      if (auto && hasTarget && selfLoops && !this.queuedNextSectionName) {
        const targetSection = nextSections[0]; // choose first if multiple
        this.queueSectionTransition(targetSection);
      }
    }
    // --- END AUTO-TRANSITION LOGIC ---

    // update ref
    this.activeClips[clipName] = { source, gainNode, buffer };

    // fade in
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(1.0, now + 0.2);

    this.onStatus(`Playing: ${clipName}`);

    // Single unified scheduler:

    // record timing so we can reschedule on loopers
    const startedAt = now;
    const offsetAtStart = clip.loopStart || 0;
    this.activeClips[clipName] = { source, gainNode, buffer, startedAt, offsetAtStart };

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
          // No transition happened:
          if (source.loop) {
            // looping clip: keep checking each loop for a late queue
            scheduleLoopCheck();
          } else {
            // non-looping and no next clip => potential TRUE END if section also has no nextSection
            const section = this.sectionData[this.currentSectionName];
            const ns = Array.isArray(section?.nextSection) ? section.nextSection : (section?.nextSection ? [section.nextSection] : []);
            const isTrueEnd = ns.length === 0; // no nextSection

            if (isTrueEnd) {
              const clipEndTime = clip.clipEnd ?? buffer.duration;
              const delta = clipEndTime - (clip.loopPoint ?? buffer.duration); // seconds after loop point
              // fade to 0 at clipEnd (keep your existing fade line)
              gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime + Math.max(0, delta));
              // reset to “ready” state a hair after clipEnd
              const id2 = setTimeout(() => this.resetToTrackStart(), Math.max(0, delta) * 1000 + 60);
              this.scheduledTimeouts.push(id2);
              return; // done
            }
          }
        }

        // Still apply the fade to 0 at clipEnd when not a true end case handled above
        const clipEndTime = clip.clipEnd ?? buffer.duration;
        const delta = clipEndTime - (clip.loopPoint ?? buffer.duration);
        gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime + Math.max(0, delta));

      }, Math.max(0, waitSec) * 1000);

      this.scheduledTimeouts.push(id);
    };

    scheduleLoopCheck();

  }

  // For future net-sync: schedule by *audio time*
  schedule(fn, atAudioTime) {
    const ctx = this.ensureContext();
    const ms = Math.max(0, (atAudioTime - ctx.currentTime) * 1000);
    const id = setTimeout(fn, ms);
    this.scheduledTimeouts.push(id);
  }
}
