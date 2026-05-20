"use client";

/**
 * Subtle sound effects synthesized via the Web Audio API. No binary assets:
 * each cue is a short envelope of one or two tones. Master gain is low so the
 * sounds register peripherally without grabbing attention.
 *
 * All public functions are safe to call from any environment — SSR, browsers
 * without AudioContext, or after the user disabled sounds. Failures are
 * swallowed; no console errors.
 */

export type SoundKind = "ticketCreated" | "statusChanged" | "waiting" | "shipped" | "error";

const ENABLED_STORAGE_KEY = "pbq:sound-effects";
const THROTTLE_MS = 250;

type CueStep = { freq: number; type?: OscillatorType; duration: number; delay?: number };

const CUES: Record<SoundKind, CueStep[]> = {
  // Soft two-note ascending blip — "something new appeared".
  ticketCreated: [
    { freq: 660, type: "sine", duration: 0.08 },
    { freq: 880, type: "sine", duration: 0.1, delay: 0.06 },
  ],
  // Neutral single ping — "something moved".
  statusChanged: [{ freq: 740, type: "sine", duration: 0.12 }],
  // Two-note descending — "needs your attention".
  waiting: [
    { freq: 820, type: "triangle", duration: 0.1 },
    { freq: 540, type: "triangle", duration: 0.16, delay: 0.09 },
  ],
  // Bright ascending pair — "shipped / done".
  shipped: [
    { freq: 720, type: "sine", duration: 0.08 },
    { freq: 1040, type: "sine", duration: 0.14, delay: 0.07 },
  ],
  // Low, short tone — "something went wrong".
  error: [{ freq: 220, type: "sawtooth", duration: 0.14 }],
};

let audioContext: AudioContext | null = null;
const lastPlayedAt = new Map<SoundKind, number>();

function getEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(ENABLED_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function isSoundEnabled(): boolean {
  return getEnabled();
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENABLED_STORAGE_KEY, enabled ? "1" : "0");
  } catch {}
}

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      audioContext = null;
      return null;
    }
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => undefined);
  }
  return audioContext;
}

function scheduleTone(ctx: AudioContext, step: CueStep, startAt: number, masterGain: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = step.type ?? "sine";
  osc.frequency.value = step.freq;
  // Quick attack / smooth release envelope. setValueAtTime + ramps avoid clicks.
  const attack = 0.005;
  const release = Math.max(0.04, step.duration - attack);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(masterGain, startAt + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + attack + release);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + attack + release + 0.01);
}

export function playSound(kind: SoundKind): void {
  if (typeof window === "undefined") return;
  if (!getEnabled()) return;

  const now = Date.now();
  const last = lastPlayedAt.get(kind);
  if (last !== undefined && now - last < THROTTLE_MS) return;
  lastPlayedAt.set(kind, now);

  try {
    const ctx = ensureContext();
    if (!ctx) return;
    const cue = CUES[kind];
    const masterGain = 0.05;
    const baseTime = ctx.currentTime + 0.01;
    for (const step of cue) {
      scheduleTone(ctx, step, baseTime + (step.delay ?? 0), masterGain);
    }
  } catch {
    // Swallow — autoplay block, hardware failure, etc. No console noise.
  }
}
