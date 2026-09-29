"""
Fase 1: Validación Técnica Previa de BirdNET v2.4 (ADR-01, ADR-05, RF-03, RF-05, RNF-01, RNF-05, RNF-09)
Descarga el modelo ONNX de referencia (tphakala), valida la taxonomía, audios de prueba de xeno-canto,
evalúa el filtro regional de Bogotá, cuantiza a INT8 / FP16 y genera el reporte comparativo.
"""

import hashlib
import json
import os
import sys
import time
from pathlib import Path
import numpy as np
import requests
import soundfile as sf
import onnx
import onnxruntime as ort

BASE_DIR = Path(__file__).resolve().parent.parent
TMP_DIR = BASE_DIR / "tmp" / "models"
TMP_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_MODELS = BASE_DIR / "public" / "models"
PUBLIC_MODELS.mkdir(parents=True, exist_ok=True)
TEST_AUDIO_DIR = BASE_DIR / "public" / "test-audio"
TEST_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

HF_BASE = "https://huggingface.co/tphakala/BirdNET-v2.4/resolve/main"
LABELS_URL = f"{HF_BASE}/labels.txt"
MODEL_FP32_URL = f"{HF_BASE}/BirdNET_v2.4_fp32_dfttrunc.onnx"
MODEL_FP32_SHA256 = "3b72e88b3ad0c310a41adabccf8cf75b1a05daeeb40884ebd38038c91d0e423d"

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

def download_file(url: str, dest: Path, expected_sha256: str = None) -> Path:
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
    headers = {"User-Agent": "BirdNetLocal-Validation/1.0"}
    r = requests.get(url, stream=True, headers=headers)
    r.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)

    if expected_sha256:
        h = hashlib.sha256(dest.read_bytes()).hexdigest()
        assert h == expected_sha256, f"Hash mismatch para {dest.name}: {h} vs {expected_sha256}"
        print(f"[OK] {dest.name} descargado y verificado SHA-256 ({h[:10]}...).")
    else:
        print(f"[OK] {dest.name} descargado.")
    return dest

def main():
    print("================================================================")
    print(" FASE 1: VALIDACIÓN TÉCNICA PREVIA - BIRDNET v2.4")
    print("================================================================")

    # 1. Descarga labels.txt
    labels_path = PUBLIC_MODELS / "labels.txt"
    download_file(LABELS_URL, labels_path)
    with open(labels_path, "r", encoding="utf-8") as f:
        labels = [line.strip() for line in f if line.strip()]
    print(f"Total de clases cargadas en labels.txt: {len(labels)}")
    assert len(labels) == 6522, f"Se esperaban 6522 clases, pero hay {len(labels)}"

    # 2. Descarga modelo de referencia FP32
    fp32_model_path = TMP_DIR / "BirdNET_v2.4_fp32_dfttrunc.onnx"
    download_file(MODEL_FP32_URL, fp32_model_path, MODEL_FP32_SHA256)
    fp32_size_mb = fp32_model_path.stat().st_size / (1024 * 1024)
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
            # Resample a 48000 Hz si difiere
            if sr != 48000:
                from scipy.signal import resample_poly
                # Calcular gcd para resample_poly
                from math import gcd
                g = gcd(sr, 48000)
                up = 48000 // g
                down = sr // g
                data = resample_poly(data, up, down).astype(np.float32)
            else:
                data = data.astype(np.float32)

            # Normalizar
            peak = np.max(np.abs(data))
            if peak > 1e-4:
                data = data * (0.95 / peak)

            sf.write(str(wav_path), data, 48000, subtype='PCM_16')
            print(f"[OK] Audio procesado y guardado a 48 kHz: {wav_path.name} ({len(data)/48000:.1f} s)")

        # Cargar audio a 48 kHz
        data, sr = sf.read(str(wav_path))
        assert sr == 48000, f"Sample rate debe ser 48000, es {sr}"

        # Extraer la ventana de 3 s (144000 muestras) en el offset óptimo de vocalización
        window_size = 144000
        best_offset = int(item.get("target_offset_sec", 0.0) * 48000)
        chunk = data[best_offset : best_offset + window_size]
        if len(chunk) < window_size:
            chunk = np.pad(chunk, (0, window_size - len(chunk)))
        best_window = chunk

        # Normalizar la ventana a 0.95
        p = np.max(np.abs(best_window))
        if p > 1e-4:
            best_window = best_window * (0.95 / p)

        evaluation_windows.append({
            "id": item["id"],
            "expected_sci": item["scientific_name"],
            "expected_common": item["common_name"],
            "window": best_window.astype(np.float32),
            "offset_sec": best_offset / 48000.0,
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
            "sample_rate": 48000,
            "format": "wav",
            "channels": 1,
            "best_window_offset_sec": round(best_offset / 48000.0, 2)
        })

    # Guardar metadata.json en public/test-audio/
    metadata_json_path = TEST_AUDIO_DIR / "metadata.json"
    with open(metadata_json_path, "w", encoding="utf-8") as f:
        json.dump(metadata_records, f, indent=2, ensure_ascii=False)
    print(f"[OK] {metadata_json_path.name} escrito con los 4 audios de evaluación.")

    # 4. Evaluación del modelo FP32 de referencia
    print("\n--- Evaluando modelo FP32 de referencia ---")
    sess_fp32 = ort.InferenceSession(str(fp32_model_path), providers=["CPUExecutionProvider"])
    input_name = sess_fp32.get_inputs()[0].name
    output_name = sess_fp32.get_outputs()[0].name
    print(f"Entrada ONNX: '{input_name}', forma: {sess_fp32.get_inputs()[0].shape}")
    print(f"Salida ONNX: '{output_name}', forma: {sess_fp32.get_outputs()[0].shape}")

    fp32_results = []
    latencies_fp32 = []

    for item in evaluation_windows:
        inp = item["window"].reshape(1, 144000)
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
    avg_lat_fp32 = np.mean(latencies_fp32)
    print(f"FP32 Top-1 Exactitud: {sum(r['correct'] for r in fp32_results)}/{len(fp32_results)} ({100*sum(r['correct'] for r in fp32_results)/len(fp32_results):.1f}%)")
    print(f"FP32 Latencia media CPU: {avg_lat_fp32:.1f} ms")
    assert all_fp32_correct, "El modelo FP32 no acertó el 100% de los audios de prueba de referencia. Verificar audios."

    # 5. Filtro regional para Bogotá
    print("\n--- Evaluando filtro regional de Bogotá (lat 4.7110, lon -74.0721) ---")
    import birdnet
    geomodel = birdnet.load("geo", "3.0", "onnx")
    geo_all = geomodel.predict(4.7110, -74.0721, min_confidence=0.03).to_structured_array()
    geo_week = geomodel.predict(4.7110, -74.0721, week=40, min_confidence=0.03).to_structured_array()
    print(f"Especies en Bogotá (todas las semanas, umbral 0.03): {len(geo_all)}")
    print(f"Especies en Bogotá (semana 40, umbral 0.03): {len(geo_week)}")

    # Análisis de poda de la capa de salida en el grafo ONNX
    print("\n--- Análisis de poda de capa de salida vs máscara por software ---")
    onnx_model = onnx.load(str(fp32_model_path))
    # Buscar el tensor de pesos de la capa final
    final_weights = None
    for init in onnx_model.graph.initializer:
        if 6522 in init.dims:
            final_weights = init
            print(f"Capa final encontrada: '{init.name}', dimensiones: {init.dims}, elementos: {np.prod(init.dims)}")

    if final_weights:
        elem_count = np.prod(final_weights.dims)
        weight_bytes = elem_count * 4 # float32
        weight_mb = weight_bytes / (1024 * 1024)
        print(f"Peso de la capa densa final (6.522 clases): {weight_mb:.2f} MB")
        
        # Si se podara a K especies de Bogotá (~895):
        k = len(geo_all)
        other_dim = elem_count // 6522
        pruned_bytes = other_dim * k * 4
        pruned_mb = pruned_bytes / (1024 * 1024)
        savings_mb = weight_mb - pruned_mb
        print(f"Peso podado a {k} clases: {pruned_mb:.2f} MB (Ahorro potencial: {savings_mb:.2f} MB)")
        total_pruned_model_size_mb = fp32_size_mb - savings_mb
        print(f"Tamaño estimado de modelo podado: {total_pruned_model_size_mb:.2f} MB")
    
    # 6. Cuantización
    print("\n--- Generando y evaluando variantes cuantizadas ---")
    from onnxruntime.quantization import quantize_dynamic, QuantType

    # A) Dynamic INT8 Quantization
    int8_model_path = TMP_DIR / "BirdNET_v2.4_int8.onnx"
    print(f"Generando modelo cuantizado INT8: {int8_model_path.name} ...")
    quantize_dynamic(
        model_input=str(fp32_model_path),
        model_output=str(int8_model_path),
        weight_type=QuantType.QInt8,
        per_channel=True,
        reduce_range=False
    )
    int8_size_mb = int8_model_path.stat().st_size / (1024 * 1024)
    print(f"Tamaño INT8: {int8_size_mb:.2f} MB")

    sess_int8 = ort.InferenceSession(str(int8_model_path), providers=["CPUExecutionProvider"])
    int8_results = []
    latencies_int8 = []

    for item in evaluation_windows:
        inp = item["window"].reshape(1, 144000)
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

    # B) FP16 Variant (si es compatible con el operador o mediante onnx converter)
    # También podemos evaluar la variante oficial tphakala BirdNET_v2.4_int8_arm_dfttrunc.onnx
    arm_int8_url = f"{HF_BASE}/BirdNET_v2.4_int8_arm_dfttrunc.onnx"
    arm_int8_path = TMP_DIR / "BirdNET_v2.4_int8_arm_dfttrunc.onnx"
    arm_int8_sha256 = "7550498ba996064feca12005ff4133eb1d35741c4061376e7a987d8227518893"
    download_file(arm_int8_url, arm_int8_path, arm_int8_sha256)
    arm_int8_size_mb = arm_int8_path.stat().st_size / (1024 * 1024)

    sess_arm = ort.InferenceSession(str(arm_int8_path), providers=["CPUExecutionProvider"])
    arm_results = []
    latencies_arm = []
    for item in evaluation_windows:
        inp = item["window"].reshape(1, 144000)
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
    print(f"{'FP32 (dfttrunc)':<25} | {fp32_size_mb:<12.2f} | {f'{100*1.0:.0f}%':<10} | {avg_lat_fp32:<18.1f}")
    print(f"{'ORT Dynamic INT8':<25} | {int8_size_mb:<12.2f} | {f'{100*acc_int8:.0f}%':<10} | {avg_lat_int8:<18.1f}")
    print(f"{'ARM-Optimized INT8':<25} | {arm_int8_size_mb:<12.2f} | {f'{100*acc_arm:.0f}%':<10} | {avg_lat_arm:<18.1f}")
    print("================================================================")

    # Copiar la variante seleccionada a public/models/
    # Según los resultados de precisión, elegimos la variante que mantiene 100% de precisión y menor peso
    chosen_model_path = arm_int8_path if acc_arm == 1.0 else (int8_model_path if acc_int8 == 1.0 else fp32_model_path)
    target_onnx = PUBLIC_MODELS / "birdnet_model.onnx"
    with open(chosen_model_path, "rb") as src, open(target_onnx, "wb") as dst:
        dst.write(src.read())

    chosen_sha256 = hashlib.sha256(target_onnx.read_bytes()).hexdigest()
    chosen_size_bytes = target_onnx.stat().st_size
    print(f"\nVariante elegida para despliegue: {chosen_model_path.name}")
    print(f"Copiada a: {target_onnx.relative_to(BASE_DIR)}")
    print(f"Tamaño: {chosen_size_bytes / (1024*1024):.2f} MB")
    print(f"SHA-256: {chosen_sha256}")

    # Escribir manifest.json en public/models/manifest.json (ADR-05)
    manifest = {
        "model_id": "birdnet-v2.4",
        "variant": chosen_model_path.name,
        "sample_rate": 48000,
        "window_samples": 144000,
        "window_seconds": 3.0,
        "num_classes": 6522,
        "sha256": chosen_sha256,
        "size_bytes": chosen_size_bytes,
        "labels_file": "labels.txt",
        "model_file": "birdnet_model.onnx",
        "updated_at": "2026-09-29"
    }
    manifest_path = PUBLIC_MODELS / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"[OK] {manifest_path.name} escrito.")

if __name__ == "__main__":
    main()
