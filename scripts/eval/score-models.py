"""
Runs acoustic models over an annotated evaluation set and writes what each one heard in every analysis window
(docs/evaluacion.md). The decisions and the metrics are computed afterwards by `report.mjs`, with the same
rules the app applies.

    python scripts/eval/score-models.py --dataset <directory with recordings.csv> --out <output directory>
        [--models birdnet-int8,birdnet-fp32] [--max-seconds 600] [--no-normalize]

Every model is scored on the app's window grid (3 s every 1.5 s). A model with a longer input, such as Perch
(5 s), receives the audio centred on the same instant, so all of them answer for the same moments.
"""
import argparse
import csv
import json
import time
from dataclasses import dataclass
from datetime import datetime
from math import gcd
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf
from scipy.signal import resample_poly

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PUBLIC_MODELS = BASE_DIR / "public" / "models"
# Models that are only evaluated live outside the repository, next to the evaluation sets.
EVAL_MODELS = BASE_DIR.parent / "eval" / "models"

# The app's analysis grid (src/features/audio/dsp/audio.constants.ts).
GRID_WINDOW_SECONDS = 3.0
GRID_HOP_SECONDS = 1.5
# Peak normalization of the capture pipeline (src/features/audio/dsp/normalize.ts): a window whose peak is at or
# under the floor is silence and goes to the model unamplified.
APP_TARGET_PEAK = 0.95
SILENCE_FLOOR = 1e-4

# BirdNET's geographic model as the app uses it (src/features/inference/geoFilter.ts).
GEO_MODEL_FILE = "birdnet_geo_model.onnx"
GEO_THRESHOLD = np.float32(0.03)
GEO_WEEKS_PER_MONTH = 4
GEO_DAYS_PER_WEEK = 7

# Scores under the floor are not written: they cannot become a detection and would only bloat the files.
SCORE_FLOOR = 0.01
MAX_SCORES_PER_WINDOW = 40
SCORE_DECIMALS = 4
BATCH_SIZE = 8
LATENCY_WARMUP_RUNS = 3
LATENCY_RUNS = 20
ONNX_PROVIDERS = ["CPUExecutionProvider"]
MS_PER_S = 1000

RECORDINGS_FILE = "recordings.csv"
VOCABULARY_FILE = "vocabulary.csv"
ALIAS_SEPARATOR = ";"
SCORES_DIR = "scores"
GEO_FILE = "geo.json"


@dataclass(frozen=True)
class ModelSpec:
    """One model under evaluation and how its input and labels are read."""

    path: Path
    labels: Path
    sample_rate: int
    window_seconds: float
    output: str
    # Lines before the first label; Perch's file starts with the name of its taxonomy.
    label_header_lines: int
    # Separator between scientific and common name in a label, when the file carries both.
    label_separator: str | None
    # Peak the model's own pipeline normalizes to; None keeps the level of the app's pipeline.
    target_peak: float | None


BIRDNET = dict(labels=PUBLIC_MODELS / "labels.txt", sample_rate=48_000, window_seconds=3.0, output="output", label_header_lines=0, label_separator="_", target_peak=None)
# Perch normalizes every window to a peak of 0.25 (perch-hoplite, `EmbeddingModel.normalize_audio`).
PERCH = dict(labels=EVAL_MODELS / "perch-v2" / "labels.txt", sample_rate=32_000, window_seconds=5.0, output="label", label_header_lines=1, label_separator=None, target_peak=0.25)
MODELS: dict[str, ModelSpec] = {
    # The model the app ships today.
    "birdnet-int8": ModelSpec(path=PUBLIC_MODELS / "birdnet_model.onnx", **BIRDNET),
    "birdnet-fp32": ModelSpec(path=EVAL_MODELS / "birdnet-v2.4" / "BirdNET_v2.4_fp32_dfttrunc.onnx", **BIRDNET),
    # Written by scripts/eval/store-weights-as-half.py.
    "birdnet-fp16": ModelSpec(path=EVAL_MODELS / "birdnet-v2.4" / "BirdNET_v2.4_fp16_dfttrunc.onnx", **BIRDNET),
    "perch-int8": ModelSpec(path=EVAL_MODELS / "perch-v2" / "perch-v2-int8-arm.onnx", **PERCH),
    "perch-fp32": ModelSpec(path=EVAL_MODELS / "perch-v2" / "perch-v2-fp32.onnx", **PERCH),
}


def read_rows(path: Path) -> list[dict[str, str]]:
    with open(path, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def read_aliases(dataset: Path) -> dict[str, str]:
    """Maps the name a model gives a species to the name the dataset annotates it with."""
    path = dataset / VOCABULARY_FILE
    if not path.exists():
        return {}
    return {alias.strip().lower(): row["scientific_name"] for row in read_rows(path) for alias in row["aliases"].split(ALIAS_SEPARATOR) if alias.strip()}


def read_labels(spec: ModelSpec, aliases: dict[str, str]) -> list[str]:
    lines = [line.strip() for line in spec.labels.read_text(encoding="utf-8").splitlines() if line.strip()][spec.label_header_lines:]
    names = [line.split(spec.label_separator, 1)[0] if spec.label_separator else line for line in lines]
    return [aliases.get(name.lower(), name) for name in names]


def load_audio(path: Path, sample_rate: int, max_seconds: float | None) -> np.ndarray:
    """Mono float32 audio at `sample_rate`, cut to `max_seconds` of the recording when given."""
    info = sf.info(str(path))
    frames = -1 if max_seconds is None else int(max_seconds * info.samplerate)
    data, source_rate = sf.read(str(path), frames=frames, dtype="float32", always_2d=True)
    mono = data.mean(axis=1)
    if source_rate == sample_rate:
        return mono
    divisor = gcd(source_rate, sample_rate)
    return resample_poly(mono, sample_rate // divisor, source_rate // divisor).astype(np.float32)


def normalize_peak(window: np.ndarray, target: float) -> np.ndarray:
    peak = float(np.max(np.abs(window)))
    return window * (target / peak) if peak > SILENCE_FLOOR else window


def grid_centres(duration: float) -> np.ndarray:
    """Centre, in seconds, of every full window the app would analyse in a recording of `duration` seconds."""
    count = int((duration - GRID_WINDOW_SECONDS) // GRID_HOP_SECONDS) + 1 if duration >= GRID_WINDOW_SECONDS else 0
    return np.arange(count) * GRID_HOP_SECONDS + GRID_WINDOW_SECONDS / 2


def model_windows(audio: np.ndarray, spec: ModelSpec, centres: np.ndarray, normalize: bool) -> np.ndarray:
    """The model's input for each grid centre; audio outside the recording is silence."""
    samples = int(spec.sample_rate * spec.window_seconds)
    windows = np.zeros((len(centres), samples), dtype=np.float32)
    for row, centre in enumerate(centres):
        start = int(round(centre * spec.sample_rate)) - samples // 2
        source_from, source_to = max(start, 0), min(start + samples, len(audio))
        if source_to > source_from:
            windows[row, source_from - start:source_to - start] = audio[source_from:source_to]
        if normalize:
            # The app normalizes the window it analyses, so the level is taken from that span even when the model sees more.
            grid_from = int(round((centre - GRID_WINDOW_SECONDS / 2) * spec.sample_rate))
            grid = audio[max(grid_from, 0):grid_from + int(GRID_WINDOW_SECONDS * spec.sample_rate)]
            peak = float(np.max(np.abs(grid))) if len(grid) else 0.0
            if peak > SILENCE_FLOOR:
                windows[row] *= APP_TARGET_PEAK / peak
        if spec.target_peak is not None:
            windows[row] = normalize_peak(windows[row], spec.target_peak)
    return windows


def sigmoid(logits: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-logits.astype(np.float64)))


def sparse_scores(probabilities: np.ndarray, index_of: dict[int, int]) -> list[list[float]]:
    """[species index, score] pairs of one window, highest first, re-indexed into the file's own species list."""
    kept = np.flatnonzero(probabilities >= SCORE_FLOOR)
    kept = kept[np.argsort(-probabilities[kept])][:MAX_SCORES_PER_WINDOW]
    return [[index_of.setdefault(int(label), len(index_of)), round(float(probabilities[label]), SCORE_DECIMALS)] for label in kept]


def measure_latency(session: ort.InferenceSession, spec: ModelSpec, window: np.ndarray) -> dict[str, float]:
    feed = {session.get_inputs()[0].name: window[None, :]}
    for _ in range(LATENCY_WARMUP_RUNS):
        session.run([spec.output], feed)
    timings = []
    for _ in range(LATENCY_RUNS):
        started = time.perf_counter()
        session.run([spec.output], feed)
        timings.append((time.perf_counter() - started) * MS_PER_S)
    return {"mean_ms": round(float(np.mean(timings)), 1), "p95_ms": round(float(np.percentile(timings, 95)), 1)}


def birdnet_week(moment: datetime) -> int:
    """BirdNET's 48-week year: four weeks per month, days 29-31 in the fourth (same rule as `birdnetWeek`)."""
    return (moment.month - 1) * GEO_WEEKS_PER_MONTH + min((moment.day - 1) // GEO_DAYS_PER_WEEK + 1, GEO_WEEKS_PER_MONTH)


def write_geo(recordings: list[dict[str, str]], aliases: dict[str, str], out: Path) -> None:
    """Species the geographic model allows at the place and week of each recording, as the app's filter would."""
    session = ort.InferenceSession(str(PUBLIC_MODELS / GEO_MODEL_FILE), providers=ONNX_PROVIDERS)
    labels = read_labels(MODELS["birdnet-int8"], aliases)
    allowed: dict[str, list[str]] = {}
    for row in recordings:
        if not row["latitude"] or not row["longitude"] or not row["recorded_at"]:
            continue
        week = birdnet_week(datetime.fromisoformat(row["recorded_at"]))
        feed = {session.get_inputs()[0].name: np.array([[float(row["latitude"]), float(row["longitude"]), week]], dtype=np.float32)}
        probabilities = session.run(None, feed)[0][0]
        allowed[row["file"]] = [labels[index] for index in np.flatnonzero(probabilities >= GEO_THRESHOLD)]
    (out / GEO_FILE).write_text(json.dumps(allowed), encoding="utf-8")


def score_model(name: str, spec: ModelSpec, dataset: Path, recordings: list[dict[str, str]], aliases: dict[str, str], out: Path, max_seconds: float | None, normalize: bool) -> None:
    labels = read_labels(spec, aliases)
    session = ort.InferenceSession(str(spec.path), providers=ONNX_PROVIDERS)
    input_name = session.get_inputs()[0].name
    latency: dict[str, float] | None = None
    total_windows = 0
    started = time.perf_counter()
    with open(out / SCORES_DIR / f"{name}.jsonl", "w", encoding="utf-8") as handle:
        for row in recordings:
            audio = load_audio(dataset / row["file"], spec.sample_rate, max_seconds)
            duration = len(audio) / spec.sample_rate
            centres = grid_centres(duration)
            if latency is None and len(centres):
                latency = measure_latency(session, spec, model_windows(audio, spec, centres[len(centres) // 2:len(centres) // 2 + 1], normalize)[0])
            index_of: dict[int, int] = {}
            scored: list[list[list[float]]] = []
            # Windows are cut batch by batch: an hour of them at once would take over a gigabyte.
            for offset in range(0, len(centres), BATCH_SIZE):
                windows = model_windows(audio, spec, centres[offset:offset + BATCH_SIZE], normalize)
                logits = session.run([spec.output], {input_name: windows})[0]
                scored.extend(sparse_scores(row_probabilities, index_of) for row_probabilities in sigmoid(logits))
            species = [labels[label] for label, _ in sorted(index_of.items(), key=lambda item: item[1])]
            handle.write(json.dumps({"recording": row["file"], "duration": round(duration, 3), "species": species, "windows": scored}) + "\n")
            total_windows += len(centres)
            print(f"  {name}: {row['file']} ({len(centres)} windows)", flush=True)
    meta = {
        "model": name, "file": spec.path.name, "size_bytes": spec.path.stat().st_size, "sample_rate": spec.sample_rate,
        "window_seconds": spec.window_seconds, "labels": len(labels), "grid_window_seconds": GRID_WINDOW_SECONDS,
        "grid_hop_seconds": GRID_HOP_SECONDS, "score_floor": SCORE_FLOOR, "app_normalization": normalize, "latency": latency,
        "windows": total_windows, "max_seconds": max_seconds, "scoring_seconds": round(time.perf_counter() - started),
    }
    (out / SCORES_DIR / f"{name}.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", type=Path, required=True, help="directory with recordings.csv")
    parser.add_argument("--out", type=Path, required=True, help="directory the scores are written to")
    parser.add_argument("--models", default=",".join(MODELS), help=f"comma-separated subset of: {', '.join(MODELS)}")
    parser.add_argument("--max-seconds", type=float, default=None, help="score only the first seconds of each recording")
    parser.add_argument("--no-normalize", action="store_true", help="skip the app's per-window peak normalization")
    arguments = parser.parse_args()

    dataset = arguments.dataset.resolve()
    recordings = read_rows(dataset / RECORDINGS_FILE)
    aliases = read_aliases(dataset)
    (arguments.out / SCORES_DIR).mkdir(parents=True, exist_ok=True)
    write_geo(recordings, aliases, arguments.out)
    for name in arguments.models.split(","):
        if name not in MODELS:
            raise SystemExit(f"Unknown model: {name}")
        if not MODELS[name].path.exists():
            print(f"[SKIP] {name}: {MODELS[name].path} is missing")
            continue
        score_model(name, MODELS[name], dataset, recordings, aliases, arguments.out, arguments.max_seconds, not arguments.no_normalize)
    print(f"[OK] scores written to {arguments.out}")


if __name__ == "__main__":
    main()
