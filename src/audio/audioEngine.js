// A small class so React components stay tiny.
// Holds: AudioContext, master gain, active clips, scheduled events.
// Exposes the same methods you already use.

export class AudioEngine {
  constructor({ onStatus } = {}) {
    this.onStatus = onStatus || (() => {});
    this.audioCtx = null;
    this.masterGain = null;
    this.fadeOutEnabled = true;

    this.activeClips = {};           // { clipName: { source, gainNode, buffer } }
    this.scheduledTimeouts = [];     // [timeoutId]
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

  playSection(sectionName) {
    const section = this.sectionData[sectionName];
    if (!section) {
      console.error(`Section '${sectionName}' not found`);
      return;
    }
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

    if (entry.source) {
      try { entry.source.stop(); } catch {}
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const hasNext = Array.isArray(clip.nextClip) && clip.nextClip.length > 0;
    const loopEndPoint = (!hasNext)
      ? (clip.loopPoint ?? buffer.duration)
      : (clip.clipEnd ?? buffer.duration);

    source.loop = !hasNext;
    source.loopStart = clip.loopStart || 0;
    source.loopEnd  = loopEndPoint;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    source.connect(gainNode).connect(this.masterGain);
    source.start(0, clip.loopStart || 0);

    this.activeClips[clipName] = { source, gainNode, buffer };

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(1.0, now + 0.2);

    this.onStatus(`Playing: ${clipName}`);

    if (hasNext) {
      const timeUntilLoopPoint = (clip.loopPoint ?? buffer.duration) - (clip.loopStart || 0);
      const id = setTimeout(() => {
        const arr = clip.nextClip;
        const next = arr.length > 1 ? arr[Math.floor(Math.random() * arr.length)] : arr[0];

        if (this.clipData[next] && this.activeClips[next]) {
          this.playClip(next);
        }

        const clipEndTime = clip.clipEnd ?? buffer.duration;
        const delta = clipEndTime - (clip.loopPoint ?? buffer.duration);
        gainNode.gain.setValueAtTime(0, ctx.currentTime + Math.max(0, delta));
      }, timeUntilLoopPoint * 1000);
      this.scheduledTimeouts.push(id);
    }
  }

  // For future net-sync: schedule by *audio time*
  // Example: schedule(() => this.playClip(name), atAudioTime)
  schedule(fn, atAudioTime) {
    const ctx = this.ensureContext();
    const ms = Math.max(0, (atAudioTime - ctx.currentTime) * 1000);
    const id = setTimeout(fn, ms);
    this.scheduledTimeouts.push(id);
  }
}
