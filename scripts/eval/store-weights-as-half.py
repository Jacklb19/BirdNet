"""
Writes a copy of a float32 ONNX model whose weights are stored in half precision (docs/evaluacion.md).

    python scripts/eval/store-weights-as-half.py <float32 model> <output model>

Each large float32 tensor is saved as float16 behind a Cast back to float32, the technique already used for the
geographic model (scripts/prepare-geo-model.py): the file is about half the size and the computation stays in
float32, which is what the WebAssembly backend runs. Nothing is trained; the weights are only rounded. The script
reports how far the rounded model's outputs move on random audio, and `score-models.py` measures what that does
to detections.
"""
import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, numpy_helper

# Smaller tensors (biases, normalization constants) save nothing worth their rounding error.
MIN_ELEMENTS = 1024
HALF_SUFFIX = "_fp16"
ONNX_PROVIDERS = ["CPUExecutionProvider"]
BYTES_PER_MB = 1024 * 1024
COMPARISON_WINDOWS = 8
COMPARISON_SEED = 0
# Level of the comparison noise: a normalized window peaks near 1.
COMPARISON_AMPLITUDE = 0.3


def store_as_half(model: onnx.ModelProto) -> int:
    """Rewrites the large float32 initializers in place; returns how many were converted."""
    graph = model.graph
    initializers: list[onnx.TensorProto] = []
    casts: list[onnx.NodeProto] = []
    for initializer in graph.initializer:
        values = numpy_helper.to_array(initializer)
        if values.dtype != np.float32 or values.size < MIN_ELEMENTS:
            initializers.append(initializer)
            continue
        half = numpy_helper.from_array(values.astype(np.float16), initializer.name + HALF_SUFFIX)
        initializers.append(half)
        # The Cast keeps the original tensor name, so the nodes that consume it stay untouched.
        casts.append(onnx.helper.make_node("Cast", [half.name], [initializer.name], name=f"cast_{initializer.name}", to=TensorProto.FLOAT))
    del graph.initializer[:]
    graph.initializer.extend(initializers)
    nodes = [*casts, *graph.node]
    del graph.node[:]
    graph.node.extend(nodes)
    return len(casts)


def outputs(path: Path, windows: np.ndarray) -> np.ndarray:
    session = ort.InferenceSession(str(path), providers=ONNX_PROVIDERS)
    return session.run(None, {session.get_inputs()[0].name: windows})[0]


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    source, target = Path(sys.argv[1]), Path(sys.argv[2])
    model = onnx.load(str(source))
    converted = store_as_half(model)
    onnx.checker.check_model(model)
    onnx.save(model, str(target))

    samples = model.graph.input[0].type.tensor_type.shape.dim[1].dim_value
    windows = (np.random.default_rng(COMPARISON_SEED).standard_normal((COMPARISON_WINDOWS, samples)) * COMPARISON_AMPLITUDE).astype(np.float32)
    reference, rounded = outputs(source, windows), outputs(target, windows)
    probability = lambda logits: 1.0 / (1.0 + np.exp(-logits.astype(np.float64)))  # noqa: E731
    print(f"[OK] {converted} tensors stored as float16: {source.stat().st_size / BYTES_PER_MB:.1f} MB -> {target.stat().st_size / BYTES_PER_MB:.1f} MB")
    print(f"     max |logit difference| = {np.abs(reference - rounded).max():.2e}, max |probability difference| = {np.abs(probability(reference) - probability(rounded)).max():.2e}")


if __name__ == "__main__":
    main()
