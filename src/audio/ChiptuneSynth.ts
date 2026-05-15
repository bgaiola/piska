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
  /**
   * Optional starting frequency for a pitch slide. If set, the oscillator
   * begins at slideFromFreq and ramps exponentially to `freq` over
   * `slideMs` (default = first quarter of durationMs, capped at 90 ms).
   * Use this for desert slither motifs, water bubbles, etc.
   */
  slideFromFreq?: number;
  /** Slide duration in ms. Only used if slideFromFreq is provided. */
  slideMs?: number;
  /**
   * Optional vibrato applied after the slide finishes. Depth is in cents
   * (100 cents = 1 semitone) and rate is in Hz. Vibrato is implemented as
   * a low-frequency oscillator modulating the carrier frequency.
   */
  vibratoCents?: number;
  vibratoRateHz?: number;
}

export type NoiseKind = 'kick' | 'snare' | 'hat' | 'openhat' | 'tom' | 'clap';

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
    this.applyPitch(osc.frequency, startAt, note);

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
    const lfo = this.applyVibrato(osc.frequency, note, startAt, stopAt);
    osc.onended = () => {
      try {
        osc.disconnect();
        envelope.disconnect();
        if (lfo) {
          lfo.osc.disconnect();
          lfo.depth.disconnect();
        }
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
    this.applyPitch(osc.frequency, startAt, note);

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
    const lfo = this.applyVibrato(osc.frequency, note, startAt, stopAt);
    osc.onended = () => {
      try {
        osc.disconnect();
        envelope.disconnect();
        if (lfo) {
          lfo.osc.disconnect();
          lfo.depth.disconnect();
        }
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
      case 'openhat':
        // Like a hat but longer-lived for shuffle / ride feel.
        filter.type = 'highpass';
        filter.frequency.value = 5500;
        filter.Q.value = 0.6;
        decayMs = Math.max(durationMs, 180);
        peak = 0.45;
        break;
      case 'tom':
        // Pitched low-mid hit — great for tribal / desert / castle accents.
        filter.type = 'lowpass';
        filter.frequency.value = 380;
        filter.Q.value = 4;
        decayMs = Math.max(durationMs, 130);
        peak = 0.85;
        break;
      case 'clap':
        // Quick narrow-band burst — synth-clap flavor for funkier patterns.
        filter.type = 'bandpass';
        filter.frequency.value = 1100;
        filter.Q.value = 2.5;
        decayMs = Math.max(durationMs, 70);
        peak = 0.7;
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
   * Apply pitch + optional slide to an oscillator's frequency AudioParam.
   * If `slideFromFreq` is set on the note, ramps exponentially from the start
   * pitch to the target over `slideMs`. Both endpoints are guarded against
   * non-positive values (exponentialRampToValueAtTime requires > 0).
   */
  private applyPitch(freqParam: AudioParam, startAt: number, note: NoteOn): void {
    if (note.slideFromFreq && note.slideFromFreq > 0) {
      const slideEnd = startAt + (note.slideMs ?? Math.min(90, note.durationMs * 0.25)) / 1000;
      freqParam.setValueAtTime(note.slideFromFreq, startAt);
      freqParam.exponentialRampToValueAtTime(Math.max(0.0001, note.freq), slideEnd);
    } else {
      freqParam.setValueAtTime(note.freq, startAt);
    }
  }

  /**
   * If the note has vibratoCents > 0, attach a sine LFO that modulates the
   * carrier frequency. Returns the created nodes so the caller can disconnect
   * them when the carrier ends. The vibrato fades in over ~80 ms so the start
   * of the note still feels solid.
   */
  private applyVibrato(
    freqParam: AudioParam,
    note: NoteOn,
    startAt: number,
    stopAt: number
  ): { osc: OscillatorNode; depth: GainNode } | null {
    const cents = note.vibratoCents ?? 0;
    if (cents <= 0) return null;
    const rateHz = Math.max(0.1, note.vibratoRateHz ?? 5.5);
    // Convert cents to a Hz deviation around the carrier. We approximate
    // depth as carrier * (2^(cents/1200) - 1), which is exact at the carrier.
    const ratio = Math.pow(2, cents / 1200) - 1;
    const depthHz = Math.max(0.01, note.freq * ratio);

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rateHz;

    const depthGain = this.ctx.createGain();
    // Fade depth in to avoid an abrupt wobble at note start.
    const fadeInEnd = Math.min(stopAt, startAt + 0.08);
    depthGain.gain.setValueAtTime(0, startAt);
    depthGain.gain.linearRampToValueAtTime(depthHz, fadeInEnd);

    lfo.connect(depthGain);
    depthGain.connect(freqParam);
    lfo.start(startAt);
    lfo.stop(stopAt);
    return { osc: lfo, depth: depthGain };
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
