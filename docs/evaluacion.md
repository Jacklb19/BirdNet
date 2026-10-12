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

Segundo conjunto, independiente del laboratorio de BirdNET: los siete sitios colombianos de Pérez-Granados et al., *WABAD: A World Annotated Bird Acoustic Dataset for passive acoustic monitoring* ([10.5281/zenodo.14191524](https://doi.org/10.5281/zenodo.14191524), CC BY 4.0), publicado en noviembre de 2024: 400 grabaciones de un minuto anotadas por expertos locales, con 165 especies, de Antioquia, Quindío, Casanare y Arauca. `scripts/eval/import-wabad.py` lo convierte al formato de arriba.

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
- **Promedio de 2, lo seguro se queda**: como el promedio de 2, salvo que la ventana más reciente por sí sola llegue al umbral de «confirmada» (0,80): entonces vale su confianza. Solo lo dudoso tiene que oírse dos veces.

## Resultados (2026-10-11)

Medido sobre **7 horas** de Jardín, Antioquia (16.790 ventanas): las 7 grabaciones que se pudieron decodificar de las 10 descargadas hasta ese momento (el conjunto tiene 34; `libsndfile` no lee tres de esas diez). Informe completo en `BirdNet/eval/out/coffee-farms/report.md`. Precisión (P), exhaustividad (R) y F1 en porcentaje; FA/h son falsas alarmas por hora.

### 1. La cuantización no cuesta nada

Con filtro geográfico y una ventana, que es lo que hace la app hoy:

| Modelo | Tamaño | P ≥ 0,45 | R ≥ 0,45 | F1 | P ≥ 0,80 | R ≥ 0,80 | mAP |
|---|---|---|---|---|---|---|---|
| int8 (el de la app) | 36,9 MB | 73,2 | 64,9 | 68,8 | 91,5 | 42,0 | 65,0 |
| fp32 | 51,6 MB | 73,3 | 64,8 | 68,8 | 91,2 | 42,0 | 65,0 |
| fp16 (generado) | 25,9 MB | 73,6 | 64,8 | 68,9 | 91,6 | 42,0 | 65,0 |

Los tres eligen la misma especie en el 99 % de las ventanas y sus confianzas difieren en 0,003 de media. La razón: el int8 «ARM» solo cuantiza la última capa; el resto del modelo es el mismo. **Cambiar a fp32 o fp16 no mejora la detección.** fp16 solo ahorraría 11 MB de descarga. En la CPU de escritorio los tres tardan entre 11 y 13 ms por ventana; en un teléfono no se midió.

### 2. El filtro geográfico es lo que más pesa

| int8, una ventana | P ≥ 0,45 | R ≥ 0,45 | F1 | FA/h | Especies inventadas |
|---|---|---|---|---|---|
| Sin filtro geográfico | 44,9 | 66,1 | 53,5 | 192 | 165 |
| Con filtro (la app) | 73,2 | 64,9 | 68,8 | 56 | 39 |

A cambio, el filtro deja fuera algunas aves que sí estaban (3 especies más perdidas sumando las grabaciones).

### 3. Decidir con varias ventanas cambia falsas alarmas por cantos perdidos

int8 con filtro geográfico:

| Regla | P ≥ 0,45 | R ≥ 0,45 | F1 | FA/h | P ≥ 0,80 | R ≥ 0,80 | FA/h ≥ 0,80 |
|---|---|---|---|---|---|---|---|
| Una ventana (hoy) | 73,2 | 64,9 | 68,8 | 56 | 91,5 | 42,0 | 9,3 |
| Promedio de 2 | 81,4 | 59,6 | 68,8 | 32 | 92,6 | 33,9 | 6,4 |
| Promedio de 3 | 86,7 | 53,3 | 66,0 | 19 | 94,5 | 28,1 | 3,9 |
| 2 de 3 | 84,4 | 54,6 | 66,3 | 24 | 93,9 | 31,3 | 4,9 |
| Promedio de 2, lo seguro se queda | 81,4 | 59,6 | 68,8 | 32 | 91,3 | 42,1 | 9,6 |

Ninguna regla sube el F1: todas cambian precisión por exhaustividad. La última es la única que no pierde nada entre las confirmadas: quita el 43 % de las falsas alarmas entre lo que se guarda (de 56 a 32 por hora) a cambio de 5 puntos de exhaustividad, todos en la banda provisional.

### Decisión

Con estos números el dueño decidió mantener el int8 y conectar la regla «promedio de 2, lo seguro se queda» (ADR-30).

### 4. Perch v2 como segunda opinión (RF-09)

Perch v2 (Google DeepMind, Apache-2.0) es otro modelo, entrenado con otros datos; su variante int8 pesa 125 MB y tarda unas seis veces más que BirdNET, así que solo cabría en la nube. Sus salidas no son probabilidades por especie, así que no se pueden comparar umbral a umbral con BirdNET: se comparan con las métricas que no dependen del umbral.

| Modelo, una ventana | mAP sin filtro | mAP con filtro | Mejor F1 sin filtro | Mejor F1 con filtro |
|---|---|---|---|---|
| BirdNET int8 | 67,6 | 65,0 | 58,8 | 69,2 |
| Perch v2 int8, confianza softmax | 47,7 | 45,8 | 43,3 | 52,5 |
| Perch v2 int8, puntuación propia de cada especie | 50,1 | 48,0 | 43,4 | 51,8 |
| Perch v2 fp32 (409 MB), puntuación propia de cada especie | 53,7 | 51,5 | 44,4 | 51,9 |

Con softmax, las aves que cantan a la vez se reparten una sola unidad de confianza, lo que perjudica a Perch en un coro del amanecer. La segunda fila le quita esa desventaja: ordena cada especie por su puntuación propia, sin repartirla con las demás. Sube 2 puntos de mAP y sigue 17 por debajo de BirdNET. La variante fp32, sin cuantizar, sube otros 3,5 y sigue 14 por debajo; su mejor F1 con filtro es el mismo.

Leído por grabación completa (una ventana, con filtro, umbral 0,45): de las 63 presencias anotadas (una especie en una grabación), Perch int8 encontró 43 e inventó 102, Perch fp32 encontró 49 e inventó 127, y BirdNET encontró 48 e inventó 39. Todas las especies anotadas existen en el vocabulario de Perch, así que la diferencia no viene de nombres que no coincidan.

**Conclusión.** En estas grabaciones Perch v2, cuantizado o no, no es mejor que el modelo que ya corre en el teléfono, así que no sirve como «modelo grande» que lo reemplace. Como segunda opinión sobre las detecciones dudosas sí aporta algo, poco (apartado 6).

### 5. Intentos de mejorar la detección sin entrenar (2026-10-12)

El dueño pidió acercar la detección a la de Merlin tanto como fuera realista. Se probó todo lo que no exige entrenar un modelo. Las filas marcadas con † son cálculos exploratorios sobre los mismos archivos de puntuaciones, hechos fuera de `report.mjs`; el resto se reproduce con las opciones de `score-models.py`.

**Otro modelo: BirdNET+ V3.0 (vista previa de desarrollo).** Es el sucesor del v2.4, del mismo equipo. Se midieron la variante que trae la app oficial BirdNET Live (65 MB, 9.789 especies, Apache-2.0) y el modelo completo (557 MB, 11.560 especies, CC BY-SA 4.0), cada uno con su propio modelo geográfico (`--geo v3`).

| Modelo, una ventana | mAP sin filtro | mAP con filtro | Mejor F1 con filtro | Reales / inventadas por grabación | ms por ventana (este PC, en reposo) |
|---|---|---|---|---|---|
| BirdNET v2.4 int8 (el de la app, 37 MB) | 67,6 | 65,0 | 69,2 | 48 / 39 | 15 |
| BirdNET+ V3.0 podado (65 MB) | 50,8 | 50,8 | 53,5 | 51 / 138 | 61 |
| BirdNET+ V3.0 completo (557 MB) | 53,1 | 53,1 | 55,3 | 50 / 89 | 97 |

El V3 encuentra dos o tres presencias más e inventa entre el doble y el triple. La variante regional «andes» (809 especies) se descartó sin medir: le faltan 45 de las 89 especies del vocabulario del conjunto, entre ellas varias de los Andes colombianos.

**Lo que oye el modelo.**

| Cambio | Efecto (7 h, regla de la app, con filtro) |
|---|---|
| Quitar la normalización de volumen de la app (`--no-normalize`) | Ninguno: ni el v2.4 ni el V3 dependen del nivel (las confianzas cambian menos de 0,01) |
| Una ventana cada 1,0 s en vez de cada 1,5 s (`--hop-seconds 1.0`) | F1 de 68,8 a 70,2; exhaustividad de 59,6 a 63,3; falsas alarmas de 32 a 41 por hora; 50 % más de cómputo |

**Reglas de decisión †.** Todas se mueven sobre la misma curva: lo que ganan en precisión lo pierden en cantos encontrados.

| Regla | Efecto |
|---|---|
| Memoria de sesión: a un ave ya confirmada se le cree desde una confianza menor | +1 a 2 puntos de F1 en las 7 h, ninguno en las 13 h de validación |
| Quedarse solo con las 1 a 3 aves más probables de cada ventana | Ninguno |
| Umbral del filtro geográfico de 0,01 a 0,3 | 0,03 (el actual) y 0,1 dan lo mismo; desde 0,2 se pierden especies reales |
| Promediar 3 ventanas, o mover el umbral de «lo seguro se queda» | Cambian falsas alarmas por cantos perdidos |

**Validación en 13 horas que no se habían usado** (el resto de grabaciones que se dejan decodificar, de los dos sitios). El modelo de la app rinde menos ahí, y la regla del ADR-30 cuesta más de lo que costaba en las 7 primeras:

| 13 h, con filtro | Precisión | Exhaustividad | Falsas alarmas/h | Reales encontradas / inventadas por grabación |
|---|---|---|---|---|
| Una ventana | 72,9 | 50,4 | 41,8 | 121 de 194 / 58 |
| Promedio de 2, lo seguro se queda (ADR-30) | 79,3 | 45,5 | 26,4 | 106 de 194 / 30 |

La regla quita la mitad de las especies inventadas y pierde 15 presencias reales; equivale más o menos a subir el umbral de guardado a 0,60.

**Conclusión.** En estas grabaciones, sin entrenar no hay mejora realista más allá de lo ya hecho (filtro geográfico y regla de dos ventanas), y ninguno de los modelos públicos medidos supera al v2.4. El apartado 7 muestra que en otras grabaciones el resultado es el contrario.

### 6. Segunda opinión sobre las detecciones dudosas (RF-09) †

Un modelo peor en conjunto puede servir todavía para respaldar las detecciones dudosas del primero si se equivoca en cosas distintas. De las 450 detecciones dudosas (confianza 0,45 a 0,80) que la app guardaría en las 7 horas, el 65 % eran correctas.

| Segundo modelo | Respalda (umbral) | Casos | Correctas | Dudosas correctas que verificaría |
|---|---|---|---|---|
| Perch v2 int8, softmax | ≥ 0,20 | 95 | 89,5 % | 29 % |
| Perch v2 int8, softmax | ≥ 0,10 | 166 | 78,9 % | 45 % |
| BirdNET+ V3.0 completo | ≥ 0,70 | 122 | 77,9 % | 33 % |

Cuando el segundo modelo no la respalda, la detección sigue siendo correcta entre el 56 % y el 65 % de las veces: no sirve para descartar. Perch, que es independiente de BirdNET, respalda mejor que el V3, que es de la misma familia. Los umbrales se eligieron mirando estos mismos datos y son pocos casos, así que las cifras son optimistas; además Perch oyó 5 segundos y el fragmento que sube la app dura 3.

### 7. Un segundo conjunto cambia el orden de los modelos (2026-10-12)

El dueño preguntó si el V3 perdía por el modelo o por las grabaciones. Se repitió la medición en los siete sitios colombianos de WABAD (400 minutos), grabados por otros grupos, con otros equipos, y publicados después del v2.4, que por tanto no pudo entrenarse con ellos. Cada modelo usa su propio filtro geográfico; una ventana.

| 400 min, con filtro | mAP sin filtro | Precisión (≥ 0,45) | Exhaustividad (≥ 0,45) | Mejor F1 | Presencias encontradas de 1.619 / inventadas |
|---|---|---|---|---|---|
| BirdNET v2.4 int8 (el de la app) | 40,2 | 85,1 | 21,7 | 45,2 | 413 / 104 |
| BirdNET+ V3.0 podado (65 MB) | 51,6 | 69,3 | 56,0 | 62,0 | 987 / 657 |
| BirdNET+ V3.0 completo (557 MB) | 53,6 | 74,9 | 52,5 | 63,1 | 940 / 428 |
| Perch v2 fp32 | 47,3 | 70,3 | 38,0 | 49,7 | 709 / 442 |

Aquí el v2.4 casi no se equivoca, pero deja sin detectar tres de cada cuatro presencias anotadas; el V3 encuentra más del doble, con más falsas alarmas. La diferencia se repite en cada uno de los siete sitios (el V3 encuentra entre 1,4 y 5 veces más). A precisión parecida el V3 sigue por delante: guardando solo desde 0,80 queda en 86 % de precisión con 572 presencias, frente a 85 % y 413 del v2.4. La regla del ADR-30 le cuesta al v2.4 otro 17 % de lo que encuentra (413 → 343).

**Los dos conjuntos no coinciden.** En los cafetales (del laboratorio de BirdNET, 2023) gana el v2.4; en WABAD (independiente, 2024) gana el V3. Cualquiera de los dos resultados puede venir de que el modelo ganador se entrenó o se ajustó con esas grabaciones o con otras parecidas, y no hay forma de saberlo desde fuera. Lo único que no admite esa duda es el resultado del v2.4 en WABAD: no pudo verlo, y ahí su exhaustividad es del 22 %. Es además lo que se observa en el uso real frente a Merlin.

**El filtro geográfico del v2.4 falla en la alta montaña.** En los dos sitios de bosque altoandino (Salento y El Vergel) excluye 18 de las 41 y 18 de las 32 especies anotadas. El modelo geográfico del V3 (13,6 MB, Apache-2.0) excluye una. Usar el del V3 para filtrar las especies del v2.4 † mejora en los tres conjuntos sin tocar el clasificador:

| v2.4, una ventana | Presencias encontradas / inventadas con su filtro | Con el filtro del V3 |
|---|---|---|
| WABAD Colombia (400 min) | 413 / 104 | 480 / 118 |
| Cafetales, 7 h | 48 / 39 | 51 / 50 |
| Cafetales, 13 h de validación | 121 / 58 | 129 / 75 |

**Combinar los dos clasificadores †** (promedio de sus confianzas) queda entre ambos: en WABAD encuentra 614 presencias frente a las 413 del v2.4 solo, con las mismas inventadas (109 y 104) y 89 % de precisión; en los cafetales queda parecido al v2.4 solo (53 / 32 en las 7 h, 115 / 73 en las 13 h). Pide los dos modelos en el teléfono.

**Qué se desprende.** Ya no se puede afirmar que el v2.4 sea el mejor modelo disponible: depende de dónde se mida. El V3 es una vista previa de desarrollo, pesa 65 MB y tarda unas cuatro veces más por ventana. Decidir entre los dos pide grabaciones propias hechas con teléfono, o probar ambos en campo.

### Lo que estos números no dicen

- Son grabadoras de campo en un cafetal de Antioquia, no un teléfono en Bogotá: sirven para comparar variantes entre sí, no como la precisión que verá una persona.
- Más de la mitad de lo que la app guarda (56 %) es provisional.
- No comparan con Merlin: su modelo no es público.
- El conjunto lo publicó el mismo laboratorio que hace BirdNET, y la literatura sitúa a Perch 2.0 por encima de BirdNET en promedio. No se puede descartar que estas grabaciones favorezcan al v2.4 (por parecerse a sus datos de entrenamiento, o por estar entre ellos). Solo grabaciones propias, hechas con teléfono y con las especies anotadas por alguien que las conoce, lo aclararían.
