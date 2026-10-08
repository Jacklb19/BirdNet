"""
Fase 1: Validación Técnica Previa de BirdNET v2.4 (ADR-01, ADR-05, RF-03, RF-05, RNF-01, RNF-05, RNF-09)
Descarga el modelo ONNX de referencia (tphakala), valida la taxonomía, audios de prueba de xeno-canto,
evalúa el filtro regional de Bogotá, cuantiza a INT8 / FP16 y genera el reporte comparativo.

Run from the repository root with `npm run model:prepare`.
"""

import hashlib
import json
import os
import time
from datetime import date
from pathlib import Path
import numpy as np
import requests
import soundfile as sf
import onnx
import onnxruntime as ort

# Paths mirror build.config.mjs (TMP_DIR, PUBLIC_DIR, MODEL_ASSETS_DIR, MODEL_FILES), which Python cannot import.
BASE_DIR = Path(__file__).resolve().parent.parent
TMP_DIR = BASE_DIR / "tmp" / "models"
PUBLIC_MODELS = BASE_DIR / "public" / "models"
TEST_AUDIO_DIR = BASE_DIR / "public" / "test-audio"

# Artifacts read by the app: the manifest names the model and labels files (src/features/inference/modelManifest.ts).
MODEL_ID = "birdnet-v2.4"
MODEL_FILE = "birdnet_model.onnx"
LABELS_FILE = "labels.txt"
MANIFEST_FILE = "manifest.json"
TEST_AUDIO_METADATA_FILE = "metadata.json"

# Audio contract of BirdNET v2.4. The app checks the manifest against AUDIO_CONSTANTS
# (src/features/audio/dsp/audio.constants.ts), so both sides must agree.
SAMPLE_RATE = 48_000
WINDOW_SECONDS = 3.0
WINDOW_SAMPLES = int(SAMPLE_RATE * WINDOW_SECONDS)
NUM_CLASSES = 6522
# Peak normalization identical to the browser pipeline (src/features/audio/dsp/normalize.ts): quieter
# windows are silence and are not amplified.
TARGET_PEAK = 0.95
SILENCE_FLOOR = 1e-4
TEST_AUDIO_SUBTYPE = "PCM_16"
TEST_AUDIO_CHANNELS = 1
TEST_AUDIO_FORMAT = "wav"
OFFSET_DECIMALS = 2

# Upstream ONNX conversion (tphakala/BirdNET-v2.4); hashes pin the exact files that were validated.
HF_BASE = "https://huggingface.co/tphakala/BirdNET-v2.4/resolve/main"
LABELS_URL = f"{HF_BASE}/labels.txt"
MODEL_FP32_NAME = "BirdNET_v2.4_fp32_dfttrunc.onnx"
MODEL_FP32_URL = f"{HF_BASE}/{MODEL_FP32_NAME}"
MODEL_FP32_SHA256 = "3b72e88b3ad0c310a41adabccf8cf75b1a05daeeb40884ebd38038c91d0e423d"
# Official ARM-optimized INT8 variant: the one deployed while it keeps full accuracy on the test set.
MODEL_ARM_INT8_NAME = "BirdNET_v2.4_int8_arm_dfttrunc.onnx"
MODEL_ARM_INT8_URL = f"{HF_BASE}/{MODEL_ARM_INT8_NAME}"
MODEL_ARM_INT8_SHA256 = "7550498ba996064feca12005ff4133eb1d35741c4061376e7a987d8227518893"
MODEL_DYNAMIC_INT8_NAME = "BirdNET_v2.4_int8.onnx"
ONNX_PROVIDERS = ["CPUExecutionProvider"]
FLOAT32_BYTES = 4

# Deployment region for the geographic filter (birdnet package geo model).
REGION = {"name": "Bogotá", "latitude": 4.7110, "longitude": -74.0721}
GEO_MODEL_TYPE = "geo"
GEO_MODEL_VERSION = "3.0"
GEO_MODEL_BACKEND = "onnx"
GEO_WEEK = 40
GEO_MIN_CONFIDENCE = 0.03

# Downloads: without a timeout a stalled connection would hang the script.
HTTP_TIMEOUT_S = float(os.environ.get("MODEL_HTTP_TIMEOUT_S", "60"))
HTTP_USER_AGENT = "BirdNetLocal-Validation/1.0"
DOWNLOAD_CHUNK_BYTES = 1024 * 1024
BYTES_PER_MB = 1024 * 1024
SHA256_PREVIEW_CHARS = 10

TEST_RECORDINGS = [
    {
        "id": "XC915894",
        "scientific_name": "Turdus fuscater",
        "common_name": "Great Thrush",
        "author": "MasBiomas",
        "license": "CC BY-NC-SA 4.0",
        "url": "https://xeno-canto.org/915894",
        "audio_url": "https://xeno-canto.org/sounds/uploaded/RKFAHKSOOA/XC915894-2024-04-17-05_32_BqeEsperanza_Turdus.mp3",
        "filename": "XC915894-turdus-fuscater.wav",
        "target_offset_sec": 26.0
    },
    {
        "id": "XC1086722",
        "scientific_name": "Zonotrichia capensis",
        "common_name": "Rufous-collared Sparrow",
        "author": "Brian Cox",
        "license": "CC BY-NC-SA 4.0",
        "url": "https://xeno-canto.org/1086722",
        "audio_url": "https://xeno-canto.org/sounds/uploaded/OKSKESEOLP/XC1086722-2025-12-30-16_03_Rufous_collared_Sparrow_MIstrato.mp3",
        "filename": "XC1086722-zonotrichia-capensis.wav",
        "target_offset_sec": 0.0
    },
    {
        "id": "XC963260",
        "scientific_name": "Troglodytes aedon",
        "common_name": "House Wren",
        "author": "Scott Crabtree",
        "license": "CC BY-NC-SA 4.0",
        "url": "https://xeno-canto.org/963260",
        "audio_url": "https://xeno-canto.org/sounds/uploaded/ZQJCLMBULK/XC963260-629565794.mp3",
        "filename": "XC963260-troglodytes-aedon.wav",
        "target_offset_sec": 10.0
    },
    {
        "id": "XC534023",
        "scientific_name": "Tyrannus melancholicus",
        "common_name": "Tropical Kingbird",
        "author": "Jerome Fischer",
        "license": "CC BY-NC-SA 4.0",
        "url": "https://xeno-canto.org/534023",
        "audio_url": "https://xeno-canto.org/sounds/uploaded/JPBSNBUUEF/XC534023-Tropical%20Kingbird2.mp3",
        "filename": "XC534023-tyrannus-melancholicus.wav",
        "target_offset_sec": 0.0
    }
]


def size_mb(path: Path) -> float:
    return path.stat().st_size / BYTES_PER_MB


def normalize_peak(samples: np.ndarray) -> np.ndarray:
    """Scales the loudest sample to TARGET_PEAK, leaving silence untouched."""
    peak = np.max(np.abs(samples))
    return samples * (TARGET_PEAK / peak) if peak > SILENCE_FLOOR else samples


def download_file(url: str, dest: Path, expected_sha256: str | None = None) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        if expected_sha256:
            h = hashlib.sha256(dest.read_bytes()).hexdigest()
            if h == expected_sha256:
                print(f"[OK] {dest.name} ya existe y el hash SHA-256 coincide.")
                return dest
            else:
                print(f"[WARN] {dest.name} hash no coincide, redescargando...")
        else:
            print(f"[OK] {dest.name} ya existe.")
            return dest

    print(f"Descargando {url} -> {dest.name} ...")
    headers = {"User-Agent": HTTP_USER_AGENT}
    r = requests.get(url, stream=True, headers=headers, timeout=HTTP_TIMEOUT_S)
    r.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in r.iter_content(chunk_size=DOWNLOAD_CHUNK_BYTES):
            if chunk:
                f.write(chunk)

    if expected_sha256:
        h = hashlib.sha256(dest.read_bytes()).hexdigest()
        assert h == expected_sha256, f"Hash mismatch para {dest.name}: {h} vs {expected_sha256}"
        print(f"[OK] {dest.name} descargado y verificado SHA-256 ({h[:SHA256_PREVIEW_CHARS]}...).")
    else:
        print(f"[OK] {dest.name} descargado.")
    return dest


def main():
    for directory in (TMP_DIR, PUBLIC_MODELS, TEST_AUDIO_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    print("================================================================")
    print(" FASE 1: VALIDACIÓN TÉCNICA PREVIA - BIRDNET v2.4")
    print("================================================================")

    # 1. Descarga labels.txt
    labels_path = PUBLIC_MODELS / LABELS_FILE
    download_file(LABELS_URL, labels_path)
    with open(labels_path, "r", encoding="utf-8") as f:
        labels = [line.strip() for line in f if line.strip()]
    print(f"Total de clases cargadas en {LABELS_FILE}: {len(labels)}")
    assert len(labels) == NUM_CLASSES, f"Se esperaban {NUM_CLASSES} clases, pero hay {len(labels)}"

    # 2. Descarga modelo de referencia FP32
    fp32_model_path = TMP_DIR / MODEL_FP32_NAME
    download_file(MODEL_FP32_URL, fp32_model_path, MODEL_FP32_SHA256)
    fp32_size_mb = size_mb(fp32_model_path)
    print(f"Modelo FP32 descargado: {fp32_size_mb:.2f} MB")

    # 3. Descarga y preparación del conjunto de evaluación
    print("\n--- Preparando audios de evaluación de xeno-canto ---")
    metadata_records = []
    evaluation_windows = []

    for item in TEST_RECORDINGS:
        wav_path = TEST_AUDIO_DIR / item["filename"]
        if not wav_path.exists():
            mp3_temp = TMP_DIR / f"{item['id']}_raw.mp3"
            download_file(item["audio_url"], mp3_temp)
            data, sr = sf.read(str(mp3_temp))
            if len(data.shape) > 1:
                data = data.mean(axis=1) # mono
            # Resample a SAMPLE_RATE si difiere
            if sr != SAMPLE_RATE:
                from scipy.signal import resample_poly
                # Calcular gcd para resample_poly
                from math import gcd
                g = gcd(sr, SAMPLE_RATE)
                up = SAMPLE_RATE // g
                down = sr // g
                data = resample_poly(data, up, down).astype(np.float32)
            else:
                data = data.astype(np.float32)

            data = normalize_peak(data)

            sf.write(str(wav_path), data, SAMPLE_RATE, subtype=TEST_AUDIO_SUBTYPE)
            print(f"[OK] Audio procesado y guardado a {SAMPLE_RATE} Hz: {wav_path.name} ({len(data)/SAMPLE_RATE:.1f} s)")

        # Cargar audio a SAMPLE_RATE
        data, sr = sf.read(str(wav_path))
        assert sr == SAMPLE_RATE, f"Sample rate debe ser {SAMPLE_RATE}, es {sr}"

        # Extraer la ventana de WINDOW_SECONDS (WINDOW_SAMPLES muestras) en el offset óptimo de vocalización
        best_offset = int(item.get("target_offset_sec", 0.0) * SAMPLE_RATE)
        chunk = data[best_offset : best_offset + WINDOW_SAMPLES]
        if len(chunk) < WINDOW_SAMPLES:
            chunk = np.pad(chunk, (0, WINDOW_SAMPLES - len(chunk)))
        best_window = normalize_peak(chunk)

        evaluation_windows.append({
            "id": item["id"],
            "expected_sci": item["scientific_name"],
            "expected_common": item["common_name"],
            "window": best_window.astype(np.float32),
            "offset_sec": best_offset / SAMPLE_RATE,
            "filename": item["filename"]
        })

        metadata_records.append({
            "id": item["id"],
            "species_scientific": item["scientific_name"],
            "species_common": item["common_name"],
            "recordist": item["author"],
            "license": item["license"],
            "source_url": item["url"],
            "filename": item["filename"],
            "sample_rate": SAMPLE_RATE,
            "format": TEST_AUDIO_FORMAT,
            "channels": TEST_AUDIO_CHANNELS,
            "best_window_offset_sec": round(best_offset / SAMPLE_RATE, OFFSET_DECIMALS)
        })

    # Guardar metadata.json en public/test-audio/
    metadata_json_path = TEST_AUDIO_DIR / TEST_AUDIO_METADATA_FILE
    with open(metadata_json_path, "w", encoding="utf-8") as f:
        json.dump(metadata_records, f, indent=2, ensure_ascii=False)
    print(f"[OK] {metadata_json_path.name} escrito con los {len(metadata_records)} audios de evaluación.")

    # 4. Evaluación del modelo FP32 de referencia
    print("\n--- Evaluando modelo FP32 de referencia ---")
    sess_fp32 = ort.InferenceSession(str(fp32_model_path), providers=ONNX_PROVIDERS)
    input_name = sess_fp32.get_inputs()[0].name
    output_name = sess_fp32.get_outputs()[0].name
    print(f"Entrada ONNX: '{input_name}', forma: {sess_fp32.get_inputs()[0].shape}")
    print(f"Salida ONNX: '{output_name}', forma: {sess_fp32.get_outputs()[0].shape}")

    fp32_results = []
    latencies_fp32 = []

    for item in evaluation_windows:
        inp = item["window"].reshape(1, WINDOW_SAMPLES)
        # Inferencia y medición de latencia
        t0 = time.perf_counter()
        out = sess_fp32.run([output_name], {input_name: inp})[0][0]
        t1 = time.perf_counter()
        latencies_fp32.append((t1 - t0) * 1000)

        # Sigmoide para obtener probabilidades
        probs = 1.0 / (1.0 + np.exp(-out))
        top1_idx = int(np.argmax(probs))
        top1_label = labels[top1_idx]
        top1_prob = probs[top1_idx]

        correct = item["expected_sci"].lower() in top1_label.lower()
        fp32_results.append({
            "id": item["id"],
            "expected": item["expected_sci"],
            "predicted": top1_label,
            "confidence": float(top1_prob),
            "correct": correct
        })
        print(f"[{'CORRECTO' if correct else 'FALLO'}] {item['id']} ({item['expected_sci']}): top-1 = {top1_label} (conf: {top1_prob:.4f})")

    all_fp32_correct = all(r["correct"] for r in fp32_results)
    acc_fp32 = sum(r["correct"] for r in fp32_results) / len(fp32_results)
    avg_lat_fp32 = np.mean(latencies_fp32)
    print(f"FP32 Top-1 Exactitud: {sum(r['correct'] for r in fp32_results)}/{len(fp32_results)} ({100*acc_fp32:.1f}%)")
    print(f"FP32 Latencia media CPU: {avg_lat_fp32:.1f} ms")
    assert all_fp32_correct, "El modelo FP32 no acertó el 100% de los audios de prueba de referencia. Verificar audios."

    # 5. Filtro regional
    region, latitude, longitude = REGION["name"], REGION["latitude"], REGION["longitude"]
    print(f"\n--- Evaluando filtro regional de {region} (lat {latitude:.4f}, lon {longitude:.4f}) ---")
    import birdnet
    geomodel = birdnet.load(GEO_MODEL_TYPE, GEO_MODEL_VERSION, GEO_MODEL_BACKEND)
    geo_all = geomodel.predict(latitude, longitude, min_confidence=GEO_MIN_CONFIDENCE).to_structured_array()
    geo_week = geomodel.predict(latitude, longitude, week=GEO_WEEK, min_confidence=GEO_MIN_CONFIDENCE).to_structured_array()
    print(f"Especies en {region} (todas las semanas, umbral {GEO_MIN_CONFIDENCE}): {len(geo_all)}")
    print(f"Especies en {region} (semana {GEO_WEEK}, umbral {GEO_MIN_CONFIDENCE}): {len(geo_week)}")

    # Análisis de poda de la capa de salida en el grafo ONNX
    print("\n--- Análisis de poda de capa de salida vs máscara por software ---")
    onnx_model = onnx.load(str(fp32_model_path))
    # Buscar el tensor de pesos de la capa final
    final_weights = None
    for init in onnx_model.graph.initializer:
        if NUM_CLASSES in init.dims:
            final_weights = init
            print(f"Capa final encontrada: '{init.name}', dimensiones: {init.dims}, elementos: {np.prod(init.dims)}")

    if final_weights:
        elem_count = np.prod(final_weights.dims)
        weight_bytes = elem_count * FLOAT32_BYTES
        weight_mb = weight_bytes / BYTES_PER_MB
        print(f"Peso de la capa densa final ({NUM_CLASSES} clases): {weight_mb:.2f} MB")

        # Si se podara a las K especies de la región:
        k = len(geo_all)
        other_dim = elem_count // NUM_CLASSES
        pruned_bytes = other_dim * k * FLOAT32_BYTES
        pruned_mb = pruned_bytes / BYTES_PER_MB
        savings_mb = weight_mb - pruned_mb
        print(f"Peso podado a {k} clases: {pruned_mb:.2f} MB (Ahorro potencial: {savings_mb:.2f} MB)")
        total_pruned_model_size_mb = fp32_size_mb - savings_mb
        print(f"Tamaño estimado de modelo podado: {total_pruned_model_size_mb:.2f} MB")

    # 6. Cuantización
    print("\n--- Generando y evaluando variantes cuantizadas ---")
    from onnxruntime.quantization import quantize_dynamic, QuantType

    # A) Dynamic INT8 Quantization
    int8_model_path = TMP_DIR / MODEL_DYNAMIC_INT8_NAME
    print(f"Generando modelo cuantizado INT8: {int8_model_path.name} ...")
    quantize_dynamic(
        model_input=str(fp32_model_path),
        model_output=str(int8_model_path),
        weight_type=QuantType.QInt8,
        per_channel=True,
        reduce_range=False
    )
    int8_size_mb = size_mb(int8_model_path)
    print(f"Tamaño INT8: {int8_size_mb:.2f} MB")

    sess_int8 = ort.InferenceSession(str(int8_model_path), providers=ONNX_PROVIDERS)
    int8_results = []
    latencies_int8 = []

    for item in evaluation_windows:
        inp = item["window"].reshape(1, WINDOW_SAMPLES)
        t0 = time.perf_counter()
        out = sess_int8.run([output_name], {input_name: inp})[0][0]
        t1 = time.perf_counter()
        latencies_int8.append((t1 - t0) * 1000)

        probs = 1.0 / (1.0 + np.exp(-out))
        top1_idx = int(np.argmax(probs))
        top1_label = labels[top1_idx]
        top1_prob = probs[top1_idx]
        correct = item["expected_sci"].lower() in top1_label.lower()
        int8_results.append({
            "id": item["id"],
            "expected": item["expected_sci"],
            "predicted": top1_label,
            "confidence": float(top1_prob),
            "correct": correct
        })
        print(f"  [INT8] {item['id']}: top-1 = {top1_label} (conf: {top1_prob:.4f}, correct: {correct})")

    acc_int8 = sum(r["correct"] for r in int8_results) / len(int8_results)
    avg_lat_int8 = np.mean(latencies_int8)
    print(f"INT8 Top-1 Exactitud: {sum(r['correct'] for r in int8_results)}/{len(int8_results)} ({100*acc_int8:.1f}%)")
    print(f"INT8 Latencia media CPU: {avg_lat_int8:.1f} ms")

    # B) Variante oficial optimizada para ARM (tphakala)
    arm_int8_path = TMP_DIR / MODEL_ARM_INT8_NAME
    download_file(MODEL_ARM_INT8_URL, arm_int8_path, MODEL_ARM_INT8_SHA256)
    arm_int8_size_mb = size_mb(arm_int8_path)

    sess_arm = ort.InferenceSession(str(arm_int8_path), providers=ONNX_PROVIDERS)
    arm_results = []
    latencies_arm = []
    for item in evaluation_windows:
        inp = item["window"].reshape(1, WINDOW_SAMPLES)
        t0 = time.perf_counter()
        out = sess_arm.run([output_name], {input_name: inp})[0][0]
        t1 = time.perf_counter()
        latencies_arm.append((t1 - t0) * 1000)

        probs = 1.0 / (1.0 + np.exp(-out))
        top1_idx = int(np.argmax(probs))
        top1_label = labels[top1_idx]
        top1_prob = probs[top1_idx]
        correct = item["expected_sci"].lower() in top1_label.lower()
        arm_results.append({
            "id": item["id"],
            "expected": item["expected_sci"],
            "predicted": top1_label,
            "confidence": float(top1_prob),
            "correct": correct
        })
        print(f"  [ARM-INT8] {item['id']}: top-1 = {top1_label} (conf: {top1_prob:.4f}, correct: {correct})")

    acc_arm = sum(r["correct"] for r in arm_results) / len(arm_results)
    avg_lat_arm = np.mean(latencies_arm)
    print(f"ARM-INT8 Top-1 Exactitud: {sum(r['correct'] for r in arm_results)}/{len(arm_results)} ({100*acc_arm:.1f}%)")
    print(f"ARM-INT8 Latencia media CPU: {avg_lat_arm:.1f} ms")

    # Resumen comparativo
    print("\n================================================================")
    print(" TABLA COMPARATIVA DE VALIDACIÓN (FASE 1)")
    print("================================================================")
    print(f"{'Variante':<25} | {'Tamaño (MB)':<12} | {'Top-1 Acc':<10} | {'Latencia CPU (ms)':<18}")
    print("-" * 72)
    print(f"{'FP32 (dfttrunc)':<25} | {fp32_size_mb:<12.2f} | {f'{100*acc_fp32:.0f}%':<10} | {avg_lat_fp32:<18.1f}")
    print(f"{'ORT Dynamic INT8':<25} | {int8_size_mb:<12.2f} | {f'{100*acc_int8:.0f}%':<10} | {avg_lat_int8:<18.1f}")
    print(f"{'ARM-Optimized INT8':<25} | {arm_int8_size_mb:<12.2f} | {f'{100*acc_arm:.0f}%':<10} | {avg_lat_arm:<18.1f}")
    print("================================================================")

    # Copiar la variante seleccionada a public/models/
    # Según los resultados de precisión, elegimos la variante que mantiene 100% de precisión y menor peso
    chosen_model_path = arm_int8_path if acc_arm == 1.0 else (int8_model_path if acc_int8 == 1.0 else fp32_model_path)
    target_onnx = PUBLIC_MODELS / MODEL_FILE
    with open(chosen_model_path, "rb") as src, open(target_onnx, "wb") as dst:
        dst.write(src.read())

    chosen_sha256 = hashlib.sha256(target_onnx.read_bytes()).hexdigest()
    chosen_size_bytes = target_onnx.stat().st_size
    print(f"\nVariante elegida para despliegue: {chosen_model_path.name}")
    print(f"Copiada a: {target_onnx.relative_to(BASE_DIR)}")
    print(f"Tamaño: {chosen_size_bytes / BYTES_PER_MB:.2f} MB")
    print(f"SHA-256: {chosen_sha256}")

    # Escribir manifest.json en public/models/ (ADR-05); updated_at is the day it was generated.
    manifest = {
        "model_id": MODEL_ID,
        "variant": chosen_model_path.name,
        "sample_rate": SAMPLE_RATE,
        "window_samples": WINDOW_SAMPLES,
        "window_seconds": WINDOW_SECONDS,
        "num_classes": len(labels),
        "sha256": chosen_sha256,
        "size_bytes": chosen_size_bytes,
        "labels_file": LABELS_FILE,
        "model_file": MODEL_FILE,
        "updated_at": date.today().isoformat()
    }
    manifest_path = PUBLIC_MODELS / MANIFEST_FILE
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"[OK] {manifest_path.name} escrito.")

if __name__ == "__main__":
    main()
