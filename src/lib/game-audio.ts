import type { Seat } from "./types";

/** Short, locally synthesized cues. No audio files, network calls, or looping voices. */
export class GameAudio {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly noise: AudioBuffer;
  private readonly voices = new Set<AudioScheduledSourceNode>();
  private muted = false;

  constructor() {
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.master = this.context.createGain();
    this.master.gain.value = 0.45;
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 12;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    this.master.connect(limiter);
    limiter.connect(this.context.destination);
    this.noise = this.context.createBuffer(
      1,
      this.context.sampleRate,
      this.context.sampleRate,
    );
    const samples = this.noise.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1)
      samples[index] = Math.random() * 2 - 1;
  }

  async unlock() {
    if (this.context.state === "suspended") await this.context.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.45, now, 0.008);
    if (muted)
      for (const voice of this.voices) {
        try {
          voice.stop(now + 0.025);
        } catch {
          /* Already completed. */
        }
      }
  }

  private get ready() {
    return !this.muted && this.context.state === "running";
  }

  private envelope(time: number, duration: number, volume: number) {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(
      volume,
      time + Math.min(0.008, duration / 4),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    gain.connect(this.master);
    return gain;
  }

  private track(
    voice: AudioScheduledSourceNode,
    nodes: AudioNode[],
    time: number,
    duration: number,
  ) {
    this.voices.add(voice);
    voice.onended = () => {
      this.voices.delete(voice);
      voice.disconnect();
      for (const node of nodes) node.disconnect();
    };
    voice.stop(time + duration + 0.015);
  }

  private tone(
    frequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    time: number,
    type: OscillatorType = "sine",
  ) {
    const oscillator = this.context.createOscillator();
    const gain = this.envelope(time, duration, volume);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(
      endFrequency,
      time + duration,
    );
    oscillator.connect(gain);
    oscillator.start(time);
    this.track(oscillator, [gain], time, duration);
  }

  private noiseBurst(
    frequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    time: number,
    type: BiquadFilterType,
  ) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.envelope(time, duration, volume);
    source.buffer = this.noise;
    filter.type = type;
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(frequency, time);
    filter.frequency.exponentialRampToValueAtTime(
      endFrequency,
      time + duration,
    );
    source.connect(filter);
    filter.connect(gain);
    source.start(time, Math.random() * 0.5);
    this.track(source, [filter, gain], time, duration);
  }

  playMove(seat: Seat, delay = 0) {
    if (!this.ready) return;
    const time = this.context.currentTime + 0.006 + delay;
    if (seat === 0) {
      this.tone(1150, 1650, 0.07, 0.1, time);
      this.tone(660, 410, 0.1, 0.07, time + 0.035, "triangle");
      this.noiseBurst(3200, 1800, 0.065, 0.05, time, "highpass");
    } else {
      this.noiseBurst(800, 230, 0.18, 0.12, time, "bandpass");
      this.tone(200, 135, 0.14, 0.12, time, "triangle");
      this.tone(390, 270, 0.1, 0.04, time + 0.015);
    }
  }

  playStart(seat: Seat, random: boolean) {
    if (!this.ready) return;
    const time = this.context.currentTime + 0.006;
    if (random)
      for (let index = 0; index < 3; index += 1)
        this.tone(
          650 + index * 90,
          620 + index * 90,
          0.035,
          0.035,
          time + index * 0.04,
        );
    this.tone(
      seat === 0 ? 880 : 440,
      seat === 0 ? 1174 : 587,
      0.12,
      0.08,
      time + (random ? 0.13 : 0),
    );
  }

  playResult(result: "win" | "loss" | "draw") {
    if (!this.ready) return;
    const time = this.context.currentTime + 0.14;
    const notes =
      result === "win"
        ? [523.25, 659.25, 783.99]
        : result === "loss"
          ? [392, 329.63]
          : [440, 554.37];
    for (const [index, frequency] of notes.entries()) {
      this.tone(
        frequency,
        frequency,
        result === "win" ? 0.23 : 0.18,
        result === "win" ? 0.1 : 0.075,
        time + (result === "draw" ? 0 : index * 0.09),
        result === "loss" ? "triangle" : "sine",
      );
    }
  }

  playEnabled() {
    if (this.ready)
      this.tone(740, 980, 0.08, 0.06, this.context.currentTime + 0.006);
  }

  dispose() {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* Already completed. */
      }
    }
    this.voices.clear();
    void this.context.close().catch(() => {});
  }
}
