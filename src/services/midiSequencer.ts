/**
 * MidiSequencer — frontend Web Audio API MIDI-to-audio scheduler.
 *
 * Phase 2: produces basic oscillator/noise tones for MIDI notes.
 * Not a real VST host. Provides audible feedback for MIDI clips during playback.
 *
 * Design: lookahead scheduler (100ms ahead, 25ms interval) reads midiClips
 * from all tracks, converts tick positions to AudioContext times, and
 * schedules OscillatorNode events.
 *
 * Drum sounds: pitch < 50 → short noise burst (kick/snare/hat range).
 * Melodic sounds: simple sine oscillator at MIDI frequency.
 */

import type { MidiClip, MidiNote } from "../types";
import { TICKS_PER_BEAT } from "../types";

const LOOKAHEAD_MS = 120;
const SCHEDULE_INTERVAL_MS = 25;

interface ScheduledClip {
  clip: MidiClip;
  trackStartSecs: number; // timeline start of clip (= clip.start_secs)
}

function midiToFreq(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

export class MidiSequencer {
  private ctx: AudioContext | null = null;
  private bpm = 120;
  private clips: ScheduledClip[] = [];
  private timerId: ReturnType<typeof setInterval> | null = null;
  /** Map of "clipId-noteId" → true to track which notes have been scheduled. */
  private scheduled = new Set<string>();
  private startWallTime = 0;
  private startPositionSecs = 0;
  private running = false;

  start(positionSecs: number, bpm: number, clips: ScheduledClip[]): void {
    this.stop();
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();

    this.bpm = bpm;
    this.clips = clips;
    this.scheduled.clear();
    this.startWallTime = this.ctx.currentTime;
    this.startPositionSecs = positionSecs;
    this.running = true;

    this.timerId = setInterval(() => this._schedule(), SCHEDULE_INTERVAL_MS);
  }

  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.running = false;
    this.scheduled.clear();
  }

  updateClips(clips: ScheduledClip[]): void {
    this.clips = clips;
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  /**
   * Call each transport poll to sync position and correct drift.
   * If transport position diverges from expected, re-anchor the scheduler.
   */
  tick(positionSecs: number, bpm: number): void {
    if (!this.running || !this.ctx) return;
    this.bpm = bpm;
    const expected = this._currentTimelineSecs();
    const drift = Math.abs(expected - positionSecs);
    // If drifted more than 200ms, re-anchor
    if (drift > 0.2) {
      const seekedBackward = positionSecs < expected;
      this.startWallTime = this.ctx.currentTime;
      this.startPositionSecs = positionSecs;
      if (seekedBackward) {
        this.scheduled.clear();
      }
    }
  }

  private _currentTimelineSecs(): number {
    if (!this.ctx) return 0;
    return this.startPositionSecs + (this.ctx.currentTime - this.startWallTime);
  }

  private _schedule(): void {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const nowTimeline = this._currentTimelineSecs();
    const scheduleUntil = nowTimeline + LOOKAHEAD_MS / 1000;
    const secondsPerBeat = 60 / this.bpm;
    const secondsPerTick = secondsPerBeat / TICKS_PER_BEAT;

    for (const { clip } of this.clips) {
      const clipEnd = clip.start_secs + clip.duration_secs;
      if (clipEnd < nowTimeline) continue;
      if (clip.start_secs > scheduleUntil) continue;

      for (const note of clip.notes) {
        const key = `${clip.id}-${note.id}`;
        if (this.scheduled.has(key)) continue;

        const noteOnTimeline = clip.start_secs + note.start_ticks * secondsPerTick;
        const noteDurSecs = note.duration_ticks * secondsPerTick;

        if (noteOnTimeline > scheduleUntil) continue;
        if (noteOnTimeline + noteDurSecs < nowTimeline) {
          this.scheduled.add(key); // already past, skip
          continue;
        }

        const audioTime = this.startWallTime + (noteOnTimeline - this.startPositionSecs);
        if (audioTime < ctx.currentTime) {
          this.scheduled.add(key);
          continue;
        }

        this._scheduleNote(note, audioTime, noteDurSecs);
        this.scheduled.add(key);
      }
    }
  }

  private _scheduleNote(note: MidiNote, when: number, durationSecs: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const velocity = note.velocity / 127;
    const dur = Math.max(0.02, Math.min(durationSecs, 4));

    if (note.pitch <= 50) {
      // Drum: short noise burst
      const bufSize = Math.ceil(ctx.sampleRate * 0.1);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      // Simple low-pass for kick (pitch < 40), high-pass for hats (pitch > 44)
      const filter = ctx.createBiquadFilter();
      if (note.pitch < 40) {
        filter.type = "lowpass";
        filter.frequency.value = 200 + note.pitch * 5;
      } else if (note.pitch > 44) {
        filter.type = "highpass";
        filter.frequency.value = 3000;
      } else {
        filter.type = "bandpass";
        filter.frequency.value = 400;
      }

      noise.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(velocity * 0.8, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
      noise.start(when);
      noise.stop(when + 0.13);
    } else {
      // Melodic: sine oscillator
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = midiToFreq(note.pitch);
      osc.connect(gain);
      gain.gain.setValueAtTime(velocity * 0.4, when);
      gain.gain.setValueAtTime(velocity * 0.4, when + dur * 0.8);
      gain.gain.linearRampToValueAtTime(0, when + dur);
      osc.start(when);
      osc.stop(when + dur + 0.01);
    }
  }
}

/** Singleton shared across the app. */
export const midiSequencer = new MidiSequencer();
