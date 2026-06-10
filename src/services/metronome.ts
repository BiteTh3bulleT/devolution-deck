/**
 * MetronomeService — Web Audio API lookahead click scheduler.
 *
 * Design: schedules OscillatorNode clicks 100ms ahead using a repeating
 * setInterval at 25ms. This gives sample-accurate timing without any Rust
 * involvement.
 *
 * Usage:
 *   const metro = new MetronomeService();
 *   metro.start(positionSecs, bpm);  // call when transport starts
 *   metro.tick(positionSecs);         // call on every transport poll (50ms)
 *   metro.stop();                     // call when transport stops
 */

const LOOKAHEAD_MS = 100;    // schedule this far ahead
const SCHEDULE_INTERVAL_MS = 25;

export class MetronomeService {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private volume = 0.7;
  private bpm = 120;
  private nextBeatTime = 0;  // AudioContext time of next scheduled click
  private nextBeatIndex = 0; // absolute beat counter (for accent)
  private timerId: ReturnType<typeof setInterval> | null = null;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this._cancelPending();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /** Call when transport starts playing. positionSecs = current playhead position. */
  start(positionSecs: number, bpm: number): void {
    this.stop();
    this.bpm = bpm;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();

    const secondsPerBeat = 60 / bpm;
    // Determine which beat we're on
    const beatNumber = Math.floor(positionSecs / secondsPerBeat);
    // Next beat time in AudioContext.currentTime space
    const offsetFromBeat = positionSecs - beatNumber * secondsPerBeat;
    this.nextBeatTime = this.ctx.currentTime + (secondsPerBeat - offsetFromBeat);
    this.nextBeatIndex = beatNumber + 1;

    this.timerId = setInterval(() => this._schedule(), SCHEDULE_INTERVAL_MS);
  }

  /**
   * Call each transport poll to sync BPM and correct drift.
   * positionSecs = current transport position from backend.
   */
  tick(positionSecs: number, bpm: number): void {
    if (!this.ctx || !this.enabled) return;
    this.bpm = bpm;

    // Correct drift: compare expected AudioContext time for current position
    // against what the metronome has scheduled, and re-anchor if off by > 1 beat
    const secondsPerBeat = 60 / bpm;
    const expectedBeat = Math.floor(positionSecs / secondsPerBeat);
    const drift = Math.abs(this.nextBeatIndex - expectedBeat - 1);
    if (drift > 1) {
      // Re-anchor: reset beat scheduling to match transport position
      const offsetFromBeat = positionSecs - expectedBeat * secondsPerBeat;
      this.nextBeatTime = this.ctx.currentTime + (secondsPerBeat - offsetFromBeat);
      this.nextBeatIndex = expectedBeat + 1;
    }
  }

  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this._cancelPending();
  }

  private _schedule(): void {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const secondsPerBeat = 60 / this.bpm;
    const scheduleUntil = ctx.currentTime + LOOKAHEAD_MS / 1000;

    while (this.nextBeatTime < scheduleUntil) {
      this._scheduleClick(this.nextBeatTime, this.nextBeatIndex);
      this.nextBeatTime += secondsPerBeat;
      this.nextBeatIndex += 1;
    }
  }

  private _scheduleClick(when: number, beatIndex: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const isDownbeat = beatIndex % 4 === 0;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = isDownbeat ? 1000 : 800;
    gain.gain.setValueAtTime(this.volume, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);

    osc.start(when);
    osc.stop(when + 0.05);
  }

  private _cancelPending(): void {
    // Nothing to cancel explicitly — scheduled nodes fire and die.
    // We just stop scheduling new ones.
  }
}

/** Singleton shared across the app. */
export const metronomeService = new MetronomeService();
