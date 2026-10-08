"""
Prepares the BirdNET v2.4 geographic model (the "meta-data" / location model) for the browser.

Source: Zenodo record 10.5281/zenodo.15050749 ("BirdNET Model V2.4", birdnet-team), file
BirdNET_v2.4_tflite_int8.zip, member meta-model.tflite. That archive is the one the official `birdnet`
package downloads for its geo model 2.4 (birdnet/geo/models/v2_4/tf.py); that package notes the meta
model is the same in every precision archive, and int8 is the smallest download. The model is FP32.
BirdNET-Analyzer <= 2.4.0 shipped the same network as
checkpoints/V2.4/BirdNET_GLOBAL_6K_V2.4_MData_Model_V2_FP16.tflite: every constant, including the input
scaling, rounded to float16, which moves its probabilities by up to ~0.07. The FP32 original is used here.

Why v2.4 and not the newer geo model v3.0 (BirdNET+ Geomodel, ~14K labels, used by BirdNET-Analyzer
since it moved to the `birdnet` package): v2.4's 6522 outputs are aligned 1:1, in order, with the 6522
labels of the acoustic model the app runs (BirdNET v2.4), so the filter is an element-wise mask. v3.0
uses another taxonomy and label set and would need a species mapping.

License: the BirdNET models are CC BY-NC-SA 4.0 per the BirdNET-Analyzer README (the Zenodo record is
tagged CC BY-NC 4.0). Non-commercial use with attribution; the converted ONNX file is a derived work
under the same terms.

Model contract (read from the graph and from BirdNET-Analyzer's predict_filter):
- input  `lat_lon_week`: float32 [batch, 3] = (latitude, longitude, week). The network does its own
  normalisation and sinusoidal encoding, so raw degrees go in. Week is BirdNET's 48-week year
  (4 weeks per month, 1..48); any value outside 1..48 (BirdNET uses -1) zeroes the week encoding and
  yields the year-round prediction.
- output `species_probs`: float32 [batch, 6522], already passed through a sigmoid, in the same order
  as the acoustic model's labels.txt (verified below by scientific name).
A species is kept when its probability is >= LOCATION_FILTER_THRESHOLD (BirdNET-Analyzer --sf_thresh).

Conversion: tf2onnx (TFLite frontend) at ONNX opset 17, the opset of birdnet_model.onnx, then the
tensors get stable names. To shrink the PWA download (28 MB -> 16 MB), the classifier weight matrix is
stored as float16 and cast back to float32 inside the graph, so ONNX Runtime still computes in float32
(it folds the cast once when the session loads). The hidden layers, biases and input-encoding
constants stay float32 (see HALF_PRECISION_SHAPE); rounding the input constants is what makes the
legacy FP16 TFLite drift. Validation against the FP32 TFLite on
VALIDATION_POINTS: max |diff| <= MAX_ABS_DIFF and the same species kept at the location threshold.

This script needs TensorFlow and tf2onnx, which the app does not use, so run it from a throwaway
virtual environment (Python 3.11) with the pinned versions below, from the frontend root:
    pip install tensorflow==2.15.1 tf2onnx==1.16.1 onnx==1.16.2 onnxruntime==1.20.1 numpy==1.26.4 protobuf==3.20.3
    python scripts/prepare-geo-model.py
"""

import hashlib
import shutil
import time
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import tensorflow as tf
import tf2onnx
from onnx import TensorProto, numpy_helper

# Paths mirror build.config.mjs (TMP_DIR, PUBLIC_DIR, MODEL_ASSETS_DIR), which Python cannot import.
BASE_DIR = Path(__file__).resolve().parent.parent
TMP_DIR = BASE_DIR / "tmp" / "models" / "geo"
PUBLIC_MODELS = BASE_DIR / "public" / "models"
GEO_MODEL_FILE = "birdnet_geo_model.onnx"
LABELS_FILE = "labels.txt"

# Official archive. The MD5 is the checksum Zenodo publishes for the file; the SHA-256 pins the
# extracted model that was validated.
ZENODO_RECORD_URL = "https://zenodo.org/records/15050749"
ARCHIVE_NAME = "BirdNET_v2.4_tflite_int8.zip"
ARCHIVE_URL = f"{ZENODO_RECORD_URL}/files/{ARCHIVE_NAME}?download=1"
ARCHIVE_MD5 = "69becc3e8eb1c72d1d9dae7f21062c74"
META_MODEL_MEMBER = "meta-model.tflite"
META_MODEL_SHA256 = "33aea6d21cc887d2414e9596d2531a480a3e5f4770c22aa257f217fb757d4653"
ARCHIVE_LABELS_MEMBER = "labels/en_us.txt"
LICENSE = "CC BY-NC-SA 4.0"

NUM_CLASSES = 6522
# Labels are "<scientific name>_<common name>"; the common names may differ between taxonomy
# releases, so the order check compares scientific names only.
LABEL_SEPARATOR = "_"

# Matches birdnet_model.onnx; every op in this graph exists in onnxruntime-web at this opset.
ONNX_OPSET = 17
INPUT_NAME = "lat_lon_week"
OUTPUT_NAME = "species_probs"
BATCH_DIM = "batch"
INPUT_FEATURES = 3

# BirdNET-Analyzer default for the location filter (config.LOCATION_FILTER_THRESHOLD, --sf_thresh).
LOCATION_FILTER_THRESHOLD = 0.03
# BirdNET's convention for "no week": the graph ignores weeks outside 1..48.
YEAR_ROUND_WEEK = -1

# Only the classifier matrix [1024, NUM_CLASSES] (~90 % of the bytes) is stored in half precision.
# Rounding the hidden layers too saves another 1.4 MB, but their error reaches every class: it moved
# species sitting within 1e-4 of the threshold across it in Bogotá weeks 1 and 20.
HALF_PRECISION_SHAPE = (1024, NUM_CLASSES)
HALF_SUFFIX = "_fp16"
# The measured float16-storage error is ~5e-4. A diff that small can still flip a species sitting on
# the threshold, so the kept sets are compared exactly as well.
MAX_ABS_DIFF = 1e-3
REGION = {"name": "Bogotá", "latitude": 4.70, "longitude": -74.07}
REPORT_WEEKS = (1, 20, 40, YEAR_ROUND_WEEK)
TOP_SPECIES_WEEK = 40
TOP_SPECIES_COUNT = 15
# Bogotá residents that any sensible prediction for the region must include.
EXPECTED_BOGOTA_SPECIES = ("Turdus fuscater", "Zonotrichia capensis")
VALIDATION_POINTS = [
    (REGION["latitude"], REGION["longitude"], 1),
    (REGION["latitude"], REGION["longitude"], 20),
    (REGION["latitude"], REGION["longitude"], 40),
    (REGION["latitude"], REGION["longitude"], YEAR_ROUND_WEEK),
    (42.45, -76.48, 20),  # Ithaca, USA
    (50.83, 12.92, 20),  # Chemnitz, Germany
    (-33.87, 151.21, 40),  # Sydney, Australia
    (-3.47, -62.37, 8),  # Central Amazon
    (64.15, -21.94, 26),  # Reykjavík, Iceland
]

TIMING_WARMUP_RUNS = 10
TIMING_RUNS = 500
ONNX_PROVIDERS = ["CPUExecutionProvider"]

HTTP_TIMEOUT_S = 120
DOWNLOAD_CHUNK_BYTES = 1024 * 1024
BYTES_PER_MB = 1024 * 1024
MS_PER_S = 1000


def file_digest(path: Path, algorithm: str) -> str:
    digest = hashlib.new(algorithm)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(DOWNLOAD_CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def size_mb(path: Path) -> float:
    return path.stat().st_size / BYTES_PER_MB


def download_archive(dest: Path) -> None:
    if dest.exists() and file_digest(dest, "md5") == ARCHIVE_MD5:
        print(f"[OK] {dest.name} already downloaded, MD5 matches.")
        return
    print(f"Downloading {ARCHIVE_URL} ...")
    with urllib.request.urlopen(ARCHIVE_URL, timeout=HTTP_TIMEOUT_S) as response, open(dest, "wb") as f:
        while chunk := response.read(DOWNLOAD_CHUNK_BYTES):
            f.write(chunk)
    actual = file_digest(dest, "md5")
    if actual != ARCHIVE_MD5:
        raise ValueError(f"MD5 mismatch for {dest.name}: {actual} != {ARCHIVE_MD5}")
    print(f"[OK] {dest.name} downloaded ({size_mb(dest):.2f} MB), MD5 matches Zenodo.")


def extract_member(archive: Path, member: str, dest: Path) -> None:
    """Copies one archive member to a fixed path, so member names never decide where files land."""
    with zipfile.ZipFile(archive) as zf, zf.open(member) as src, open(dest, "wb") as dst:
        while chunk := src.read(DOWNLOAD_CHUNK_BYTES):
            dst.write(chunk)


def read_labels(path: Path) -> list[str]:
    with open(path, encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


def scientific_name(label: str) -> str:
    return label.split(LABEL_SEPARATOR, 1)[0]


def verify_label_order(geo_labels: list[str], app_labels: list[str]) -> None:
    if len(geo_labels) != NUM_CLASSES or len(app_labels) != NUM_CLASSES:
        raise ValueError(f"Expected {NUM_CLASSES} labels, got {len(geo_labels)} (geo) and {len(app_labels)} (app)")
    mismatches = [i for i, (g, a) in enumerate(zip(geo_labels, app_labels)) if scientific_name(g) != scientific_name(a)]
    if mismatches:
        first = mismatches[0]
        raise ValueError(f"{len(mismatches)} label positions differ, first at {first}: {geo_labels[first]} vs {app_labels[first]}")
    renamed = sum(g != a for g, a in zip(geo_labels, app_labels))
    print(f"[OK] Same {NUM_CLASSES} scientific names in the same order as {LABELS_FILE} ({renamed} common names differ).")


def canonicalize_names(model: onnx.ModelProto) -> None:
    """Replaces tf2onnx's generated names with positional ones.

    tf2onnx numbers its helper tensors from string hash order, which changes between processes, so
    without this every run would produce a different file and SHA-256 for the same weights.
    """
    graph = model.graph
    names = {graph.input[0].name: INPUT_NAME, graph.output[0].name: OUTPUT_NAME}
    initializer_names = {init.name for init in graph.initializer}
    for index, node in enumerate(graph.node):
        node.name = f"{node.op_type.lower()}_{index}"
        for name in node.input:
            if name in initializer_names and name not in names:
                names[name] = f"const_{len(names)}"
        for output_index, name in enumerate(node.output):
            names.setdefault(name, f"{node.name}_out{output_index}")
    for node in graph.node:
        node.input[:] = [names.get(name, name) for name in node.input]
        node.output[:] = [names[name] for name in node.output]
    for init in graph.initializer:
        init.name = names[init.name]
    graph.initializer.sort(key=lambda init: init.name)
    graph.input[0].name, graph.output[0].name = INPUT_NAME, OUTPUT_NAME
    for value in (graph.input[0], graph.output[0]):
        value.type.tensor_type.shape.dim[0].dim_param = BATCH_DIM
    # Intermediate shape hints carry the random names; ONNX Runtime infers shapes on its own.
    del graph.value_info[:]


def store_weights_as_half(model: onnx.ModelProto) -> None:
    """Stores the classifier matrix as float16 behind a Cast to float32, keeping float32 compute."""
    graph = model.graph
    initializers: list[onnx.TensorProto] = []
    casts: list[onnx.NodeProto] = []
    for init in graph.initializer:
        values = numpy_helper.to_array(init)
        if values.dtype != np.float32 or values.shape != HALF_PRECISION_SHAPE:
            initializers.append(init)
            continue
        half = numpy_helper.from_array(values.astype(np.float16), init.name + HALF_SUFFIX)
        initializers.append(half)
        # The Cast keeps the original tensor name, so the consuming MatMul nodes stay untouched.
        casts.append(onnx.helper.make_node("Cast", [half.name], [init.name], name=f"cast_{init.name}", to=TensorProto.FLOAT))
    del graph.initializer[:]
    graph.initializer.extend(sorted(initializers, key=lambda init: init.name))
    nodes = [*casts, *graph.node]
    del graph.node[:]
    graph.node.extend(nodes)


def convert(tflite_path: Path, onnx_path: Path) -> None:
    model, _ = tf2onnx.convert.from_tflite(str(tflite_path), opset=ONNX_OPSET)
    # tf2onnx keeps TensorFlow's internal tensor names; the app should depend on stable ones.
    canonicalize_names(model)
    store_weights_as_half(model)
    model.doc_string = f"BirdNET v2.4 geo (meta-data) model, {ZENODO_RECORD_URL}, {LICENSE}"
    onnx.helper.set_model_props(model, {"source": ZENODO_RECORD_URL, "license": LICENSE, "labels": LABELS_FILE})
    onnx.checker.check_model(model)
    onnx.save(model, str(onnx_path))


def predict_tflite(tflite_path: Path, samples: np.ndarray) -> np.ndarray:
    interpreter = tf.lite.Interpreter(model_path=str(tflite_path))
    interpreter.allocate_tensors()
    input_index = interpreter.get_input_details()[0]["index"]
    output_index = interpreter.get_output_details()[0]["index"]
    rows = []
    # The TFLite graph is built for batch 1, the shape BirdNET-Analyzer uses.
    for sample in samples:
        interpreter.set_tensor(input_index, sample.reshape(1, INPUT_FEATURES))
        interpreter.invoke()
        rows.append(interpreter.get_tensor(output_index)[0].copy())
    return np.stack(rows)


def main() -> None:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_MODELS.mkdir(parents=True, exist_ok=True)

    archive_path = TMP_DIR / ARCHIVE_NAME
    download_archive(archive_path)
    tflite_path = TMP_DIR / META_MODEL_MEMBER
    extract_member(archive_path, META_MODEL_MEMBER, tflite_path)
    actual_sha256 = file_digest(tflite_path, "sha256")
    if actual_sha256 != META_MODEL_SHA256:
        raise ValueError(f"SHA-256 mismatch for {META_MODEL_MEMBER}: {actual_sha256}")
    print(f"[OK] {META_MODEL_MEMBER}: {size_mb(tflite_path):.2f} MB, SHA-256 matches.")

    archive_labels_path = TMP_DIR / "labels_en_us.txt"
    extract_member(archive_path, ARCHIVE_LABELS_MEMBER, archive_labels_path)
    geo_labels = read_labels(archive_labels_path)
    app_labels = read_labels(PUBLIC_MODELS / LABELS_FILE)
    verify_label_order(geo_labels, app_labels)

    # Built in TMP_DIR and published only after it passes validation.
    onnx_path = TMP_DIR / GEO_MODEL_FILE
    convert(tflite_path, onnx_path)
    session = ort.InferenceSession(str(onnx_path), providers=ONNX_PROVIDERS)
    model_input, model_output = session.get_inputs()[0], session.get_outputs()[0]
    print(f"ONNX input:  {model_input.name} {model_input.shape} {model_input.type}")
    print(f"ONNX output: {model_output.name} {model_output.shape} {model_output.type}")

    samples = np.array(VALIDATION_POINTS, dtype=np.float32)
    expected = predict_tflite(tflite_path, samples)
    actual = session.run([OUTPUT_NAME], {INPUT_NAME: samples})[0]
    if actual.shape != (len(samples), NUM_CLASSES):
        raise ValueError(f"Unexpected output shape {actual.shape}")
    print(f"\n--- FP32 TFLite vs ONNX Runtime (threshold {LOCATION_FILTER_THRESHOLD}) ---")
    for point, tflite_row, onnx_row in zip(VALIDATION_POINTS, expected, actual):
        tflite_kept = tflite_row >= LOCATION_FILTER_THRESHOLD
        onnx_kept = onnx_row >= LOCATION_FILTER_THRESHOLD
        flipped = int((tflite_kept != onnx_kept).sum())
        print(
            f"lat {point[0]:7.2f} lon {point[1]:8.2f} week {point[2]:3d}: max |diff| = {np.abs(tflite_row - onnx_row).max():.2e}, "
            f"kept {int(tflite_kept.sum())} (TFLite) / {int(onnx_kept.sum())} (ONNX)"
        )
        if flipped:
            raise ValueError(f"{flipped} species change side of the threshold at {point}")
    max_diff = float(np.abs(expected - actual).max())
    if max_diff > MAX_ABS_DIFF:
        raise ValueError(f"ONNX output differs from TFLite by {max_diff:.2e} (> {MAX_ABS_DIFF})")
    print(f"[OK] Max |diff| over all points: {max_diff:.2e}; identical kept species at every point.")

    region, latitude, longitude = REGION["name"], REGION["latitude"], REGION["longitude"]
    print(f"\n--- {region} (lat {latitude}, lon {longitude}), threshold {LOCATION_FILTER_THRESHOLD} ---")
    for week in REPORT_WEEKS:
        probs = session.run([OUTPUT_NAME], {INPUT_NAME: np.array([[latitude, longitude, week]], dtype=np.float32)})[0][0]
        kept_indices = np.flatnonzero(probs >= LOCATION_FILTER_THRESHOLD)
        print(f"Week {week:3d}: {len(kept_indices)} species pass the filter")
        kept_names = {scientific_name(app_labels[i]) for i in kept_indices}
        missing = [name for name in EXPECTED_BOGOTA_SPECIES if name not in kept_names]
        if missing:
            raise ValueError(f"Expected {region} species below the threshold in week {week}: {missing}")
        if week == TOP_SPECIES_WEEK:
            top = np.argsort(probs)[::-1][:TOP_SPECIES_COUNT]
            for rank, index in enumerate(top, start=1):
                print(f"  {rank:2d}. {app_labels[index]:<55} {probs[index]:.4f}")

    single = samples[:1]
    for _ in range(TIMING_WARMUP_RUNS):
        session.run([OUTPUT_NAME], {INPUT_NAME: single})
    start = time.perf_counter()
    for _ in range(TIMING_RUNS):
        session.run([OUTPUT_NAME], {INPUT_NAME: single})
    per_call_ms = (time.perf_counter() - start) * MS_PER_S / TIMING_RUNS
    print(f"\nONNX Runtime CPU: {per_call_ms:.3f} ms per call (mean of {TIMING_RUNS})")

    target_path = PUBLIC_MODELS / GEO_MODEL_FILE
    shutil.copyfile(onnx_path, target_path)
    print(f"\n[OK] Written {target_path.relative_to(BASE_DIR)}")
    print(f"Size: {target_path.stat().st_size} bytes ({size_mb(target_path):.2f} MB)")
    print(f"SHA-256: {file_digest(target_path, 'sha256')}")


if __name__ == "__main__":
    main()
