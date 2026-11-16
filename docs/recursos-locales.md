# Modelos y audio de pruebas fuera del repositorio

Los ONNX y grabaciones no se versionan. Un clon incluye manifiesto, etiquetas, índices y metadatos de las muestras; no incluye binarios. `npm ci` no los descarga. La web publicada obtiene modelos de Storage; Vite en desarrollo los busca en `public/models/`.

## Inferencia local con los modelos publicados

Desde `frontend/`, en PowerShell, descargar las versiones que corresponden al manifiesto incluido:

```powershell
$resourceBase = 'https://tugzxyleoidiimhbnwde.supabase.co/storage/v1/object/public/models/birdnet-v2.4'
$files = @(
  'birdnet_model.onnx',
  'birdnet_geo_model_v3.onnx',
  'birdnet_plus_model.part1.onnx',
  'birdnet_plus_model.part2.onnx',
  'birdnet_plus_geo_model.onnx'
)
foreach ($file in $files) {
  Invoke-WebRequest -Uri "$resourceBase/$file" -OutFile (Join-Path 'public/models' $file)
}
node scripts/check-model-resources.mjs
```

Son unos 133 MB y consumen egreso del proyecto: descargar solo cuando se necesite y con autorización del dueño si se utiliza su infraestructura. No se ejecuta automáticamente durante instalación, build o pruebas. La comprobación no usa red; valida tamaños y SHA-256, incluyendo las dos partes en orden como un único modelo. Si falla, obtener los archivos correctos; no cambiar el manifiesto para silenciar el error.

Las etiquetas ya están en Git. Los manifiestos de API y web deben conservar el mismo contrato. No copiar los binarios a un commit; `.gitignore` excluye `*.onnx`.

## Muestras para las pruebas completas

`public/test-audio/metadata.json` identifica muestras, procedencia, licencia y desplazamiento anotado del canto. Los WAV deben estar en `public/test-audio/` con los nombres de ese manifiesto. No sustituirlos por archivos vacíos ni cambiar anotaciones para hacer pasar pruebas.

Se puede copiar localmente el corpus preparado del entorno de evaluación. Reconstruirlo desde sus fuentes utiliza `scripts/prepare-model.py`, que también convierte y evalúa modelos; no es un paso de instalación habitual. Requiere numpy, scipy, requests, soundfile, onnx, onnxruntime y birdnet compatibles. Ese entorno auxiliar no tiene un bloqueo independiente aprobado: no se presenta una instalación sin versiones como receta reproducible. Descargas o nuevas dependencias se preparan por separado con aprobación del dueño. Véase [evaluacion.md](evaluacion.md).

Sin binarios pueden ejecutarse lint, tipos, build, unitarias que no requieren ONNX y la selección E2E de cuenta/beta/integridad de CI. La unitaria de inferencia real se omite si no existe el modelo; no confundir esa omisión con validación del clasificador. Las E2E de importación real, modelos, descargas y rendimiento sí requieren los archivos anteriores.

## Preparación avanzada

- `scripts/prepare-geo-model.py` conserva la conversión del filtro v2.4 para comparaciones históricas.
- `scripts/prepare-birdnet-plus.py` exige los archivos fuente exactos y verifica sus hashes antes de generar el filtro V3 y clasificador dividido. Las entradas se documentan al inicio del script.
- Cambiar modelos, hashes o selección por defecto requiere la decisión del dueño; no forma parte de preparar una copia de la versión actual.

Los recursos preparados para una prueba local no se publican. El orden de despliegue y la subida aprobada de modelos están en [despliegue.md](despliegue.md).
