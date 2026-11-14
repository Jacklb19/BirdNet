# Correcciones de la auditoría — 2026-11-14

Dentro del cierre de S11, con autorización del dueño para aplicar la hoja de ruta. Se conservan el stack, los modelos elegidos, los permisos de audio y las decisiones de dominio. Requisitos relacionados: RF-01/02/07/08/11/12/15/16/17, RNF-03/05/06/07/08/10/12, con las modificaciones de los ADR vigentes sobre la especificación original.

## Estado de los 20 puntos

| ID | Mejora | Estado y alcance |
|---|---|---|
| A01 | Dependencias de Python afectadas | certifi 2026.10.23 y opentelemetry-api 1.45.2; bloqueos regenerados |
| A02 | Sincronización entre cuentas | Notas, veredictos y clips solo se envían con el dueño de la detección; lo ajeno sigue pendiente |
| A03 | Borrado local selectivo | Conserva historial y entidades relacionadas de las demás cuentas, también ante reintentos |
| A04 | Salida de la sesión | Detiene captura, espera al Worker y cierra GPS/caminata antes de salir o borrar; una ventana tardía no se asigna a la siguiente cuenta |
| A05 | Hora privada del mapa | Los filtros usan la hora publicada, redondeada para otras personas; prueba contra PostGIS |
| A06 | CSV grande | Páginas de hasta 4.000.000 bytes UTF-8 y cursor hora/UUID; el cliente reúne todo sin repetir cabecera |
| A07 | Privacidad de errores | Sentry usa una lista de campos permitidos; redacta valores de excepción y descarta contexto, variables, mensajes y datos adicionales |
| A08 | Cuota de grabaciones | Objetos inmutables, reserva máxima mientras vive la autorización y limpieza de objetos abandonados antes de liberar cuota; Ajustes explica las reservas |
| A09 | Copia/restauración | Ensayo local correcto y [procedimiento](recuperacion.md); pendiente la copia real y la recuperación de Auth/Storage |
| A10 | Dos salidas de una hora | Pendiente en teléfonos reales; no se sustituye por audio simulado |
| A11 | Dependencias de la web | Actualizadas las herramientas afectadas sin forzar versiones incompatibles; quedan 11 avisos de desarrollo (2 bajos, 9 moderados) |
| A12 | Carga, error y vacío | Álbum, Mi mapa y registros de cuenta distinguen fallos, permiten reintentar e indican resultados limitados |
| A13 | Caminatas simultáneas | Cursor inicio/UUID en lista y recorridos; regresión real en SQL |
| A14 | Asociación semántica de cifras del informe | Pendiente de decisión: frases verificadas por la API, agrupadas por el modelo. La comprobación actual de pertenencia de números no garantiza que una cifra describa la métrica correcta |
| A15 | Índice espacial | Migración nueva para `ubicacion::geometry`, con benchmark reproducible; falta aplicarla y medirla en producción |
| A16 | Lecturas locales crecientes | Los listados, cuota y expulsión de clips conservan solo metadatos; la subida carga un Blob a la vez. Se mide un historial de 5.000 registros, sin cambiar el esquema de la cola ni recortar datos |
| A17 | Regresiones en CI | Añadidas cola sin conexión, pérdida de respuesta, permisos, borrado selectivo e historial grande; pendiente observar la ejecución en GitHub tras publicar ambos repos |
| A18 | Análisis estático de API | Ruff 0.17.5 y mypy 2.4.1 aprobados, fijados y ejecutados también en CI |
| A19 | Límite remoto de peticiones | Pendiente: revisar tráfico y regla en ambos dominios, aprobar y comprobar respuesta 429; una regla en Log no bloquea |
| A20 | Descarga y costo | Script reproducible `node scripts/measure-install.mjs`, presupuesto local descrito abajo; falta contrastar tráfico real de las consolas |

## Evidencia y límites

La suite usa cuentas ficticias, API local, PostGIS temporal, IndexedDB real, Service Worker y Edge. No se modificaron variables remotas ni datos de producción. Los comandos y resultados finales quedan también en `PROGRESS.md` local.

- API: `python -m ruff check .`, `python -m mypy`, 186 pruebas con PostGIS y `python -m compileall -q birdnet_api api`: correctos. La suite conserva un aviso de deprecación de TestClient sobre httpx; no impide las pruebas.
- Web: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (595 pruebas, 86 archivos), `npm run build` y `npm run build:e2e`: correctos. Cobertura: 79,97 % de líneas, 74,81 % de ramas y 71,9 % de funciones; se mantiene el umbral de 70 %.
- Edge: `E2E_API_PORT=8017 PW_CHANNEL=msedge npx playwright test`, 32/32 correctas. Incluye modelos reales sin red, actualización, cuenta, pérdida de respuesta, borrado selectivo y micrófono simulado. Las capturas de álbum, mapa y reservas a 360/1280 px están en `tmp/audit-ui/`, fuera de git. En una comprobación las teselas externas no se mostraron; no se da por verificado el proveedor remoto del mapa.
- Minuto simulado: 37 ventanas analizadas, una perdida; mediana 120 ms, p90 129 ms y máximo 203 ms por ventana; ninguna tarea larga mayor de 50 ms observada en ese minuto. Esto no demuestra RNF-02 ni consumo de batería en campo.
- Historial local de 5.000 registros: lectura completa en 82 ms en Edge de escritorio durante la ejecución conjunta; el listado de clips no devuelve Blobs. Es tiempo transcurrido de lectura, no una medida de tarea principal ni una garantía para teléfonos o historiales mayores. La paginación/indexación del historial permanece como trabajo condicionado a esa medición en dispositivo.

El benchmark `backend/scripts/benchmark-map-index.py` crea una tabla temporal de 100.000 puntos y ejecuta tres veces la misma consulta con nueve resultados. Medianas locales: índice solo sobre geography, 29,976 ms con lectura secuencial; índice adicional de la proyección geometry, 0,194 ms con búsqueda por índice. Es una prueba de la expresión del índice, no una predicción de latencia de la API en Supabase.

La actualización npm fija Vite 8.3.8, ESLint 10.15.0, typescript-eslint 8.72.2 y Vitest/cobertura 5.1.0. El bloqueo actualiza también undici y zod afectados. `npm audit --omit=dev` no encuentra vulnerabilidades. Los avisos restantes llegan por deepmerge, glob y minimatch a través de Workbox y typescript-eslint. Revisarlos al publicarse versiones compatibles; no rebajar Workbox ni forzar un salto mayor transitivo para ocultar el informe.

## Presupuesto de instalación y operación

Medición del build normal final: 124 recursos precargados, 18.535.733 bytes sin compresión; gzip calculado por archivo, 5.029.226 bytes. Es una estimación del artefacto, no una captura de transferencia HTTP ni del espacio que ocupa la caché.

El manifiesto declara 52.391.532 bytes para el modelo principal y su filtro geográfico, y 80.644.562 para la alternativa y el suyo: 133.036.094 bytes de modelos. Junto con el shell, 151.571.827 bytes sin compresión, sin contar fotos, teselas, reintentos ni actualizaciones posteriores. No satisface el objetivo original de 25 MB de RNF-05. No se cambia de modelo por una medición del paquete: sigue vigente la decisión del dueño y se conserva la descarga reanudable.

Supabase Free incluye 1 GB de Storage, 500 MB de base, 5 GB de egreso y otros 5 GB de egreso cacheado según su [tarifa oficial](https://supabase.com/pricing), comprobada el 2026-11-14. La suma de cuotas por cuenta no es una garantía de capacidad global: revisar la ocupación real antes de abrir registros a más personas. Mantener Free, sin tarjeta ni activación de complementos. Repetir el script después de cada cambio de modelos o recursos.

Para el CSV se dejan 500.000 bytes de margen respecto del [límite de 4,5 MB de Vercel Functions](https://vercel.com/docs/functions/limitations). No se amplía `maxDuration` ni se envía audio por la función.

## Pasos del dueño para publicar

1. Publicar primero los commits de `backend/dev`: el CI de la web referencia esa revisión. Aplicar `20261114000000_map_geometry_index.sql` en SQL Editor cuando se decida publicar; no modifica columnas ni elimina el índice anterior.
2. Fusionar y comprobar la API, después publicar/fusionar la web. Los clientes anteriores siguen pudiendo leer la primera página de CSV y las páginas de caminatas con el cursor antiguo.
3. Durante las dos primeras horas tras publicar la API podrían seguir vigentes autorizaciones antiguas que permitían reemplazar objetos. Verificar Storage con una cuenta de ensayo: una segunda subida al mismo objeto debe fallar por duplicado y un reintento de sincronización debe enlazarlo sin sobrescribirlo. Las URLs firmadas no se revocan con el borrado: si se borra una cuenta mientras tiene una subida autorizada, comprobar de nuevo su carpeta tras la caducidad y eliminar posibles objetos recreados. Este límite de Storage sigue pendiente de una estrategia remota de limpieza aprobada.
4. Revisar la regla de firewall tanto en el dominio de la web como en `bird-back.vercel.app`, incluidos accesos directos. Guardar una muestra de tráfico legítimo y de prueba antes de decidir Log → bloqueo; no probar carga masiva en producción. Después de aprobar el cambio, comprobar 429 y el reintento de la cola sin duplicados.
5. Hacer la primera copia cifrada y las dos salidas de campo de [pruebas.md](pruebas.md). Revisar micrófono real, GPS, batería, Safari/iOS, cuentas reales, MFA y Sentry con un error de ensayo sin datos personales.
