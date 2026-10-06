# Verificación del Sprint 4

Implementación local en `sprint-4/offline-sync`, 6 de octubre de 2026. Entregable: cola persistente, identificación sin red y sincronización idempotente desde el trabajador de servicio. No hubo push, merge, despliegue ni acceso a proyectos remotos.

## Qué implementa

- **RF-07 / RNF-06/07**: IndexedDB compartido por el Worker de inferencia y el Service Worker. UUID por detección, instante de captura, confianza, estado, versión del modelo con SHA-256 y ubicación ya redondeada. La inferencia publica el resultado después de confirmar la transacción. El cierre normal espera la escritura activa antes de terminar el Worker.
- Cola de 64 MiB configurable, separada de la caché del modelo. Verificación nativa con 500 detecciones sin audio. WAV PCM16 mono a 48 kHz, tres segundos, 288.044 bytes por fragmento; un fragmento compartido entre candidatos de una ventana. Solo se conserva audio cuando su envío está autorizado. Si una escritura falla o se agota el límite, se informa y se detiene la escucha; no se eliminan pendientes automáticamente.
- **RF-17 / RNF-06**: manifiesto de instalación y precaché Workbox de HTML, JS, CSS, WASM, icono y metadatos del modelo. Se necesita visitar la aplicación con red, completar la preparación y descargar explícitamente el modelo antes de salir al campo. Una primera visita completamente sin internet no puede instalar recursos que el dispositivo nunca recibió.
- **RF-18 / ADR-05/07**: tamaño exacto previo, progreso por bytes, SHA-256 y comprobación de etiquetas; Cache Storage independiente. El puntero activo cambia solo tras validar todos los recursos. Una actualización fallida mantiene el modelo anterior; se detectan recursos ausentes o corruptos antes de inferir. Se solicita almacenamiento persistente y se avisa cuando el navegador no lo concede.
- **RF-08 / RNF-07**: sincronización en Service Worker, Background Sync donde esté disponible y reintentos visibles al abrir/reconectar y cada 30 s mientras la página esté visible. Las solicitudes concurrentes se agrupan; Web Locks serializa los consumidores donde esté disponible. Sin Web Locks se conserva la idempotencia por UUID en el servidor.
- Confirmación separada de metadatos y audio. Los UUID aceptados/existentes solo eliminan registros sin audio pendiente. El audio se sube directamente a Storage, se valida en el servidor y se vincula mediante un segundo lote con el mismo UUID. Su confirmación permite liberar la referencia local; el trabajo de verificación se crea una sola vez.

## Backend y límites de alcance

FastAPI tiene tres rutas: `POST /v1/detections/batch`, `POST /v1/detections/{id}/audio-url` y `GET /v1/model/latest`. En el mismo origen se accede mediante el prefijo `/api`; Vite lo redirige al servidor local en desarrollo y vista previa.

El lote tiene un máximo de 50 detecciones y no contiene audio. Se verifican JWT, emisor, audiencia, caducidad y rol. Las claves asimétricas se obtienen de JWKS; el secreto HS256 es opcional para instalaciones heredadas. El propietario sale de la identidad verificada. PostgreSQL usa `ON CONFLICT DO NOTHING` en una transacción bajo el rol `authenticated`, con RLS y las reclamaciones de identidad activas. Una colisión ajena no produce confirmación y revierte el lote.

La firma de Storage usa la clave de servicio exclusivamente en el servidor, ruta privada por propietario y UUID, y autorización de sustitución para reintentos. Antes de vincular, la API verifica ruta y formato de los bytes WAV. Se conservan la seguridad por filas y la cuadrícula de la migración inicial; una nueva migración garantiza un único trabajo de verificación por detección.

`MODEL_MANIFEST_URL` permite leer un manifiesto actualizado en Supabase Storage sin redesplegar el cliente. Sin esa variable se utiliza el manifiesto local. El binario y las etiquetas se descargan desde las rutas del manifiesto; el navegador valida la compatibilidad y el hash. No se publicó ni configuró un recurso remoto durante S4.

La pantalla de acceso pertenece a S5. Sin sesión válida, los registros permanecen locales. `bindSyncSession` deja preparada la asociación explícita a una cuenta; no reasigna registros de otro propietario. Sin ubicación de la ventana, la detección permanece local: no se le asignan coordenadas de otro momento. Mapa y filtros: S5. Verificación acústica en nube, corrección y fichas divulgativas: S6.

## Cómo reproducir las pruebas

Los comandos siguientes se ejecutan desde la raíz. En este equipo el comando global `npm` tiene una ruta rota; funciona el CLI incluido con Node:

```powershell
$birdnetNpmCli = 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js'
node $birdnetNpmCli run lint
node $birdnetNpmCli run typecheck
node $birdnetNpmCli run test:coverage
node $birdnetNpmCli run build
```

Para el backend, utilizar Python 3.12 y un entorno `.venv`, con `python -m pip install -r requirements-dev.txt`. `requirements.txt` y `requirements-dev.lock.txt` fijan también las dependencias transitivas; se regeneran desde `requirements.in` con `python scripts/lock-python.py`. No se necesitan secretos reales para las pruebas.

Crear exclusivamente la base temporal local de pruebas, con Docker activo:

```powershell
docker run --name birdnet-s4-test --rm -d -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55434:5432 postgis/postgis@sha256:94146ac37bc61e2322f88016056c5920729cb8c64c8542ed590af8fc2abdac07
.venv/Scripts/python.exe -m backend.tests.prepare_database
$env:BIRDNET_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55434/birdnet_s4_test'
.venv/Scripts/python.exe -m pytest backend/tests -q
node $birdnetNpmCli run test:offline
docker stop birdnet-s4-test
```

`prepare_database` crea solo la base de pruebas de loopback y el esquema mínimo de identidad necesario para ejecutar las migraciones reales. No utiliza ni inicializa Supabase remoto. Las pruebas de PostgreSQL se omiten explícitamente si no está habilitada esa base local.

Playwright usa Edge instalado en Windows, un backend de prueba local y Vite en el puerto 9014. El backend de prueba introduce una respuesta perdida después del commit y un almacenamiento de audio simulado; usa PostgreSQL real y JWT firmados de prueba. Estos endpoints se excluyen de la función distribuida. El puente del navegador se genera en `tmp/` y utiliza exactamente el Worker de producción; no se añade al precaché ni a la aplicación instalada.

El modelo y las grabaciones reales existentes en `public/` están excluidos de Git. La prueba de identificación necesita esos recursos locales. CI queda configurada para frontend, cobertura, build, backend y migraciones con PostGIS; su ejecución en GitHub no se comprobó porque no se hizo push. Las pruebas E2E con modelo real aún dependen de preparar la distribución reproducible pendiente desde S2.

## Evidencia y criterios

- Lint, typecheck y build: código de salida 0.
- Vitest: 32 archivos; 205 pruebas aprobadas, incluidos 1.000 escenarios de capacidad/confirmación, integridad de descarga, permisos revocados, validación de respuestas y publicación posterior al commit.
- Cobertura Vitest: líneas 84,97 %, ramas 73,56 %, funciones 70,43 %, sentencias 80,67 %. Se conserva el umbral global de 70 %. Las ejecuciones nativas de IndexedDB y Service Worker están verificadas por Playwright y no se incorporan al contador de cobertura de Vitest.
- pytest: 28 pruebas aprobadas, con cuatro pruebas sobre PostgreSQL/PostGIS real. Se prueban 20 reenvíos concurrentes de 50 detecciones, rollback completo ante UUID ajeno, RLS en las cinco tablas y creación única de trabajos.
- Playwright/Edge: 10 pruebas aprobadas. Persistencia de 500 registros tras cerrar y reabrir sin red, rechazo transaccional por cuota, respuesta perdida y reintento sin duplicados, sincronización que termina tras cerrar la página, consentimiento, registros sin cuenta/ubicación, modelo real sin red, actualización inválida y caché corrupta, y controles a 360/1280 px en claro/oscuro.
- Build: aplicación JS principal de aproximadamente 270 kB y CSS de 26,27 kB. El precaché incluye el WASM, por lo que los recursos de funcionamiento sin red suman aproximadamente 14,65 MB sin compresión; el ONNX de 38.727.042 bytes se descarga por separado y explícitamente.
- Capturas locales en `tmp/sprint4-*.png`, revisadas visualmente; fuera de Git. Tokens, idioma, contraste y foco siguen el sistema existente.
- `npm audit`: cero vulnerabilidades. Se actualizó únicamente la dependencia transitiva `source-map-js` afectada por el aviso de instalación.
- Aviso no bloqueante del proveedor de pruebas: Starlette advierte de una futura sustitución de `httpx` en `TestClient`; las pruebas pasan y no se agregó otra dependencia para silenciarlo.

| Criterio | Resultado | Evidencia o límite |
|---|---|---|
| HU-04: identificación sin red y cola local | Cumplido localmente | Modelo real de referencia en Edge, con PWA preparada y red desactivada |
| HU-05: reintento sin duplicados | Cumplido con identidad de prueba | Service Worker, respuesta perdida y PostgreSQL real |
| HU-05: cuenta real y nube | No verificable todavía | Acceso de S5 y despliegue no realizados |
| RNF-06: al menos 500 detecciones persistentes | Cumplido localmente | 500 registros sin audio, cierre y reapertura sin red |
| RNF-07: integridad ante fallos ensayados | Cumplido localmente | Escritura previa a publicación, cuota, corte de respuesta y reintentos |
| RF-17: manifiesto y recursos instalables | Implementado | Instalación física desde el navegador queda manual |
| RF-18: actualización íntegra y fallback | Cumplido localmente | Descarga válida; actualización con hash inválido conserva la versión anterior |

## Lo que debe medir el usuario

1. En una terminal, iniciar `.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000` (el manifiesto público local no necesita secretos). En otra, abrir el build con `npm run preview`, ir a Configuración y descargar el modelo con red. Esperar el estado de caché válida.
2. En el dispositivo de campo, instalar la PWA, conceder micrófono y, si lo desea, ubicación aproximada y envío de audio dudoso.
3. Activar modo avión, escuchar, detener, cerrar y reabrir. Confirmar que sigue identificando y que aumentan/se conservan los pendientes. La sincronización real se prueba después de conectar la cuenta en S5.
4. Medir micrófono físico, permisos reales de geolocalización, batería, latencia móvil, sol y uso caminando con una mano. Verificar Safari/iOS y los límites de ejecución en segundo plano del sistema operativo.

El navegador puede purgar almacenamiento si no concede persistencia, y el usuario puede borrar sus datos. Background Sync tampoco garantiza actividad con el navegador o el sistema operativo totalmente detenidos. Las pruebas de escritorio no constituyen pruebas de campo ni validación de esas condiciones.

La configuración local de Vercel declara 60 s y excluye tests, grabaciones y binarios del paquete Python. Se consultaron la [configuración oficial de duración](https://vercel.com/docs/functions/configuring-functions/duration), la [guía de FastAPI](https://vercel.com/docs/frameworks/backend/fastapi) y el [protocolo de firma de Storage](https://github.com/supabase/storage/blob/master/src/http/routes/object/getSignedUploadURL.ts). Su funcionamiento remoto y el tamaño final de la función siguen sin verificar porque no se desplegó.
