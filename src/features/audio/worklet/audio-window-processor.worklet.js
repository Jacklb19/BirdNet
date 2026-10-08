// AudioWorklet processor served as a same-origin file: the CSP blocks blob: worklet modules.
// It cannot import TypeScript, so every parameter arrives through `processorOptions`, built from
// AUDIO_CONSTANTS as AUDIO_WINDOW_PROCESSOR_OPTIONS (audio-window-processor.ts). The registered name and
// MESSAGE_TYPES mirror WORKLET_PROCESSOR_NAME and WORKLET_MESSAGE_TYPES; audio-window-processor.test.ts
// runs this file against them.

const MESSAGE_TYPES = Object.freeze({
  windowReady: 'WINDOW_READY',
  levelUpdate: 'LEVEL_UPDATE',
  windowAck: 'WINDOW_ACK',
});

// Float audio is normalized to [-1, 1]; a target peak above full scale would clip.
const FULL_SCALE = 1;

function invalidOption(key) {
  return new TypeError(`Invalid audio window processor option "${key}".`);
}

function positiveNumber(options, key) {
  const value = options[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw invalidOption(key);
  return value;
}

function positiveInteger(options, key) {
  const value = options[key];
  if (!Number.isSafeInteger(value) || value <= 0) throw invalidOption(key);
  return value;
}

// Throwing in the constructor makes the node fire `processorerror`, which the capture service reports.
function readOptions(processorOptions) {
  const options = processorOptions ?? {};
  const windowSamples = positiveInteger(options, 'windowSamples');
  const hopSamples = positiveInteger(options, 'hopSamples');
  if (hopSamples > windowSamples) throw invalidOption('hopSamples');
  const targetPeak = positiveNumber(options, 'targetPeak');
  if (targetPeak > FULL_SCALE) throw invalidOption('targetPeak');
  const silenceThreshold = options.silenceThreshold;
  if (typeof silenceThreshold !== 'number' || !Number.isFinite(silenceThreshold) || silenceThreshold < 0 ||
      silenceThreshold >= targetPeak) {
    throw invalidOption('silenceThreshold');
  }
  return {
    targetSampleRate: positiveNumber(options, 'targetSampleRate'),
    windowSamples,
    hopSamples,
    levelReportIntervalSec: positiveNumber(options, 'levelReportIntervalSec'),
    silenceThreshold,
    targetPeak,
  };
}

class StreamingResampler {
  constructor(sourceSampleRate, targetSampleRate) {
    this.sourceSampleRate = sourceSampleRate;
    this.targetSampleRate = targetSampleRate;
    this.ratio = sourceSampleRate / targetSampleRate;
    this.phase = 0;
    this.lastSample = 0;
  }

  processChunk(input) {
    const inputLen = input.length;
    if (inputLen === 0) return new Float32Array(0);
    if (this.sourceSampleRate === this.targetSampleRate) {
      return input;
    }

    const ratio = this.ratio;
    const maxSamples = Math.max(0, Math.ceil((inputLen - this.phase) / ratio) + 2);
    const output = new Float32Array(maxSamples);
    let outIdx = 0;
    let pos = this.phase;

    while (pos <= inputLen - 1) {
      let sample;
      if (pos < 0) {
        const frac = pos + 1;
        sample = this.lastSample + frac * (input[0] - this.lastSample);
      } else {
        const indexLow = Math.floor(pos);
        const frac = pos - indexLow;
        if (frac === 0 || indexLow >= inputLen - 1) {
          sample = input[indexLow];
        } else {
          sample = input[indexLow] + frac * (input[indexLow + 1] - input[indexLow]);
        }
      }
      output[outIdx++] = sample;
      pos += ratio;
    }

    this.lastSample = input[inputLen - 1];
    this.phase = pos - inputLen;

    return outIdx === output.length ? output : output.subarray(0, outIdx);
  }

  reset() {
    this.phase = 0;
    this.lastSample = 0;
  }
}

class AudioWindowProcessor extends AudioWorkletProcessor {
  constructor(nodeOptions) {
    super();
    const options = readOptions(nodeOptions?.processorOptions);
    this.targetSampleRate = options.targetSampleRate;
    this.windowSamples = options.windowSamples;
    this.hopSamples = options.hopSamples;
    this.silenceThreshold = options.silenceThreshold;
    this.targetPeak = options.targetPeak;
    this.sourceSampleRate = sampleRate; // AudioWorkletGlobalScope sampleRate
    this.needsResample = this.sourceSampleRate !== this.targetSampleRate;
    if (this.needsResample) {
      this.resampler = new StreamingResampler(this.sourceSampleRate, this.targetSampleRate);
    }

    this.ringBuffer = new Float32Array(this.windowSamples);
    this.samplesAccumulatedTotal = 0;
    this.samplesSinceLastWindow = 0;
    this.windowIndex = 0;

    this.windowInFlight = false;
    this.windowPending = null;
    this.droppedWindows = 0;
    this.port.onmessage = (event) => {
      if (event.data.type !== MESSAGE_TYPES.windowAck) return;
      this.windowInFlight = false;
      if (this.windowPending) {
        const next = this.windowPending;
        this.windowPending = null;
        this.sendWindow(next);
      }
    };

    this.levelSampleCount = 0;
    this.levelSumSquares = 0;
    this.levelPeak = 0;
    this.levelInterval = Math.floor(sampleRate * options.levelReportIntervalSec);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const chunk = input[0];
    const chunkLen = chunk.length;

    // Level metrics
    for (let i = 0; i < chunkLen; i++) {
      const val = chunk[i];
      const abs = Math.abs(val);
      if (abs > this.levelPeak) this.levelPeak = abs;
      this.levelSumSquares += val * val;
    }
    this.levelSampleCount += chunkLen;

    if (this.levelSampleCount >= this.levelInterval) {
      const rms = Math.sqrt(this.levelSumSquares / this.levelSampleCount);
      this.port.postMessage({
        type: MESSAGE_TYPES.levelUpdate,
        rms,
        peak: this.levelPeak
      });
      this.levelSampleCount = 0;
      this.levelSumSquares = 0;
      this.levelPeak = 0;
    }

    // Resample when the context does not run at the target rate
    const processedChunk = this.needsResample ? this.resampler.processChunk(chunk) : chunk;
    const processedLen = processedChunk.length;
    if (processedLen === 0) return true;

    // Update the ring buffer with target-rate samples
    if (processedLen >= this.windowSamples) {
      this.ringBuffer.set(processedChunk.subarray(processedLen - this.windowSamples));
    } else {
      this.ringBuffer.copyWithin(0, processedLen);
      this.ringBuffer.set(processedChunk, this.windowSamples - processedLen);
    }

    this.samplesAccumulatedTotal += processedLen;
    this.samplesSinceLastWindow += processedLen;

    const canEmitFirst = this.windowIndex === 0 && this.samplesAccumulatedTotal >= this.windowSamples;
    const canEmitNext = this.windowIndex > 0 && this.samplesSinceLastWindow >= this.hopSamples;

    if (canEmitFirst || canEmitNext) {
      // Normalize a copy that can be transferred
      const windowBuf = new Float32Array(this.windowSamples);
      windowBuf.set(this.ringBuffer);

      let mean = 0;
      for (let i = 0; i < this.windowSamples; i++) mean += windowBuf[i];
      mean /= this.windowSamples;
      let peak = 0;
      for (let i = 0; i < this.windowSamples; i++) {
        windowBuf[i] -= mean;
        const abs = Math.abs(windowBuf[i]);
        if (abs > peak) peak = abs;
      }
      if (peak > this.silenceThreshold) {
        const factor = this.targetPeak / peak;
        for (let i = 0; i < this.windowSamples; i++) {
          windowBuf[i] *= factor;
        }
      }

      const message = {
          type: MESSAGE_TYPES.windowReady,
          buffer: windowBuf,
          windowIndex: this.windowIndex,
          timestamp: currentTime,
          sampleRate: this.targetSampleRate
      };
      if (this.windowInFlight) {
        if (this.windowPending) this.droppedWindows++;
        this.windowPending = message;
      } else {
        this.sendWindow(message);
      }

      this.windowIndex++;
      this.samplesSinceLastWindow = canEmitFirst
        ? this.samplesAccumulatedTotal - this.windowSamples
        : this.samplesSinceLastWindow - this.hopSamples;
    }

    return true;
  }

  sendWindow(message) {
    this.windowInFlight = true;
    message.droppedWindows = this.droppedWindows;
    this.droppedWindows = 0;
    this.port.postMessage(message, [message.buffer.buffer]);
  }
}

registerProcessor('audio-window-processor', AudioWindowProcessor);
