import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import type { AudioWindowMessage, AudioWindowProcessorOptions, WorkletOutboundMessage } from './audio-window-processor';
import { AUDIO_WINDOW_PROCESSOR_OPTIONS, AudioWindowAccumulator, WORKLET_MESSAGE_TYPES } from './audio-window-processor';
import { AUDIO_CONSTANTS } from '../dsp/audio.constants';
import WORKLET_SOURCE from './audio-window-processor.worklet.js?raw';

/** Small windows at 1 kHz keep the windowing tests readable. */
function smallWindows(windowSamples: number, hopSamples: number): AudioWindowProcessorOptions {
  return { ...AUDIO_WINDOW_PROCESSOR_OPTIONS, targetSampleRate: 1000, windowSamples, hopSamples };
}

describe('AudioWindowAccumulator', () => {
  it('preserves the hop remainder across render quanta', () => {
    const accumulator = new AudioWindowAccumulator();
    let windows = 0;
    const chunk = new Float32Array(AUDIO_CONSTANTS.WORKLET_BLOCK_SIZE).fill(0.1);
    const seconds = 12;
    for (let sample = 0; sample < AUDIO_CONSTANTS.TARGET_SAMPLE_RATE * seconds; sample += chunk.length) {
      if (accumulator.processChunk(chunk)) windows++;
    }
    // First window after 3 s, then one every 1.5 s: 3, 4.5, 6, 7.5, 9, 10.5 and 12 s.
    expect(windows).toBe(7);
  });
  it('does not emit a window until a full window has accumulated', () => {
    const accumulator = new AudioWindowAccumulator(1000, smallWindows(100, 50));
    const chunk = new Float32Array(30).fill(0.1);

    // 30, 60 and 90 samples: not yet a full window.
    expect(accumulator.processChunk(chunk)).toBeNull();
    expect(accumulator.processChunk(chunk)).toBeNull();
    expect(accumulator.processChunk(chunk)).toBeNull();

    // 120 samples exceed the 100-sample window: the first window is emitted.
    const result = accumulator.processChunk(chunk);
    expect(result).not.toBeNull();
    expect(result?.index).toBe(0);
    expect(result?.window.length).toBe(100);
  });

  it('emits each further window after hopSamples', () => {
    const accumulator = new AudioWindowAccumulator(1000, smallWindows(100, 50));
    const chunk = new Float32Array(50).fill(0.2);

    expect(accumulator.processChunk(chunk)).toBeNull();
    // 100 samples: window 0.
    const win0 = accumulator.processChunk(chunk);
    expect(win0?.index).toBe(0);

    // One more hop of 50 samples: window 1.
    const win1 = accumulator.processChunk(chunk);
    expect(win1).not.toBeNull();
    expect(win1?.index).toBe(1);
    expect(win1?.window.length).toBe(100);
  });

  it('reports RMS and peak once per level interval', () => {
    const accumulator = new AudioWindowAccumulator(1000, smallWindows(200, 100));
    const chunk = new Float32Array(100).fill(0.5);

    accumulator.processChunk(chunk);
    const metrics = accumulator.getLevelMetrics();

    expect(metrics).not.toBeNull();
    expect(metrics?.peak).toBeCloseTo(0.5, 4);
    expect(metrics?.rms).toBeCloseTo(0.5, 4);
  });

  it('resamples 44.1 kHz input to full target-rate windows that keep a 1 kHz tone (RF-03)', () => {
    const sourceRate = 44100;
    const accumulator = new AudioWindowAccumulator(sourceRate);
    const chunkSize = AUDIO_CONSTANTS.WORKLET_BLOCK_SIZE;
    const toneFreq = 1000;
    const totalInputDurationSec = 3.5;
    const totalInputSamples = Math.floor(totalInputDurationSec * sourceRate);

    let emittedWindow: Float32Array | null = null;
    let windowIndex = -1;

    for (let offset = 0; offset < totalInputSamples; offset += chunkSize) {
      const len = Math.min(chunkSize, totalInputSamples - offset);
      const chunk = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = (offset + i) / sourceRate;
        chunk[i] = Math.sin(2 * Math.PI * toneFreq * t) * 0.8;
      }

      const res = accumulator.processChunk(chunk);
      if (res && emittedWindow === null) {
        emittedWindow = res.window;
        windowIndex = res.index;
      }
    }

    expect(emittedWindow).not.toBeNull();
    expect(windowIndex).toBe(0);
    expect(emittedWindow?.length).toBe(AUDIO_CONSTANTS.WINDOW_SAMPLES);

    // The 1 kHz tone keeps its frequency: a 3 s window resolves 1/3 Hz, so 1 kHz is bin 3000.
    if (!emittedWindow) {
      throw new Error('No window was emitted.');
    }
    const win = emittedWindow;
    function computeDftMagnitude(targetFreq: number): number {
      let real = 0;
      let imag = 0;
      const omega = (2 * Math.PI * targetFreq) / AUDIO_CONSTANTS.TARGET_SAMPLE_RATE;
      for (let n = 0; n < win.length; n++) {
        const val = win[n] ?? 0;
        real += val * Math.cos(omega * n);
        imag -= val * Math.sin(omega * n);
      }
      return Math.sqrt(real * real + imag * imag);
    }

    const mag1000 = computeDftMagnitude(1000);
    const mag950 = computeDftMagnitude(950);
    const mag1050 = computeDftMagnitude(1050);
    const mag500 = computeDftMagnitude(500);
    const mag2000 = computeDftMagnitude(2000);

    // The 1 kHz magnitude must dominate distant frequencies by orders of magnitude.
    expect(mag1000).toBeGreaterThan(mag950 * 50);
    expect(mag1000).toBeGreaterThan(mag1050 * 50);
    expect(mag1000).toBeGreaterThan(mag500 * 500);
    expect(mag1000).toBeGreaterThan(mag2000 * 500);

    // Zero crossings: 1 kHz for 3 s is 3000 cycles, about 6000 crossings.
    let zeroCrossings = 0;
    for (let n = 1; n < win.length; n++) {
      const prev = win[n - 1] ?? 0;
      const curr = win[n] ?? 0;
      if ((prev < 0 && curr >= 0) || (prev >= 0 && curr < 0)) {
        zeroCrossings++;
      }
    }
    // Tolerance of +-4 crossings over the window.
    expect(zeroCrossings).toBeGreaterThanOrEqual(5996);
    expect(zeroCrossings).toBeLessThanOrEqual(6004);
  });
});

describe('AudioWindowProcessor runtime', () => {
  interface Processor {
    process(inputs: Float32Array[][]): boolean;
    port: { onmessage: (event: { data: { type: string } }) => void };
    targetSampleRate: number;
    windowSamples: number;
    hopSamples: number;
  }
  type ProcessorConstructor = new (options?: { processorOptions?: unknown }) => Processor;

  /** Evaluates the worklet file as the browser would, capturing what it registers and posts. */
  function loadWorklet(): { name: string; Processor: ProcessorConstructor; messages: WorkletOutboundMessage[] } {
    const registered: { name?: string; Processor?: ProcessorConstructor } = {};
    const messages: WorkletOutboundMessage[] = [];
    runInNewContext(WORKLET_SOURCE, {
      sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
      currentTime: AUDIO_CONSTANTS.WINDOW_DURATION_SEC,
      Float32Array,
      TypeError,
      AudioWorkletProcessor: class {
        port = { onmessage: () => undefined, postMessage: (message: WorkletOutboundMessage) => { messages.push(message); } };
      },
      registerProcessor: (name: string, constructor: ProcessorConstructor) => {
        registered.name = name;
        registered.Processor = constructor;
      },
    });
    if (registered.name === undefined || !registered.Processor) throw new Error('Worklet did not register.');
    return { name: registered.name, Processor: registered.Processor, messages };
  }

  it('registers under the name the capture service instantiates', () => {
    expect(loadWorklet().name).toBe(AUDIO_CONSTANTS.WORKLET_PROCESSOR_NAME);
  });

  it('rejects missing or inconsistent processor options', () => {
    const { Processor } = loadWorklet();
    expect(() => new Processor()).toThrow('windowSamples');
    expect(() => new Processor({ processorOptions: { ...AUDIO_WINDOW_PROCESSOR_OPTIONS, hopSamples: AUDIO_CONSTANTS.WINDOW_SAMPLES + 1 } }))
      .toThrow('hopSamples');
    expect(() => new Processor({ processorOptions: { ...AUDIO_WINDOW_PROCESSOR_OPTIONS, targetPeak: 2 } })).toThrow('targetPeak');
  });

  it('acknowledges delivery and replaces the pending window instead of flooding the port', () => {
    const { Processor, messages } = loadWorklet();
    const processor = new Processor({ processorOptions: AUDIO_WINDOW_PROCESSOR_OPTIONS });
    expect([processor.targetSampleRate, processor.windowSamples, processor.hopSamples])
      .toEqual([AUDIO_CONSTANTS.TARGET_SAMPLE_RATE, AUDIO_CONSTANTS.WINDOW_SAMPLES, AUDIO_CONSTANTS.HOP_SAMPLES]);
    const windows = (): AudioWindowMessage[] => messages.filter(
      (message): message is AudioWindowMessage => message.type === WORKLET_MESSAGE_TYPES.windowReady,
    );
    const hop = (): Float32Array[][] => [[new Float32Array(AUDIO_CONSTANTS.HOP_SAMPLES).fill(0.3)]];
    const ack = (): void => { processor.port.onmessage({ data: { type: WORKLET_MESSAGE_TYPES.windowAck } }); };

    processor.process([[new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES).fill(0.2)]]);
    expect(messages.some((message) => message.type === WORKLET_MESSAGE_TYPES.levelUpdate)).toBe(true);
    for (let index = 0; index < 3; index++) processor.process(hop());
    expect(windows().map((message) => message.windowIndex)).toEqual([0]);
    ack();
    expect(windows().map((message) => message.windowIndex)).toEqual([0, 3]);
    expect(windows()[1]?.droppedWindows).toBe(2);
    expect(windows()[1]?.buffer.length).toBe(AUDIO_CONSTANTS.WINDOW_SAMPLES);
    ack();
    processor.process(hop());
    expect(windows()[2]?.windowIndex).toBe(4);
    expect(windows()[2]?.droppedWindows).toBe(0);
  });
});
