# Validación de la beta de campo — 15 de noviembre de 2026

Alcance aprobado: diario, línea temporal, importación local, observaciones visuales, colecciones, especies de interés, consultas de bitácora y tutor. ADR-46 registra las decisiones. Cambios preparados en `dev`; ninguna migración, variable ni configuración de producción se modificó.

## Entorno y alcance de la evidencia

Web React/TypeScript y API `a9753b436524a630acf8c0826c9bbc28f47ca6de`, usando todas las migraciones desde cero en un PostGIS temporal fijado por digest. Base de pruebas exclusivamente en `127.0.0.1:55434`; API en 8017 y web en 9014. Edge sin interfaz, una sola instancia de pruebas. Auth simulado con JWT que la API local firma y valida; datos ficticios del dueño de pruebas, sin cuentas reales.

- **Metadatos y vínculos reales:** crear/editar/reintentar tras perder una respuesta de la API, conservar la edición posterior y obtener versión 2; observación manual en una salida y colección; borrar salida sin perder la observación, cuyo vínculo queda nulo y versión se incrementa.
- **Privacidad local real:** IndexedDB separado, borrado de metadatos y fotos solo del dueño elegido, conservando otra cuenta. Foto PNG generada en el navegador, convertida a JPEG local; la API recibe especie/fecha/nota y ningún archivo, nombre ni confianza automática.
- **Asistente:** casilla apagada, política/versionado, envío de campos explícitos, plan visible antes de consultar, confirmación y consulta determinista real. La respuesta de interpretación se sustituye en esta E2E: no demuestra una petición real a Gemini. Las pruebas de dominio comprueban retirada, cambio de política, cancelación/respuestas tardías, seis contratos, fuentes HTTPS y cursores sin perder microsegundos. La API tiene sus propias pruebas del proveedor simulado y de la consulta con RLS.
- **Importación real sin conexión:** decodificador del navegador y Worker ONNX actuales, muestra local de referencia preparada previamente. Una ventana de 3 s reconoce `Turdus fuscater` sin inventar fecha ni persistir en modo temporal. Otra ejecución se cancela tras una ventana: conserva la salida parcial con la fecha original explícita y estado cancelado. Pruebas de dominio adicionales cubren mezcla de canales, ventanas solapadas secuenciales, formatos/códecs no decodificables, límites y liberación de recursos.
- **Interfaz:** nueve vistas (seis entradas y detalles de salida/observación/colección), a 360 y 1280 px, español/claro e inglés/oscuro, sin desbordamiento horizontal. Capturas locales ignoradas en `tmp/beta-ui/`, con prefijos `0`–`8`. Teclado, etiquetas y formularios siguen los componentes compartidos; el selector de especie mantiene sus sugerencias fuera de la etiqueta.

## Comandos

Desde `frontend/`: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, `npm run build:e2e`, `node scripts/prepare-offline-check.mjs` y `npx --no-install playwright test` con `PW_CHANNEL=msedge` y `E2E_API_PORT=8017`. Los comandos de compilación y navegador se ejecutan secuencialmente para mantener fijo el artefacto servido durante las pruebas.

La cobertura mínima del proyecto permanece en 70 % para las cuatro métricas. No se añaden dependencias. El build conserva el aviso conocido por el tamaño de MapLibre; los recursos del puente de pruebas no forman parte del precache ni se publican con la app instalada.

Resultados locales: lint y tipos sin errores; **664 pruebas en 94 archivos correctas**. Cobertura: sentencias 76,97 %, ramas 72,01 %, funciones 72,77 %, líneas 80,24 %. Builds normal y E2E correctos; shell de la build de pruebas: 137 recursos, 18.910.328 bytes, sin modelos. **42/42 E2E en Edge correctas** (3,9 min), incluidas diez beta y las regresiones de cuentas, micrófono, cola y modo sin conexión. La repetición final quedó **10/10 beta correcta** (1,1 min) tras ajustar el estado de carga y la aceptación idempotente de un borrado confirmado desde otro dispositivo; sus 14 pruebas de dominio también pasan.

Minuto simulado de escucha en el PC: 37 ventanas analizadas, una descartada por contrapresión, mediana 121 ms, p90 135 ms, máximo 214 ms; no se observaron tareas del hilo principal de más de 50 ms. No equivale a una medición en teléfono ni prueba el consumo de batería. CI omite únicamente la E2E de decodificador/ONNX real porque requiere los modelos y el audio no versionados; todas las E2E citadas aquí sí se ejecutaron localmente.

## Pendiente de verificación real

Teléfonos Android/iOS, Safari y sus códecs, micrófono/GPS físicos, batería, archivos largos, almacenamiento lleno, dos cuentas Supabase reales, segundo factor, sincronización entre dispositivos reales y cuotas/peticiones efectivas a Gemini. No se probó audio de usuarios ni se subieron grabaciones a servicios reales. La retirada de consentimiento no permite recuperar texto ya enviado al proveedor. Las fotos locales no tienen copia en la cuenta.

El dueño aplica la migración beta y publica primero la API; después puede fusionar la web. CI fija la revisión anterior, pero no se ha observado una ejecución remota ni se han hecho push, merge o despliegues. A14 de los informes permanece aplazado por decisión del dueño.
