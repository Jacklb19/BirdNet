# Trino

Aplicación web progresiva para reconocer posibles aves por su canto, revisar lo escuchado y organizar salidas de campo. Proyecto académico de **Programación Orientada a la Web**. El audio se analiza en el dispositivo con modelos BirdNET preentrenados; no se entrena un modelo propio.

- [Abrir Trino](https://birdnet-nu.vercel.app) · [Privacidad](https://birdnet-nu.vercel.app/privacy.html).
- Este repositorio contiene la web. La [API FastAPI](https://bird-back.vercel.app/v1/health) y las migraciones viven en [Jacklb19/Bird_Back](https://github.com/Jacklb19/Bird_Back).

## Funcionalidades

- Escucha con micrófono y espectrograma. Un AudioWorklet prepara ventanas de 3 s, solapadas cada 1,5 s; un Web Worker ejecuta ONNX fuera de la interfaz.
- BirdNET v2.4 y BirdNET+ V3. La selección automática usa **los dos juntos cuando el segundo está instalado**; mientras llega, o desde la siguiente escucha si el teléfono resultó demasiado lento, usa v2.4. Una elección explícita se conserva. La descarga del segundo se intenta en segundo plano según red, ahorro de datos y espacio (ADR-36).
- Confianza y estado, clips disponibles y revisión por la persona: confirmar, corregir o descartar. Una puntuación alta no garantiza una identificación científica; no detectar un ave no demuestra su ausencia.
- Modelos en caché con SHA-256, descargas reanudables y cola persistente sin conexión, sincronizada por UUID sin duplicados.
- Bitácora, álbum, guía, lugares y mapa. Caminatas con permiso independiente y exportación CSV/GPX. El mapa colectivo solo muestra los cantos que cada persona decide compartir.
- **Diario de salidas, línea temporal, importación local de audio, observaciones manuales, colecciones privadas y especies de interés.** Las observaciones manuales se distinguen de las acústicas; sus fotos opcionales solo permanecen en este dispositivo.
- **Asistente para consultar el historial y explicar cinco temas públicos.** Consultas y ajustes reconocibles se interpretan en el dispositivo y se consultan en la API; cuando hace falta interpretación externa se pide consentimiento `assistant-text-v2` y solo se adjunta el plan activo. Las consultas claras de lectura se ejecutan con filtros editables; las ambiguas piden aclaración. Las comparaciones las calcula la API y los resultados privados no regresan al modelo. Nunca recibe audio ni identifica especies (ADR-47).

Se necesita cuenta: sin sesión son públicas la portada, la privacidad y la guía. Con una sesión previamente iniciada, la escucha y los datos locales siguen disponibles sin red. Interfaz es/en, temas claro/oscuro y modo bolsillo donde el navegador permite mantener la pantalla encendida.

## Arquitectura

React 19 + TypeScript estricto + Vite; ONNX Runtime Web, IndexedDB, Workbox, MapLibre/OpenFreeMap y Supabase Auth. `/api/*` se reenvía a la API en desarrollo y en Vercel.

```text
Micrófono / archivo local → ventanas → Worker ONNX → IndexedDB
                                                   ↓ sincronización
Web → API FastAPI → JWT/AAL + RLS → PostgreSQL/PostGIS
                 → Storage privado mediante URLs firmadas
                 → Gemini: texto autorizado y contexto permitido
```

## Desarrollo local

Entorno verificado: **Node 24.19.0** ([.nvmrc](.nvmrc)), npm 11.6.2; para la API, Python 3.12 y PostgreSQL con PostGIS. Mantener `frontend/` y `backend/` como carpetas hermanas facilita las E2E. Dependencias fijadas en [package.json](package.json) y [package-lock.json](package-lock.json).

Desde `frontend/`, en PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Completar **`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`** con la URL y clave pública `anon`/publishable del proyecto preparado según [despliegue](docs/despliegue.md). No hay valores de Auth predeterminados: dejarlas vacías solo permite visitar pantallas públicas. Nunca incluir `service_role` en variables `VITE_*`.

1. Preparar y arrancar la API en el puerto 8000 siguiendo su [README](https://github.com/Jacklb19/Bird_Back#desarrollo-local).
2. Para inferencia local, preparar los ONNX no versionados según [recursos locales](docs/recursos-locales.md). Abrir la interfaz y ejecutar pruebas sin modelos no exige descargarlos.
3. Ejecutar `npm run dev`. Vite usa el puerto 5173 por defecto y reenvía `/api` a `http://127.0.0.1:8000`. En desarrollo no se registra el Service Worker.

Para comprobar el funcionamiento sin conexión y la sincronización automática de la cola, ejecutar `npm run build` y después `npm run preview`: esas funciones requieren el Service Worker de la build.

En Bash, la copia es `cp .env.example .env.local`; los comandos npm son los mismos. Variables opcionales en [.env.example](.env.example), validadas por `src/config/env.ts`. `API_PROXY_TARGET`, `DEV_PORT` y `PREVIEW_PORT` solo afectan al servidor local.

## Comandos y pruebas

| Comando | Uso |
|---|---|
| `npm run dev` / `npm run preview` | Desarrollo / servir la build ya creada |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript estricto |
| `npm run test` / `npm run test:coverage` | Vitest / cobertura de lógica y contratos; las pruebas reales de ONNX requieren sus recursos |
| `npm run build` | TypeScript, Vite y precaché verificado; salida ignorada en `dist/` |
| `npm run build:e2e` | Build con Auth ficticio; no usar como build de producción |
| `npm run test:offline` | Preparar puente y ejecutar Playwright; requiere antes build E2E, API hermana, PostGIS temporal y recursos para la suite completa |
| `node scripts/check-model-resources.mjs` | Comprobar tamaños y hashes de modelos locales, sin descargarlos |
| `node scripts/measure-install.mjs` | Medir shell de la build y presupuesto de modelos |
| `npm run data:species-names` / `npm run data:species-photos` | Regenerar nombres / fotos; consultan fuentes externas |
| `npm run model:prepare` | Conversión/evaluación avanzada Python; requiere su entorno científico y descarga recursos externos |

Para E2E completas, arrancar **solo una base temporal propia**, aplicar las migraciones con `backend/tests/prepare_database.py` y dejar libres 8017/9014. La receta de la base está en el README de API. Con modelos y WAV de referencia preparados:

```powershell
npm run build:e2e
$env:E2E_API_PORT = '8017'
$env:PW_CHANNEL = 'msedge'
npm run test:offline
```

Playwright inicia y detiene API/preview. Auth e interpretación se simulan; PostgreSQL, RLS, IndexedDB, Worker y Service Worker son reales. Con la build normal las pruebas de cuenta se omiten explícitamente. Si no hay Edge, utilizar el Chromium de la versión fijada de Playwright; instalarlo es un prerrequisito separado.

CI ejecuta unitarias/cobertura/build y una selección E2E de cuenta, beta e integridad. No ejecuta toda la suite local ni las mediciones de rendimiento o el decodificador/ONNX real. [Validación beta](docs/beta-validacion.md) y [pruebas manuales](docs/pruebas.md) distinguen la evidencia y lo pendiente. Opciones avanzadas: `BACKEND_DIR`, `BACKEND_PYTHON`, `PW_CHANNEL`, `PW_HEADLESS`, `E2E_HOST`, `E2E_PORT`, `E2E_API_PORT`, `E2E_TIMEOUT_MS` y `E2E_SERVER_TIMEOUT_MS` en [playwright.config.mjs](playwright.config.mjs).

## Privacidad y límites

El original de audio permanece en el dispositivo. Solo los clips autorizados para la cuenta salen hacia Storage privado, con cuota y borrado. El permiso de recorridos es independiente. La posición se redondea a unos 10 m antes de guardarse; especies amenazadas de otras personas se generalizan a unos 11 km. No se comparten nombres ni notas en el mapa colectivo.

Enviar una pregunta escrita a Gemini requiere consentimiento explícito por cuenta/dispositivo, revocable. El aviso explica el uso de entradas/respuestas por el servicio gratuito y pide no incluir datos personales, sensibles ni confidenciales. Las preguntas no se guardan en un historial de Trino. Retirar el permiso no recupera texto ya enviado.

Modelos: unos 52,4 MB de base y 80,6 MB adicionales del segundo y su filtro, aparte de la aplicación. Se necesita instalación inicial con red y espacio suficiente. Codecs, Wake Lock, Background Fetch y almacenamiento dependen del navegador; Safari/iOS puede no ofrecer el codificador Opus. Siguen pendientes campo, batería y cuentas/dispositivos reales; no se declara WCAG completa ni precisión científica garantizada.

## Documentación y despliegue

- [Definición original y diferencias vigentes](docs/definicion-proyecto.md) · [Decisiones](docs/decisiones.md).
- [Supabase/Vercel y variables](docs/despliegue.md) · [Recursos locales](docs/recursos-locales.md).
- [Evaluación](docs/evaluacion.md) · [Auditoría previa](docs/auditoria-2026-11.md) · [Validación beta](docs/beta-validacion.md).
- [Pruebas de campo](docs/pruebas.md) · [Copia y recuperación](docs/recuperacion.md).

Vercel publica `main`; el trabajo local va en `dev`. El dueño aplica migraciones nuevas antes de publicar API y después web. COOP/COEP/CSP y proxy: [vercel.json](vercel.json); contrato de build: [build.config.mjs](build.config.mjs). No desplegar manualmente ni cambiar configuración remota como parte de las pruebas locales.

## Fuentes y licencias

- [BirdNET v2.4 ONNX](https://huggingface.co/tphakala/BirdNET-v2.4): [CC BY-NC-SA 4.0](https://huggingface.co/tphakala/BirdNET-v2.4/blob/main/LICENSE).
- [BirdNET+ V3 / BirdNET Live](https://github.com/birdnet-team/birdnet-live-app): pesos y etiquetas bajo [Apache 2.0](https://github.com/birdnet-team/birdnet-live-app/blob/main/MODEL_LICENSE).
- [eBird](https://science.ebird.org/en/use-ebird-data/the-ebird-taxonomy) para nombres; Wikipedia/Wikimedia Commons para textos/fotos; [GBIF](https://www.gbif.org/) para clasificación/distribución; [xeno-canto](https://xeno-canto.org/) para cantos de referencia. Cada recurso conserva su procedencia y licencia, indicadas en la interfaz.
- [OpenFreeMap](https://openfreemap.org/) y OpenStreetMap, con atribución en el mapa. Gemini redacta únicamente los textos señalados como tales.

**El código propio no tiene una licencia declarada por ahora, por decisión del dueño.** Las licencias de terceros no se extienden automáticamente al código de Trino ni sustituyen sus atribuciones.
