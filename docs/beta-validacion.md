# Validación de la beta de campo — 15 de noviembre de 2026

Alcance aprobado: diario, línea temporal, importación local, observaciones visuales, colecciones, especies de interés, consultas de bitácora y tutor. ADR-46 registra las decisiones. La evidencia siguiente corresponde a la validación previa a publicar; el cierre de publicación figura al final.

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

Minuto simulado de escucha en el PC: 37 ventanas analizadas, una descartada por contrapresión, mediana 121 ms, p90 135 ms, máximo 214 ms; no se observaron tareas del hilo principal de más de 50 ms. No equivale a una medición en teléfono ni prueba el consumo de batería. Estas 42 E2E sí se ejecutaron localmente; CI selecciona cuenta, beta sin decodificador real y ocho regresiones offline, y deja fuera otras pruebas offline y ambas de rendimiento. No equiparar la selección remota con la suite local completa.

## Pendiente de verificación real

Teléfonos Android/iOS, Safari y sus códecs, micrófono/GPS físicos, batería, archivos largos, almacenamiento lleno, dos cuentas Supabase reales, segundo factor, sincronización entre dispositivos reales y cuotas/peticiones efectivas a Gemini. No se probó audio de usuarios ni se subieron grabaciones a servicios reales. La retirada de consentimiento no permite recuperar texto ya enviado al proveedor. Las fotos locales no tienen copia en la cuenta.

## Cierre de publicación — 15 de noviembre de 2026

API `b9f627c` y web `dc46ff8` publicadas. El dueño confirmó ambas migraciones de noviembre. CI final API [43800452229](https://github.com/Jacklb19/Bird_Back/actions/runs/43800452229): 353 pruebas; CI web [43800994885](https://github.com/Jacklb19/BirdNet/actions/runs/43800994885): verificación web y 30 E2E. Son los resultados registrados al publicar, separados de la evidencia local anterior. La API corrigió el empaquetado de dependencias en Vercel y el workflow web fija esa revisión desplegable.

La auditoría local del 15–16 de noviembre repitió 664 unitarias, 353 API/PostGIS y 42 E2E. Su minuto simulado dio 36 ventanas analizadas, dos descartadas y una tarea de 62 ms: los checks verdes no acreditan RNF-02/03. Las correcciones posteriores se comprueban por separado; estos números se conservan como evidencia histórica. A14 sigue aplazado y las pruebas reales enumeradas arriba siguen pendientes.


## Mejoras de experiencia — 16 de noviembre de 2026 (ADR-47, locales)

R1 y R2 ya estaban aprobadas y en commits locales de dev. R3 queda preparada para revisión: conversación en memoria por cuenta, plan activo editable, consultas locales o interpretación con consentimiento nuevo assistant-text-v2, tutor público accesible desde el mismo campo y comparación determinista de dos periodos. Listas con diez elementos iniciales y «Mostrar más»; el asistente pagina de cinco en cinco.

Verificación de este cierre:
- Web: lint y tipos correctos; 700 pruebas en 100 archivos y cobertura de 77,31 % de sentencias / 72,83 % de ramas / 73,40 % de funciones / 80,58 % de líneas. Tras el último ajuste de reconocimiento local, 61 pruebas del asistente correctas.
- API: Ruff, mypy (43 archivos), compileall y 364 pruebas con PostGIS local correctos. Se conserva el aviso de deprecación de Starlette/httpx.
- Builds normal y E2E correctas; se conserva el aviso de tamaño de MapLibre. Suite completa en Edge: 43/43. Después de los ajustes finales de presentación y documentación, las diez E2E beta pertinentes volvieron a pasar: 10/10.
- Nueve combinaciones visuales del asistente: 360/1280 px con es/en y claro/oscuro, y 768 px en es/claro; sin desbordes ni errores de JavaScript. Se corrigieron la compresión de los nombres en las tarjetas y un desborde de 12 px que aparecía en inglés a 360 px con resultados. Ejemplos plegables y campo inicial visible.
- Comprobados por separado en navegador: paginación 5→10→11 del asistente, listas 10→11, abrir un resultado y volver conservando el hilo, permiso antes del tutor público, una sola petición de explicación sin adjuntar el plan privado, retirada del permiso desde otra pestaña, filtros por teclado y campo accesible en una vista de 360×420. Esta última simula espacio reducido; no acredita un teclado físico de teléfono.

La interpretación y el tutor se sustituyeron en las comprobaciones de navegador; SQL, RLS, consultas, versiones y vínculos usaron la API y PostGIS locales. No se enviaron preguntas reales a Gemini ni se alteraron cuentas remotas. La revisión con cuenta ficticia es exclusivamente local y no crea la cuenta de exposición.

El minuto simulado de escucha de la suite completa registró 35 ventanas analizadas, 3 descartadas, mediana 139 ms, p90 197 ms y máximo 292 ms. Se observaron tareas largas de 147 y 295 ms en el equipo durante otras validaciones concurrentes. No se declara cumplido RNF-03 ni rendimiento/batería de teléfono por este resultado.

Continúan pendientes Gemini/cuotas reales, cuentas/correo/MFA reales, Android/iOS/Safari, micrófono/GPS, reproducción de clips de cuenta y campo/batería. El dueño aprobó R3 y sus commits el 16 de noviembre de 2026. El workflow web fija la API a `ac5f738a175ed2395ebcf426a1044ded0b7bdea4`, con el contrato de ADR-47. La publicación sigue pendiente; la API debe publicarse antes que la web. No hay migraciones, dependencias ni cambios remotos nuevos.
