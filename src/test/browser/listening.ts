import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';
import metadata from '../../../public/test-audio/metadata.json';
import '../../index.css';

const status = document.querySelector<HTMLOutputElement>('#reference-status');
const select = document.querySelector<HTMLSelectElement>('#reference-audio');
const root = document.getElementById('root');
if (!status || !select || !root) throw new Error('Missing browser test controls.');

let longTasks = 0;
let longestTaskMs = 0;
let listeningStartedAt = Infinity;
if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
  new PerformanceObserver((list) => {
    if (!document.querySelector('button[aria-label="Detener escucha"]') || !status.textContent.startsWith('Audio activo:')) return;
    for (const task of list.getEntries()) {
      if (task.startTime < listeningStartedAt) continue;
      longTasks++;
      longestTaskMs = Math.max(longestTaskMs, task.duration);
    }
    const output = document.getElementById('main-thread-tasks');
    if (output) output.textContent = `Tareas largas durante la escucha: ${String(longTasks)}; máxima: ${String(Math.round(longestTaskMs))} ms`;
  }).observe({ type: 'longtask', buffered: false });
}

/** Replace only the test page microphone with a local reference recording. */
navigator.mediaDevices.getUserMedia = async (): Promise<MediaStream> => {
  const reference = metadata[Number(select.value)];
  if (!reference) throw new Error('Unknown reference recording.');
  const response = await fetch(`/test-audio/${reference.filename}`);
  if (!response.ok) throw new Error('Reference recording is missing.');
  const context = new AudioContext({ sampleRate: 48000 });
  try {
    const audio = await context.decodeAudioData(await response.arrayBuffer());
    const source = context.createBufferSource();
    const destination = context.createMediaStreamDestination();
    source.buffer = audio;
    source.loop = true;
    source.loopStart = reference.best_window_offset_sec;
    source.loopEnd = reference.best_window_offset_sec + 3;
    source.connect(destination);
    source.start(0, reference.best_window_offset_sec);
    await context.resume();
    for (const track of destination.stream.getTracks()) {
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        source.stop();
        void context.close().catch(() => { status.textContent = 'Error al cerrar el audio de referencia'; });
      };
    }
    status.textContent = `Audio activo: ${reference.species_scientific}`;
    longTasks = 0;
    longestTaskMs = 0;
    listeningStartedAt = performance.now();
    const output = document.getElementById('main-thread-tasks');
    if (output) output.textContent = 'Tareas largas durante la escucha: 0';
    return destination.stream;
  } catch (error) {
    await context.close();
    throw error;
  }
};

createRoot(root).render(createElement(App));
