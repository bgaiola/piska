/**
 * ChiptuneSynth — NES 2A03-style procedural synthesizer using Web Audio.
 *
 * Emulates four voices:
 *   - Pulse 1 / Pulse 2 (square with 12.5/25/50/75% duty)
 *   - Triangle (bass)
 *   - Noise (drums: kick/snare/hat)
 *
 * Notes are short-lived: a fresh OscillatorNode (or BufferSource) is created per
 * note and stopped + disconnected after its release tail. This avoids leaking
 * nodes across idle tabs.
 *
 * All scheduling uses absolute AudioContext.currentTime so a sequencer can
 * batch-schedule events a few hundred ms ahead.
 */

export type PulseDuty = 0.125 | 0.25 | 0.5 | 0.75;

export interface NoteOn {
  /** Frequency in Hz. */
  freq: number;
  /** Sustain duration before release begins, in ms. */
  durationMs: number;
  /** Note velocity (0..1). Defaults to 1. */
  velocity?: number;
}

export type NoiseKind = 'kick' | 'snare' | 'hat';

/** Minimum gain we may ramp to (exponentialRampToValueAtTime cannot reach 0). */
const MIN_GAIN = 0.0001;

/** Default master volume — chiptunes can be harsh; we start gentle. */
const DEFAULT_MASTER = 0.15;

/** Length of the cached white-noise buffer in seconds. */
const NOISE_BUFFER_SECONDS = 1;

/**
 * Build Fourier coefficients for a pulse wave with duty cycle D.
 * For a pulse of duty D, the n-th harmonic amplitude is:
 *     a_n = (2 / (n * pi)) * sin(n * pi * D)
 * We feed these as the imaginary part of a PeriodicWave; the real part is 0.
 */
function buildPulsePeriodicWave(ctx: AudioContext, duty: number, harmonics = 32): PeriodicWave {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  // DC and first imag coefficient are set by the loop; real stays at 0.
  for (let n = 1; n <= harmonics; n++) {
    imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

export class ChiptuneSynth {
  readonly ctx: AudioContext;
  readonly masterGain: GainNode;

  private pulseGain1: GainNode;
  private pulseGain2: GainNode;
  private triGain: GainNode;
  private noiseGain: GainNode;

  /** Per-duty PeriodicWave cache. */
  private pulseWaves = new Map<number, PeriodicWave>();

  /** Shared 1-second white-noise buffer. */
  private noiseBuffer: AudioBuffer;

  /** Whether the context was created by us (we should close it on destroy). */
  private ownsContext: boolean;

  /** Last master volume value set via setMasterVolume (0..1). */
  private masterVolume = DEFAULT_MASTER;

  constructor(ctx?: AudioContext) {
    if (ctx) {
      this.ctx = ctx;
      this.ownsContext = false;
    } else {
      const Ctor: typeof AudioContext =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : ((window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext);
      this.ctx = new Ctor();
      this.ownsContext = true;
    }

    // Master bus.
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    // Per-channel gains feed the master. These set the relative balance.
    // Pulse channels are loud and brittle, so we trim them a touch.
    this.pulseGain1 = this.ctx.createGain();
    this.pulseGain1.gain.value = 0.55;
    this.pulseGain1.connect(this.masterGain);

    this.pulseGain2 = this.ctx.createGain();
    this.pulseGain2.gain.value = 0.45;
    this.pulseGain2.connect(this.masterGain);

    this.triGain = this.ctx.createGain();
    this.triGain.gain.value = 0.7;
    this.triGain.connect(this.masterGain);

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.35;
    this.noiseGain.connect(this.masterGain);

    // Pre-generate the shared white-noise buffer.
    this.noiseBuffer = this.buildNoiseBuffer();
  }

  // ---------------------------------------------------------------------------
  // Public scheduling API
  // ---------------------------------------------------------------------------

  /**
   * Schedule a pulse note on channel 0 (pulse1) or channel 1 (pulse2) using
   * the given duty cycle. If atTime is omitted, plays as soon as possible.
   */
  playPulse(channel: 0 | 1, note: NoteOn, duty: PulseDuty, atTime?: number): void {
    const startAt = atTime ?? this.ctx.currentTime;
    const wave = this.getPulseWave(duty);
    const channelBus = channel === 0 ? this.pulseGain1 : this.pulseGain2;

    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(note.freq, startAt);

    const envelope = this.ctx.createGain();
    envelope.gain.value = 0;
    osc.connect(envelope);
    envelope.connect(channelBus);

    this.applyADEnvelope(envelope.gain, startAt, note.durationMs, note.velocity ?? 1, {
      attackMs: 4,
      releaseMs: 35,
    });

    const stopAt = startAt + (note.durationMs + 50) / 1000;
    osc.start(startAt);
    osc.stop(stopAt);
    osc.onended = () => {
      try {
        osc.disconnect();
        envelope.disconnect();
      } catch {
        // Already disconnected — ignore.
      }
    };
  }

  /**
   * Schedule a triangle (bass) note. The native 'triangle' waveform plus a
   * gentle envelope produces a passable 4-bit-ish bass tone.
   */
  playTriangle(note: NoteOn, atTime?: number): void {
    const startAt = atTime ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note.freq, startAt);

    const envelope = this.ctx.createGain();
    envelope.gain.value = 0;
    osc.connect(envelope);
    envelope.connect(this.triGain);

    // Bass needs a slightly longer release so it doesn't click between notes.
    this.applyADEnvelope(envelope.gain, startAt, note.durationMs, note.velocity ?? 1, {
      attackMs: 3,
      releaseMs: 50,
    });

    const stopAt = startAt + (note.durationMs + 70) / 1000;
    osc.start(startAt);
    osc.stop(stopAt);
    osc.onended = () => {
      try {
        osc.disconnect();
        envelope.disconnect();
      } catch {
        // Already disconnected — ignore.
      }
    };
  }

  /**
   * Schedule a noise hit. The kind selects the filter shape and decay length
   * to roughly approximate a NES kick/snare/hat.
   */
  playNoise(kind: NoiseKind, durationMs: number, atTime?: number): void {
    const startAt = atTime ?? this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    let decayMs = durationMs;
    let peak = 1;
    switch (kind) {
      case 'kick':
        filter.type = 'lowpass';
        filter.frequency.value = 220;
        filter.Q.value = 1.5;
        decayMs = Math.max(durationMs, 50);
        peak = 1;
        break;
      case 'snare':
        filter.type = 'bandpass';
        filter.frequency.value = 1500;
        filter.Q.value = 0.9;
        decayMs = Math.max(durationMs, 90);
        peak = 0.85;
        break;
      case 'hat':
        filter.type = 'highpass';
        filter.frequency.value = 6500;
        filter.Q.value = 0.8;
        decayMs = Math.max(durationMs, 35);
        peak = 0.55;
        break;
    }

    const envelope = this.ctx.createGain();
    envelope.gain.value = 0;

    src.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.noiseGain);

    const attackEnd = startAt + 0.004;
    const releaseEnd = startAt + decayMs / 1000;

    envelope.gain.setValueAtTime(MIN_GAIN, startAt);
    envelope.gain.linearRampToValueAtTime(peak, attackEnd);
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseEnd);

    src.start(startAt);
    src.stop(releaseEnd + 0.02);
    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        envelope.disconnect();
      } catch {
        // Already disconnected — ignore.
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Master / context controls
  // ---------------------------------------------------------------------------

  setMasterVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.masterVolume = clamped;
    const now = this.ctx.currentTime;
    // Small ramp so volume changes don't pop.
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(clamped, now + 0.05);
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async suspend(): Promise<void> {
    if (this.ctx.state === 'running') {
      await this.ctx.suspend();
    }
  }

  now(): number {
    return this.ctx.currentTime;
  }

  destroy(): void {
    try {
      this.masterGain.disconnect();
      this.pulseGain1.disconnect();
      this.pulseGain2.disconnect();
      this.triGain.disconnect();
      this.noiseGain.disconnect();
    } catch {
      // Ignore — already disconnected.
    }
    if (this.ownsContext) {
      void this.ctx.close().catch(() => {
        // Closing can fail if already closed; nothing actionable.
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private getPulseWave(duty: PulseDuty): PeriodicWave {
    const cached = this.pulseWaves.get(duty);
    if (cached) return cached;
    const wave = buildPulsePeriodicWave(this.ctx, duty);
    this.pulseWaves.set(duty, wave);
    return wave;
  }

  private buildNoiseBuffer(): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * NOISE_BUFFER_SECONDS), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /**
   * Apply an attack/sustain/release envelope to a GainNode's gain param.
   * The note holds at velocity for durationMs, then exponentially decays to
   * silence over releaseMs.
   */
  private applyADEnvelope(
    param: AudioParam,
    startAt: number,
    durationMs: number,
    velocity: number,
    opts: { attackMs: number; releaseMs: number }
  ): void {
    const attack = opts.attackMs / 1000;
    const release = opts.releaseMs / 1000;
    const hold = Math.max(0.005, durationMs / 1000);

    const attackEnd = startAt + attack;
    const sustainEnd = startAt + hold;
    const releaseEnd = sustainEnd + release;

    const peak = Math.max(MIN_GAIN, Math.min(1, velocity));

    param.cancelScheduledValues(startAt);
    param.setValueAtTime(MIN_GAIN, startAt);
    param.linearRampToValueAtTime(peak, attackEnd);
    // Sustain at peak (a tiny ramp to avoid scheduling collisions).
    param.linearRampToValueAtTime(peak, sustainEnd);
    param.exponentialRampToValueAtTime(MIN_GAIN, releaseEnd);
  }
}
