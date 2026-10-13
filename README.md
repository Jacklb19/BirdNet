# BirdNet Local

Aplicación web progresiva para el monitoreo continuo de aves por sonido. Identifica especies con un modelo acústico que corre en el navegador, funciona sin conexión y registra las detecciones con ubicación aproximada en un mapa colectivo.

- **Aplicación web**: https://birdnet-nu.vercel.app (este repositorio)
- **API**: https://bird-back.vercel.app ([Jacklb19/Bird_Back](https://github.com/Jacklb19/Bird_Back))

## Funciones

- Escucha continua con el micrófono, segmentada en ventanas de 3 s en un AudioWorklet, con espectrograma en vivo.
- Identificación en el dispositivo con BirdNET v2.4 (ONNX cuantizado, 6.522 especies) dentro de un Web Worker, filtrada por las aves probables del lugar y la semana. Quien quiera comparar puede descargar BirdNET+ V3 (vista previa) y elegirlo solo o junto al otro, y decidir si un canto dudoso debe oírse dos veces.
- Grabaciones: cada canto conserva en el teléfono un clip de 3 s comprimido (Opus) para oírlo después; solo sale del teléfono si la persona elige guardar sus grabaciones en su cuenta, donde son privadas, tienen tope y se pueden borrar.
- Revisión: tras oír la grabación, la persona confirma, corrige o descarta la detección; lo que dijo el modelo se conserva aparte.
- Política de confianza: ≥ 0,80 confirmada por el modelo local; 0,45–0,80 provisional; < 0,45 descartada. Toda detección muestra su confianza y estado.
- Funcionamiento sin conexión: modelo en caché con verificación SHA-256 y cola local de detecciones que se sincroniza sola, sin duplicados. La descarga del modelo se reanuda si se interrumpe, y la del modelo de vista previa sigue en segundo plano donde el navegador lo permite.
- Modo bolsillo: mientras escucha, la pantalla queda en negro y encendida y no responde a los toques, para llevar el teléfono guardado sin que deje de oír.
- Cuenta con Supabase Auth y mapa colectivo (MapLibre + OpenFreeMap) con agrupamiento y filtros por especie y periodo.
- Ubicación siempre aproximada (celdas de unos 10 m); cada persona decide si sus cantos se comparten en el mapa de todos.

## Tecnología

React 19, TypeScript, Vite, ONNX Runtime Web, Workbox, MapLibre GL y Supabase. Despliegue en Vercel (plan Hobby) y Supabase (plan Free).

## Desarrollo

Requiere la versión de Node.js indicada en `.nvmrc` (la misma que usa la integración continua).

```bash
npm ci
cp .env.example .env.local
npm run dev
```

La configuración vive en un solo lugar por tipo de valor:

- `.env.example`: todas las variables de entorno. Las `VITE_*` se validan en `src/config/env.ts` y, si quedan vacías, usan los valores del despliegue público.
- `build.config.mjs`: contrato del build (carpetas, nombre del service worker, recursos precacheados, cabeceras de aislamiento y valores por defecto de desarrollo), compartido por Vite, los scripts, Vitest, ESLint y Playwright.
- `vercel.json`: configuración del despliegue. Vercel no lee variables de entorno en este archivo, por eso el destino del rewrite `/api/*` (la URL de la API) y la CSP están escritos ahí. Si cambia la URL de la API o se usa un origen externo nuevo (mapa, fotos, Supabase), hay que actualizarlo; `src/config/config.test.ts` comprueba que la CSP permite los orígenes de la configuración por defecto.

En desarrollo y en `npm run preview`, Vite reenvía `/api` a `API_PROXY_TARGET` (por defecto, la API local del repositorio de la API; ver `BUILD_ENV_DEFAULTS` en `build.config.mjs`). Los puertos se cambian con `DEV_PORT` y `PREVIEW_PORT`.

| Comando | Uso |
|---|---|
| `npm run lint` / `npm run typecheck` | Análisis estático y tipos |
| `npm run test` | Pruebas unitarias (Vitest) |
| `npm run build` | Build de producción y precaché sin conexión |
| `npm run test:offline` | E2E sin conexión (Playwright; requiere el repositorio de la API) |
| `npm run data:species-names` | Regenera `public/models/species-names.json` desde la taxonomía de eBird (al cambiar el modelo) |
| `python scripts/eval/score-models.py`, `node scripts/eval/report.mjs`, `python scripts/eval/explore.py` | Miden la detección contra grabaciones etiquetadas y prueban ideas sobre lo ya medido (ver `docs/evaluacion.md`) |
| `python scripts/prepare-birdnet-plus.py` | Prepara para el navegador el filtro geográfico del V3 y el modelo BirdNET+ V3 (ver ADR-31 y `docs/despliegue.md`) |
| `npm run model:prepare` | Valida y prepara el modelo BirdNET (Python con numpy, scipy, requests, soundfile, onnx, onnxruntime y birdnet; descarga varios modelos) |

Variables opcionales de `npm run test:offline` (se leen del entorno del proceso): `BACKEND_DIR` (por defecto `../backend`), `BACKEND_PYTHON` (por defecto el Python de su `.venv`), `PW_CHANNEL` (por defecto el Chromium de Playwright: `npx playwright install chromium`; por ejemplo `msedge`), `PW_HEADLESS`, `E2E_HOST`, `E2E_PORT`, `E2E_API_PORT`, `E2E_TIMEOUT_MS` y `E2E_SERVER_TIMEOUT_MS`. Los valores por defecto están en `playwright.config.mjs`.

## Documentación

- `docs/definicion-proyecto.md`: especificación (requisitos, arquitectura y plan de sprints).
- `docs/decisiones.md`: decisiones de arquitectura adicionales.
- `docs/despliegue.md`: configuración de Supabase y Vercel.
- `docs/evaluacion.md`: cómo se mide la detección, formato del conjunto de prueba y resultados.
