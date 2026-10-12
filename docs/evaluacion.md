# Evaluación de la detección

Cómo se mide qué tan bien detecta Trino, con qué datos y cómo repetir la medición. Sirve para comparar modelos y reglas de decisión con números antes de cambiar lo que usa la app (RF-05, RF-06, RNF-09). No se entrena nada: solo se ejecutan modelos ya publicados sobre grabaciones etiquetadas.

## Conjunto de prueba

Los audios y los modelos de evaluación viven fuera de git, en `BirdNet/eval/` (los audios nunca se versionan).

Un conjunto de prueba es una carpeta con:

- **Las grabaciones** (WAV, FLAC o MP3; cualquier frecuencia de muestreo).
- **Una pista de etiquetas de Audacity por grabación**, con el mismo nombre y extensión `.txt` (en Audacity: *Archivo → Exportar → Exportar etiquetas*). Una línea por sonido: `inicio<TAB>fin<TAB>nombre científico`, con los tiempos en segundos. Si quien etiqueta no está seguro, añade `?` al nombre (`Turdus fuscater?`): ese sonido ni se exige ni se cuenta como error.
- **`recordings.csv`**, una fila por grabación:

| Columna | Contenido |
|---|---|
| `file` | Ruta del audio, relativa a la carpeta |
| `recorded_at` | Fecha y hora local (`2026-10-11T06:15:00`); el filtro geográfico usa la semana |
| `latitude`, `longitude` | Dónde se grabó (vacías: no se aplica el filtro geográfico) |
| `device` | Con qué se grabó (teléfono, grabadora…) |
| `fully_annotated` | `yes` si se etiquetaron **todas** las aves que suenan; `no` si solo algunas. Los falsos positivos solo se cuentan en las grabaciones completas |
| `merlin_species` | Opcional: lo que dijo Merlin, para comparar |

- **`vocabulary.csv`** (opcional): `scientific_name`, `common_name`, `aliases` (otros nombres científicos de la misma especie, separados por `;`, para modelos con otra taxonomía).

### Conjunto usado

Vega-Hidalgo et al., *A collection of fully-annotated soundscape recordings from neotropical coffee farms in Colombia and Costa Rica* ([10.5281/zenodo.7525349](https://doi.org/10.5281/zenodo.7525349), CC BY 4.0): 34 grabaciones de una hora en cafetales de Jardín (Antioquia) y San Ramón (Costa Rica), anotadas por ornitólogos, con 89 especies. `scripts/eval/import-coffee-farms.py` lo convierte al formato de arriba.

Sus límites: son grabadoras de campo, no teléfonos, y Jardín no es Bogotá. Unas pocas grabaciones propias hechas con el teléfono y etiquetadas en el formato de arriba dirían más sobre el uso real.

## Cómo se mide

1. `python scripts/eval/score-models.py --dataset <carpeta> --out <salida>` ejecuta cada modelo sobre la rejilla de la app (ventanas de 3 s cada 1,5 s, con la misma normalización) y guarda lo que oyó en cada ventana. Un modelo con una entrada más larga (Perch, 5 s) recibe el audio centrado en el mismo instante.
2. `node scripts/eval/report.mjs --dataset <carpeta> --scores <salida>` aplica las reglas de decisión y los umbrales **con los mismos módulos de la app** (`windowPooling.ts`, `config/contract.ts`) y escribe `report.md` y `report.json`.

`scripts/eval/store-weights-as-half.py` genera la variante fp16 de un modelo fp32 (los pesos se guardan en media precisión y el cálculo sigue en float32).

### Métricas

Cada grabación se parte en tramos de 15 s y a cada tramo se le pregunta lo que una persona le pregunta a la Bitácora: ¿anotó la app esta especie más o menos cuando cantó? Así se comparan en igualdad de condiciones modelos con ventanas distintas y reglas que combinan varias ventanas. Una detección de una especie anotada hasta 3 s fuera del tramo no cuenta ni a favor ni en contra.

- **Precisión, exhaustividad y F1** con los umbrales de la app: 0,45 (se guarda) y 0,80 (confirmada).
- **Falsas alarmas por hora** de audio anotado completo.
- **Precisión media por especie (mAP)**: no depende del umbral, así que compara modelos aunque sus confianzas no estén en la misma escala.
- **Mejor F1** que se alcanzaría moviendo el umbral, y con qué umbral.
- **Especies por grabación**: halladas, perdidas e inventadas.
- **Fracción provisional**: qué parte de lo guardado cae en la banda intermedia.

La latencia que informa `score-models.py` es de la CPU donde se ejecuta, no de un teléfono.

### Reglas de decisión comparadas

- **Una ventana**: lo que hace la app hoy.
- **Promedio de 2 o de 3**: la confianza es el promedio de las últimas ventanas; un pico aislado se diluye.
- **2 de 3**: la segunda confianza más alta de las tres últimas ventanas, de modo que una especie pasa un umbral solo si lo pasa en al menos dos.
