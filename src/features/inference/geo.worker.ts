import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { GEO_INPUT_FEATURES, geoInput, rankRegion } from './geoFilter';
import { INPUT_BATCH_SIZE, WASM_NUM_THREADS, createSessionOptions } from './inference.constants';
import { parseLabel, parseLabelsFile } from './inferenceResults';
import type { RegionRequest, RegionResponse } from './regionSpecies.types';

/**
 * Ranks the species likely at a place and week with BirdNET's geographic model (ADR-18), for the album and the
 * regional guide. It runs in its own short-lived worker so the page never loads ONNX Runtime on the main thread.
 */
ort.env.wasm.numThreads = WASM_NUM_THREADS;
ort.env.wasm.wasmPaths = {
  wasm: new URL(wasmUrl, self.location.href).href,
  mjs: new URL(wasmModuleUrl, self.location.href).href,
};

function reply(message: RegionResponse): void {
  (self as unknown as { postMessage: (message: RegionResponse) => void }).postMessage(message);
}

async function rank(request: RegionRequest): Promise<RegionResponse> {
  const labelsResponse = await fetch(request.labelsUrl);
  if (!labelsResponse.ok) throw new Error('Labels could not be downloaded.');
  const labels = parseLabelsFile(await labelsResponse.text());
  const session = await ort.InferenceSession.create(request.geoModelUrl, createSessionOptions());
  try {
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (!inputName || !outputName) throw new Error('Incompatible geographic model.');
    const input = new ort.Tensor('float32', geoInput(request.location, request.week), [INPUT_BATCH_SIZE, GEO_INPUT_FEATURES]);
    try {
      const output = (await session.run({ [inputName]: input }))[outputName];
      try {
        if (!output || !(output.data instanceof Float32Array) || output.data.length !== labels.length) throw new Error('Invalid geographic output.');
        const probabilities = output.data;
        const species = rankRegion(probabilities, request.limit).map((index) => ({
          ...parseLabel(labels[index] ?? ''), probability: probabilities[index] ?? 0,
        }));
        return { ok: true, species };
      } finally { output?.dispose(); }
    } finally { input.dispose(); }
  } finally { await session.release(); }
}

self.onmessage = (event: MessageEvent<RegionRequest>): void => {
  rank(event.data).then(reply).catch(() => { reply({ ok: false }); });
};
