"""
Prepares the BirdNET+ V3.0 developer preview models for the browser (docs/decisiones.md, ADR-31).

Source: the model files the official BirdNET Live app ships
(https://github.com/birdnet-team/birdnet-live-app, assets/models/, weights under Apache-2.0 per its
MODEL_LICENSE): the acoustic classifier "Global 10K-pruned FP16" (9,789 classes of birds, amphibians,
mammals and insects) and the geographic model "Geomodel V3.0.4 Global 10K-pruned FP16". Put the four
files of SOURCE_FILES, with the names the repository gives them, in tmp/models/birdnet-plus/ and run,
from the frontend root:

    pip install onnx==1.16.2 onnxruntime==1.20.1 numpy==1.26.4
    python scripts/prepare-birdnet-plus.py

It writes into public/models/:

- birdnet_geo_model_v3.onnx: the V3 geographic model with its outputs reordered to the labels of the
  acoustic model the app ships (BirdNET v2.4, labels.txt), so it replaces the v2.4 geographic model as an
  element-wise mask. Measured on annotated recordings (docs/evaluacion.md), the v2.4 geographic model
  excludes about half of the species annotated in high Andean forest; this one excludes almost none.
- birdnet_plus_model.part1.onnx, birdnet_plus_model.part2.onnx: the V3 classifier cut down to its bird
  classes and to one output of logits, which is the contract of the app's inference worker. It is split
  because Supabase Free stores files of up to 50 MB; the app joins the parts and checks the hash of the whole.
- birdnet_plus_labels.txt: the labels of those classes, `<scientific name>_<common name>`.
- birdnet_plus_geo_model.onnx: the V3 geographic model reordered to those labels.

A species is matched between the two families by scientific name and, when the taxonomies name it
differently, by English common name. A bird of BirdNET+ matched that way keeps the scientific name the app
already uses, so its Spanish name, photo and past records still line up. A v2.4 class the V3 geographic
model does not know (its non-bird sounds and a few renamed species) gets probability zero.

The script prints the sizes and hashes that go into public/models/manifest.json and into the API's
birdnet_api/model_manifest.json.
"""

import hashlib
import json
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper

# Paths mirror build.config.mjs (TMP_DIR, PUBLIC_DIR, MODEL_ASSETS_DIR), which Python cannot import.
BASE_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = BASE_DIR / "tmp" / "models" / "birdnet-plus"
PUBLIC_MODELS = BASE_DIR / "public" / "models"

CLASSIFIER_FILE = "BirdNET+_V3.0-preview3.1_Global_10K-pruned_FP16.onnx"
CLASSIFIER_LABELS_FILE = "BirdNET+_V3.0-preview3.1_Global_10K-pruned_Labels.csv"
GEO_FILE = "BirdNET+_Geomodel_V3.0.4_Global_10K-pruned_FP16.onnx"
GEO_LABELS_FILE = "BirdNET+_Geomodel_V3.0.4_Global_10K-pruned_Labels.txt"
# SHA-256 of the files this script was validated with.
SOURCE_FILES = {
    CLASSIFIER_FILE: "306e74f3edc5b95acc6e87ea7f3f1c701fdc0b18ec868b7615208cd6fc2f9457",
    CLASSIFIER_LABELS_FILE: None,
    GEO_FILE: "198adb7bcb3cf03341ffa51fbfa7b2d295e5cd900ba09183dcfdbf6d12b5c63b",
    GEO_LABELS_FILE: None,
}

APP_LABELS_FILE = "labels.txt"
APP_GEO_FILE = "birdnet_geo_model_v3.onnx"
PLUS_MODEL_PARTS = ("birdnet_plus_model.part1.onnx", "birdnet_plus_model.part2.onnx")
PLUS_LABELS_FILE = "birdnet_plus_labels.txt"
PLUS_GEO_FILE = "birdnet_plus_geo_model.onnx"
PLUS_MODEL_ID = "birdnet-plus-v3.0-preview3.1"
PLUS_VARIANT = "global-10k-pruned-fp16-birds"

# Labels of the app are "<scientific name>_<common name>" (inference.constants.ts, MODEL_LABEL_SEPARATOR).
LABEL_SEPARATOR = "_"
# classifier-labels.csv: idx;id;sci_name;com_name;class;order, with a header line.
CSV_SEPARATOR = ";"
CSV_SCIENTIFIC, CSV_COMMON, CSV_CLASS = 2, 3, 4
BIRD_CLASS = "Aves"
# geomodel labels: id<TAB>scientific name<TAB>common name.
GEO_SEPARATOR = "\t"
GEO_SCIENTIFIC, GEO_COMMON = 1, 2

# The app analyses three seconds; BirdNET+ takes them at 32 kHz.
PLUS_SAMPLE_RATE = 32_000
WINDOW_SECONDS = 3.0
# Largest file Supabase Free stores (docs/despliegue.md); each part must stay under it.
MAX_PART_BYTES = 50 * 1024 * 1024

GEO_OUTPUT_NAME = "species_probs"
LOGITS_OUTPUT_NAME = "logits"
UNKNOWN_PROBABILITY = 0.0
LOCATION_FILTER_THRESHOLD = 0.03
# Rewiring the graphs must not change what they compute.
MAX_ABS_DIFF = 1e-5
REGION = {"name": "Bogotá", "latitude": 4.70, "longitude": -74.07}
VALIDATION_POINTS = np.array([
    [REGION["latitude"], REGION["longitude"], 1], [REGION["latitude"], REGION["longitude"], 20],
    [REGION["latitude"], REGION["longitude"], 40], [6.43, -75.54, 16], [4.63, -75.46, 12],
    [10.11, -84.52, 37], [40.42, -3.70, 20], [-33.87, 151.21, 44],
], dtype=np.float32)
# Bogotá residents that any sensible prediction for the region must include.
EXPECTED_BOGOTA_SPECIES = ("Turdus fuscater", "Zonotrichia capensis")
ONNX_PROVIDERS = ["CPUExecutionProvider"]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_lines(path: Path) -> list[str]:
    return [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def producer_of(model: onnx.ModelProto, tensor: str) -> onnx.NodeProto:
    for node in model.graph.node:
        if tensor in node.output:
            return node
    raise SystemExit(f"No node produces {tensor}")


def prune_to_outputs(model: onnx.ModelProto) -> None:
    """Drops every node and weight the graph outputs no longer depend on."""
    producers = {output: node for node in model.graph.node for output in node.output}
    needed: set[str] = set()
    pending = [output.name for output in model.graph.output]
    kept: list[onnx.NodeProto] = []
    seen: set[int] = set()
    while pending:
        tensor = pending.pop()
        if tensor in needed:
            continue
        needed.add(tensor)
        node = producers.get(tensor)
        if node is not None and id(node) not in seen:
            seen.add(id(node))
            kept.append(node)
            pending.extend(node.input)
    order = {id(node): position for position, node in enumerate(model.graph.node)}
    kept.sort(key=lambda node: order[id(node)])
    del model.graph.node[:]
    model.graph.node.extend(kept)
    weights = [weight for weight in model.graph.initializer if weight.name in needed]
    del model.graph.initializer[:]
    model.graph.initializer.extend(weights)
    del model.graph.value_info[:]


def set_single_output(model: onnx.ModelProto, name: str, classes: int) -> None:
    batch = model.graph.input[0].type.tensor_type.shape.dim[0].dim_param or "batch"
    del model.graph.output[:]
    model.graph.output.append(helper.make_tensor_value_info(name, TensorProto.FLOAT, [batch, classes]))


def reorder_geo(source: Path, indices: list[int]) -> bytes:
    """The geographic model with one output per index, in order; an index of -1 gets UNKNOWN_PROBABILITY."""
    model = onnx.load(str(source))
    probabilities = model.graph.output[0].name
    classes = len(read_lines(SOURCE_DIR / GEO_LABELS_FILE))
    model.graph.initializer.extend([
        numpy_helper.from_array(np.array([0, 0, 0, 1], dtype=np.int64), "unknown_pads"),
        numpy_helper.from_array(np.array(UNKNOWN_PROBABILITY, dtype=np.float32), "unknown_value"),
        numpy_helper.from_array(np.array([classes if index < 0 else index for index in indices], dtype=np.int64), "label_order"),
    ])
    model.graph.node.extend([
        # One extra column after the last species holds the probability of a species the model does not know.
        helper.make_node("Pad", [probabilities, "unknown_pads", "unknown_value"], ["with_unknown"], mode="constant"),
        helper.make_node("Gather", ["with_unknown", "label_order"], [GEO_OUTPUT_NAME], axis=1),
    ])
    set_single_output(model, GEO_OUTPUT_NAME, len(indices))
    onnx.checker.check_model(model)
    return model.SerializeToString()


def birds_only_classifier(source: Path, classes: list[int]) -> bytes:
    """The classifier with a single output: the logits of the given classes, in order."""
    model = onnx.load(str(source))
    sigmoid = producer_of(model, producer_of(model, model.graph.output[0].name).input[0])
    if sigmoid.op_type != "Sigmoid":
        raise SystemExit(f"Unexpected classifier head: {sigmoid.op_type}")
    model.graph.initializer.append(numpy_helper.from_array(np.array(classes, dtype=np.int64), "bird_classes"))
    model.graph.node.extend([
        helper.make_node("Gather", [sigmoid.input[0], "bird_classes"], ["bird_logits"], axis=1),
        # The weights are half precision; the app reads float32.
        helper.make_node("Cast", ["bird_logits"], [LOGITS_OUTPUT_NAME], to=TensorProto.FLOAT),
    ])
    set_single_output(model, LOGITS_OUTPUT_NAME, len(classes))
    prune_to_outputs(model)
    onnx.checker.check_model(model)
    return model.SerializeToString()


def run(model: bytes | Path, feed: np.ndarray) -> np.ndarray:
    session = ort.InferenceSession(model if isinstance(model, bytes) else str(model), providers=ONNX_PROVIDERS)
    return session.run([session.get_outputs()[0].name], {session.get_inputs()[0].name: feed})[0]


def match(names: list[tuple[str, str]], by_scientific: dict[str, int], by_common: dict[str, int]) -> list[int]:
    """Index of each (scientific, common) name in another label list: by scientific name, else by common name."""
    return [by_scientific.get(scientific, by_common.get(common.lower(), -1)) for scientific, common in names]


def main() -> None:
    for name, expected in SOURCE_FILES.items():
        path = SOURCE_DIR / name
        if not path.exists():
            raise SystemExit(f"Missing {path}; see the header of this script for where the files come from.")
        if expected and sha256(path.read_bytes()) != expected:
            raise SystemExit(f"{name} is not the file this script was validated with.")
    PUBLIC_MODELS.mkdir(parents=True, exist_ok=True)

    app_labels = [tuple(line.split(LABEL_SEPARATOR, 1)) for line in read_lines(PUBLIC_MODELS / APP_LABELS_FILE)]
    geo_rows = [line.split(GEO_SEPARATOR) for line in read_lines(SOURCE_DIR / GEO_LABELS_FILE)]
    geo_by_scientific = {row[GEO_SCIENTIFIC]: index for index, row in enumerate(geo_rows)}
    geo_by_common = {row[GEO_COMMON].lower(): index for index, row in enumerate(geo_rows)}
    classifier_rows = [line.split(CSV_SEPARATOR) for line in read_lines(SOURCE_DIR / CLASSIFIER_LABELS_FILE)[1:]]
    birds = [index for index, row in enumerate(classifier_rows) if row[CSV_CLASS] == BIRD_CLASS]

    # 1. The V3 geographic model as the filter of the acoustic model the app ships.
    app_order = match(app_labels, geo_by_scientific, geo_by_common)
    app_geo = reorder_geo(SOURCE_DIR / GEO_FILE, app_order)
    original = run(SOURCE_DIR / GEO_FILE, VALIDATION_POINTS)
    reordered = run(app_geo, VALIDATION_POINTS)
    expected = np.where(np.array(app_order) < 0, UNKNOWN_PROBABILITY, original[:, np.maximum(app_order, 0)])
    if np.abs(reordered - expected).max() > MAX_ABS_DIFF:
        raise SystemExit("The reordered geographic model does not reproduce the original.")
    kept = {app_labels[index][0] for index in np.flatnonzero(reordered[0] >= LOCATION_FILTER_THRESHOLD)}
    missing = [name for name in EXPECTED_BOGOTA_SPECIES if name not in kept]
    if missing:
        raise SystemExit(f"{REGION['name']} should include {missing}")
    (PUBLIC_MODELS / APP_GEO_FILE).write_bytes(app_geo)
    unknown = [app_labels[index][0] for index, source in enumerate(app_order) if source < 0]
    by_name = sum(1 for (scientific, _), source in zip(app_labels, app_order) if source >= 0 and scientific not in geo_by_scientific)
    print(f"[OK] {APP_GEO_FILE}: {len(app_labels)} classes, {by_name} matched by common name, {len(unknown)} unknown to the V3 model")
    print(f"     {REGION['name']} week 1: {len(kept)} species kept")

    # 2. BirdNET+ for the browser: birds only, one output of logits, in two parts.
    app_by_common = {common.lower(): scientific for scientific, common in app_labels}
    app_scientific = {scientific for scientific, _ in app_labels}
    plus_scientific = {classifier_rows[index][CSV_SCIENTIFIC] for index in birds}
    plus_labels: list[tuple[str, str]] = []
    for index in birds:
        scientific, common = classifier_rows[index][CSV_SCIENTIFIC], classifier_rows[index][CSV_COMMON]
        # A bird the app already knows under another scientific name keeps the name the app uses, unless
        # BirdNET+ has a class of its own with that name (a species one taxonomy splits in two).
        known_as = app_by_common.get(common.lower(), scientific)
        plus_labels.append((scientific if scientific in app_scientific or known_as in plus_scientific else known_as, common))
    if len({scientific for scientific, _ in plus_labels}) != len(plus_labels):
        raise SystemExit("Two BirdNET+ classes ended up with the same scientific name.")
    classifier = birds_only_classifier(SOURCE_DIR / CLASSIFIER_FILE, birds)
    window = (np.random.default_rng(7).standard_normal((1, int(PLUS_SAMPLE_RATE * WINDOW_SECONDS))) * 0.05).astype(np.float32)
    probabilities = run(SOURCE_DIR / CLASSIFIER_FILE, window)[:, birds]
    logits = run(classifier, window)
    if np.abs(1 / (1 + np.exp(-logits.astype(np.float64))) - probabilities).max() > MAX_ABS_DIFF:
        raise SystemExit("The cut-down classifier does not reproduce the original.")
    half = (len(classifier) + 1) // 2
    parts = (classifier[:half], classifier[half:])
    if max(len(part) for part in parts) > MAX_PART_BYTES:
        raise SystemExit("A part of the classifier is over the storage limit; split it in more parts.")
    for name, part in zip(PLUS_MODEL_PARTS, parts):
        (PUBLIC_MODELS / name).write_bytes(part)
    (PUBLIC_MODELS / PLUS_LABELS_FILE).write_text("".join(f"{scientific}{LABEL_SEPARATOR}{common}\n" for scientific, common in plus_labels), encoding="utf-8", newline="\n")

    # 3. The geographic model in the order of those labels.
    plus_order = [geo_by_scientific.get(classifier_rows[index][CSV_SCIENTIFIC], -1) for index in birds]
    plus_geo = reorder_geo(SOURCE_DIR / GEO_FILE, plus_order)
    if np.abs(run(plus_geo, VALIDATION_POINTS) - np.where(np.array(plus_order) < 0, UNKNOWN_PROBABILITY, original[:, np.maximum(plus_order, 0)])).max() > MAX_ABS_DIFF:
        raise SystemExit("The geographic model of BirdNET+ does not reproduce the original.")
    (PUBLIC_MODELS / PLUS_GEO_FILE).write_bytes(plus_geo)
    renamed = sum(1 for (known_as, _), index in zip(plus_labels, birds) if known_as != classifier_rows[index][CSV_SCIENTIFIC])
    shared = sum(1 for known_as, _ in plus_labels if known_as in app_scientific)
    print(f"[OK] BirdNET+: {len(birds)} bird classes of {len(classifier_rows)}; {shared} shared with the app's model ({renamed} through their common name)")

    manifest = {
        "geo_model_file": APP_GEO_FILE, "geo_sha256": sha256(app_geo), "geo_size_bytes": len(app_geo),
        "alternate": {
            "model_id": PLUS_MODEL_ID, "variant": PLUS_VARIANT, "sample_rate": PLUS_SAMPLE_RATE,
            "window_samples": int(PLUS_SAMPLE_RATE * WINDOW_SECONDS), "window_seconds": WINDOW_SECONDS,
            "num_classes": len(birds), "sha256": sha256(classifier), "size_bytes": len(classifier),
            "model_files": list(PLUS_MODEL_PARTS), "labels_file": PLUS_LABELS_FILE,
            "geo_model_file": PLUS_GEO_FILE, "geo_sha256": sha256(plus_geo), "geo_size_bytes": len(plus_geo),
        },
    }
    print("Fields for public/models/manifest.json and the API's model_manifest.json:")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
