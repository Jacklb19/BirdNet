"""
Explores ideas on scores that `score-models.py` already wrote, before any of them is built into the app
(docs/evaluacion.md, the rows marked with a dagger).

    python scripts/eval/explore.py rules --dataset <dir> --scores <dir> [--model birdnet-int8] [--geo <geo.json>]
    python scripts/eval/explore.py second-opinion --dataset <dir> --scores <dir> --second-scores <dir> --second <model>
    python scripts/eval/explore.py combine --dataset <dir> --scores <dir> --second-scores <dir> --second <model>

- `rules`: decision rules the app does not have (memory of the session, only the top birds of a window, stricter
  thresholds) next to the ones it has, and optionally another file of species allowed per recording (`--geo`), to
  try another geographic filter on the same scores.
- `second-opinion`: of the doubtful detections of one model, how many a second model backs and how often it is right.
- `combine`: two models deciding together in several ways, each with its own geographic filter.

The scoring repeats in Python what `metrics.ts` does (stretches of fifteen seconds, three of tolerance), so the
single-window row of `rules` must match `report.mjs`; the numbers of record are the ones of `report.mjs`. An idea
that holds here still has to be written in the app and added to `report.mjs` before it counts.
"""
import argparse
import json
import math
from pathlib import Path
from typing import Callable

# Stretch scoring and thresholds, as in report.mjs and src/config/contract.ts.
STRETCH_SECONDS = 15.0
MARGIN_SECONDS = 3.0
MIN_OVERLAP_SECONDS = 1.0
KEPT = 0.45
CONFIRMED = 0.80
SWEEP = [step / 20 for step in range(1, 20)]
SCORES_DIR = "scores"
GEO_FILE = "geo.json"
LABELS_SUFFIX = ".txt"
UNCERTAIN_SUFFIX = "?"
# Audacity writes the frequency range of a selection on a second line that starts with a backslash.
SPECTRAL_LINE_PREFIX = "\\"

Window = dict[str, float]
Truth = list[tuple[set[str], set[str]]]


def read_scores(directory: Path, model: str) -> tuple[dict, dict[str, dict]]:
    meta = json.loads((directory / SCORES_DIR / f"{model}.json").read_text(encoding="utf-8"))
    recordings = {}
    with open(directory / SCORES_DIR / f"{model}.jsonl", encoding="utf-8") as handle:
        for raw in handle:
            line = json.loads(raw)
            recordings[line["recording"]] = line
    return meta, recordings


def read_geo(path: Path) -> dict[str, set[str]]:
    return {recording: set(allowed) for recording, allowed in json.loads(path.read_text(encoding="utf-8")).items()}


def read_annotations(dataset: Path, recording: str) -> list[tuple[float, float, str, bool]]:
    """(start, end, species, uncertain) of every labelled sound of a recording."""
    annotations = []
    for raw in (dataset / recording).with_suffix(LABELS_SUFFIX).read_text(encoding="utf-8").splitlines():
        fields = raw.split("\t")
        if len(fields) < 3 or raw.startswith(SPECTRAL_LINE_PREFIX):
            continue
        label = fields[2].strip()
        annotations.append((float(fields[0].replace(",", ".")), float(fields[1].replace(",", ".")), label.rstrip(UNCERTAIN_SUFFIX).strip(), label.endswith(UNCERTAIN_SUFFIX)))
    return annotations


def stretch_truth(annotations: list[tuple[float, float, str, bool]], duration: float) -> Truth:
    """Per stretch: the species the detector should report, and those whose report counts neither way."""
    truth: Truth = []
    for index in range(math.ceil(duration / STRETCH_SECONDS)):
        start, end = index * STRETCH_SECONDS, min((index + 1) * STRETCH_SECONDS, duration)
        present: set[str] = set()
        tolerated: set[str] = set()
        for sound_start, sound_end, species, uncertain in annotations:
            overlap = min(sound_end, end) - max(sound_start, start)
            demanded = overlap >= min(MIN_OVERLAP_SECONDS, sound_end - sound_start) and (overlap > 0 or start <= sound_start < end)
            if demanded and not uncertain:
                present.add(species)
            elif sound_end >= start - MARGIN_SECONDS and sound_start <= end + MARGIN_SECONDS:
                tolerated.add(species)
        truth.append((present, tolerated - present))
    return truth


def windows_of(line: dict, allowed: set[str] | None) -> list[Window]:
    return [{line["species"][index]: score for index, score in window if allowed is None or line["species"][index] in allowed} for window in line["windows"]]


def stretch_scores(windows: list[Window], meta: dict, stretches: int) -> list[Window]:
    """Highest confidence each species reached in every stretch."""
    scores: list[Window] = [{} for _ in range(stretches)]
    for index, window in enumerate(windows):
        time = index * meta["grid_hop_seconds"] + meta["grid_window_seconds"] / 2
        stretch = scores[min(max(int(time // STRETCH_SECONDS), 0), stretches - 1)]
        for species, confidence in window.items():
            if confidence > stretch.get(species, 0.0):
                stretch[species] = confidence
    return scores


def count(truth: Truth, scores: list[Window], threshold: float) -> tuple[int, int, int]:
    hits = false_alarms = misses = 0
    for (present, tolerated), reported in zip(truth, scores):
        for species, score in reported.items():
            if score >= threshold:
                if species in present:
                    hits += 1
                elif species not in tolerated:
                    false_alarms += 1
        misses += sum(1 for species in present if reported.get(species, 0.0) < threshold)
    return hits, false_alarms, misses


def rates(hits: int, false_alarms: int, misses: int) -> tuple[float, float, float]:
    precision = hits / (hits + false_alarms) if hits + false_alarms else 0.0
    recall = hits / (hits + misses) if hits + misses else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return 100 * precision, 100 * recall, 100 * f1


def average_precision(samples: list[tuple[float, bool]]) -> float | None:
    positives = sum(1 for _, positive in samples if positive)
    if not positives:
        return None
    ranked = sorted((sample for sample in samples if sample[0] > 0), key=lambda sample: (-sample[0], sample[1]))
    found = total = 0.0
    for rank, (_, positive) in enumerate(ranked, start=1):
        if positive:
            found += 1
            total += found / rank
    return total / positives


def pool(windows: list[Window], span: int = 2, stands_from: float | None = CONFIRMED) -> list[Window]:
    """The app's rule (windowPooling.ts): the mean of the last windows, unless the newest alone is already sure."""
    pooled = []
    for index, current in enumerate(windows):
        recent = windows[max(0, index - span + 1): index + 1]
        scores = {}
        for species in set().union(*recent):
            own = current.get(species, 0.0)
            scores[species] = own if stands_from is not None and own >= stands_from else sum(window.get(species, 0.0) for window in recent) / len(recent)
        pooled.append(scores)
    return pooled


def with_memory(windows: list[Window], hop: float, known_from: float, forgets_after: float | None = None) -> list[Window]:
    """A species already confirmed in the session is kept from a lower confidence afterwards (only what came before counts)."""
    confirmed_at: dict[str, float] = {}
    remembered = []
    for index, scores in enumerate(windows):
        now = index * hop
        adjusted = {}
        for species, confidence in scores.items():
            since = confirmed_at.get(species)
            familiar = since is not None and (forgets_after is None or now - since <= forgets_after)
            adjusted[species] = KEPT if familiar and known_from <= confidence < KEPT else confidence
        for species, confidence in scores.items():
            if confidence >= CONFIRMED:
                confirmed_at[species] = now
        remembered.append(adjusted)
    return remembered


def top_only(windows: list[Window], top: int) -> list[Window]:
    return [dict(sorted(scores.items(), key=lambda item: -item[1])[:top]) for scores in windows]


def from_threshold(windows: list[Window], floor: float) -> list[Window]:
    return [{species: score for species, score in scores.items() if score >= floor} for scores in windows]


class Evaluation:
    """Scores of one way of deciding over every recording of a set."""

    def __init__(self) -> None:
        self.sweep = [[0, 0, 0] for _ in SWEEP]
        self.confirmed = [0, 0, 0]
        self.samples: dict[str, list[tuple[float, bool]]] = {}
        self.found = self.missed = self.invented = 0
        self.hours = 0.0

    def add(self, annotations: list[tuple[float, float, str, bool]], truth: Truth, windows: list[Window], meta: dict, duration: float) -> None:
        scores = stretch_scores(windows, meta, len(truth))
        for position, threshold in enumerate(SWEEP):
            for slot, value in enumerate(count(truth, scores, threshold)):
                self.sweep[position][slot] += value
        for slot, value in enumerate(count(truth, scores, CONFIRMED)):
            self.confirmed[slot] += value
        for (present, tolerated), reported in zip(truth, scores):
            for species in present:
                self.samples.setdefault(species, []).append((reported.get(species, 0.0), True))
            for species, score in reported.items():
                if species not in present and species not in tolerated:
                    self.samples.setdefault(species, []).append((score, False))
        certain = {species for _, _, species, uncertain in annotations if not uncertain}
        mentioned = {species for _, _, species, _ in annotations}
        reported_species = {species for window in windows for species, score in window.items() if score >= KEPT}
        self.found += len(reported_species & certain)
        self.missed += len(certain - reported_species)
        self.invented += len(reported_species - mentioned)
        self.hours += duration / 3600

    def row(self, name: str) -> str:
        precisions = [value for value in map(average_precision, self.samples.values()) if value is not None]
        best = max(range(len(SWEEP)), key=lambda position: rates(*self.sweep[position])[2])
        kept = self.sweep[SWEEP.index(KEPT)]
        precision, recall, f1 = rates(*kept)
        confirmed_precision, confirmed_recall, _ = rates(*self.confirmed)
        mean_ap = 100 * sum(precisions) / len(precisions) if precisions else 0.0
        return (f"{name:44s} | {mean_ap:4.1f} | {rates(*self.sweep[best])[2]:5.1f} ({SWEEP[best]:.2f}) | {precision:5.1f} {recall:5.1f} {f1:5.1f} | "
                f"{confirmed_precision:5.1f} {confirmed_recall:5.1f} | {kept[1] / self.hours:6.1f} | {self.found:4d}/{self.missed:4d}/{self.invented:4d}")


HEADER = f"{'':44s} |  mAP | best F1 (thr) | kept: P    R    F1 | conf.: P   R | FA/h   | found/missed/invented"


def evaluate(name: str, dataset: Path, meta: dict, recordings: dict[str, dict], decide: Callable[[str, dict], list[Window]]) -> None:
    evaluation = Evaluation()
    for recording, line in recordings.items():
        annotations = read_annotations(dataset, recording)
        evaluation.add(annotations, stretch_truth(annotations, line["duration"]), decide(recording, line), meta, line["duration"])
    print(evaluation.row(name))


def explore_rules(arguments: argparse.Namespace) -> None:
    meta, recordings = read_scores(arguments.scores, arguments.model)
    geo = read_geo(arguments.geo or arguments.scores / GEO_FILE)
    hop = meta["grid_hop_seconds"]

    def rule(name: str, transform: Callable[[list[Window]], list[Window]]) -> None:
        evaluate(name, arguments.dataset, meta, recordings, lambda recording, line: transform(windows_of(line, geo.get(recording))))

    print(f"{arguments.model}, {len(recordings)} recordings, species allowed by {arguments.geo or GEO_FILE}")
    print(HEADER)
    rule("single window", lambda windows: windows)
    rule("mean of 2, sure stands (the app's careful rule)", pool)
    for known_from in (0.35, 0.30, 0.25, 0.20):
        rule(f"careful + memory, known from {known_from:.2f}", lambda windows, floor=known_from: with_memory(pool(windows), hop, floor))
    for minutes in (2, 5, 15):
        rule(f"careful + memory 0.20, forgets after {minutes} min", lambda windows, span=minutes: with_memory(pool(windows), hop, 0.20, 60 * span))
    for top in (1, 2, 3):
        rule(f"careful, top {top} per window", lambda windows, limit=top: top_only(pool(windows), limit))
    for floor in (0.50, 0.55, 0.60, 0.65, 0.70):
        rule(f"single window, kept from {floor:.2f}", lambda windows, threshold=floor: from_threshold(windows, threshold))
    for stands in (0.50, 0.60, 0.70):
        rule(f"mean of 2, stands from {stands:.2f}", lambda windows, threshold=stands: pool(windows, 2, threshold))
    rule("mean of 3, sure stands", lambda windows: pool(windows, 3))


def explore_second_opinion(arguments: argparse.Namespace) -> None:
    meta, first = read_scores(arguments.scores, arguments.model)
    second_meta, second = read_scores(arguments.second_scores, arguments.second)
    geo = read_geo(arguments.scores / GEO_FILE)
    doubtful: list[tuple[bool, float]] = []
    for recording, line in first.items():
        if recording not in second:
            continue
        truth = stretch_truth(read_annotations(arguments.dataset, recording), line["duration"])
        ours = stretch_scores(pool(windows_of(line, geo.get(recording))), meta, len(truth))
        theirs = stretch_scores(windows_of(second[recording], None), second_meta, len(truth))
        for index, (present, tolerated) in enumerate(truth):
            for species, confidence in ours[index].items():
                if KEPT <= confidence < CONFIRMED and species not in tolerated:
                    doubtful.append((species in present, theirs[index].get(species, 0.0)))
    right = sum(1 for correct, _ in doubtful if correct)
    print(f"{arguments.model} keeps {len(doubtful)} doubtful detections ({KEPT} to {CONFIRMED}); {100 * right / len(doubtful):.1f} % are right")
    print(f"{arguments.second} backs it from | backed: right wrong precision | share of the right ones | not backed: right wrong precision")
    for threshold in (0.01, 0.05, 0.10, 0.20, 0.30, 0.50, 0.70, 0.90):
        backed_right = sum(1 for correct, score in doubtful if correct and score >= threshold)
        backed_wrong = sum(1 for correct, score in doubtful if not correct and score >= threshold)
        other_right, other_wrong = right - backed_right, len(doubtful) - right - backed_wrong
        backed = 100 * backed_right / (backed_right + backed_wrong) if backed_right + backed_wrong else float("nan")
        other = 100 * other_right / (other_right + other_wrong) if other_right + other_wrong else float("nan")
        print(f"{threshold:26.2f} | {backed_right:6d} {backed_wrong:5d} {backed:8.1f} | {100 * backed_right / right:22.1f} | {other_right:6d} {other_wrong:5d} {other:8.1f}")


def explore_combinations(arguments: argparse.Namespace) -> None:
    meta, first = read_scores(arguments.scores, arguments.model)
    second_meta, second = read_scores(arguments.second_scores, arguments.second)
    if meta["grid_hop_seconds"] != second_meta["grid_hop_seconds"]:
        raise SystemExit("The two models were not scored on the same grid.")
    first_geo, second_geo = read_geo(arguments.scores / GEO_FILE), read_geo(arguments.second_scores / GEO_FILE)
    shared = {recording: line for recording, line in first.items() if recording in second}
    combinations: dict[str, Callable[[float, float], float]] = {
        f"{arguments.model} alone": lambda ours, theirs: ours,
        f"{arguments.second} alone": lambda ours, theirs: theirs,
        "mean (what the app does with both)": lambda ours, theirs: (ours + theirs) / 2,
        "0.7 of the first + 0.3 of the second": lambda ours, theirs: 0.7 * ours + 0.3 * theirs,
        "geometric mean": lambda ours, theirs: math.sqrt(ours * theirs),
        "the higher of the two": max,
    }
    print(f"{len(shared)} recordings scored by both models, each with its own geographic filter")
    print(HEADER)
    for name, combine in combinations.items():
        def decide(recording: str, line: dict, combine: Callable[[float, float], float] = combine) -> list[Window]:
            ours = windows_of(line, first_geo.get(recording))
            theirs = windows_of(second[recording], second_geo.get(recording))
            combined = []
            for mine, other in zip(ours, theirs):
                window = {species: combine(mine.get(species, 0.0), other.get(species, 0.0)) for species in set(mine) | set(other)}
                combined.append({species: score for species, score in window.items() if score > 0})
            return combined
        evaluate(name, arguments.dataset, meta, shared, decide)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    for name, run in (("rules", explore_rules), ("second-opinion", explore_second_opinion), ("combine", explore_combinations)):
        command = commands.add_parser(name)
        command.set_defaults(run=run)
        command.add_argument("--dataset", type=Path, required=True, help="directory with the recordings and their label tracks")
        command.add_argument("--scores", type=Path, required=True, help="output directory of score-models.py")
        command.add_argument("--model", default="birdnet-int8", help="model whose scores are explored")
        if name == "rules":
            command.add_argument("--geo", type=Path, default=None, help="species allowed per recording, instead of the geo.json next to the scores")
        else:
            command.add_argument("--second-scores", type=Path, required=True, help="output directory of score-models.py with the second model")
            command.add_argument("--second", required=True, help="the second model")
    arguments = parser.parse_args()
    arguments.run(arguments)


if __name__ == "__main__":
    main()
