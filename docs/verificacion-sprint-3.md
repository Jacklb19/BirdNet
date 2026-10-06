# Verificación del Sprint 3

Fecha: 5 de octubre de 2026. Rama: `sprint-3/live-inference`.

## Entregable

Cadena AudioWorklet → Workers de espectrograma e inferencia → política de umbrales → interfaz. Los resultados muestran confianza y estado; las ventanas inferiores a 0,45 se descartan. La cola conserva una ventana activa y una pendiente, reemplazando la pendiente más antigua bajo sobrecarga.

La latencia del modelo incluye validación del audio, preparación del tensor, ejecución y extracción de candidatos. La latencia desde la captura mide desde el cierre de la ventana hasta la recepción del resultado por el controlador de la interfaz, incluyendo espera en cola y entrega de mensajes. No mide el tiempo posterior de pintado de la pantalla.

Las detecciones se mantienen únicamente como resultados de la última ventana en memoria. La persistencia, el audio de las provisionales, la autorización de envío y la sincronización corresponden a S4/S6. No se transmite audio ni se afirma que una provisional esté verificada.

## Verificación automatizada

```sh
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

Resultado local: lint y tipos sin errores; 25 archivos y 136 pruebas aprobados. Cobertura: 93,47 % de líneas, 80,72 % de ramas, 91,94 % de funciones y 92,53 % de sentencias, superando los mínimos configurados del 70 %.

Las pruebas incluyen límites exactos de 0,45 y 0,80, 1.000 escenarios de política, 1.000 llegadas bajo sobrecarga, ejecución del código real del AudioWorklet, conservación del salto de 1,5 s entre bloques de 128 muestras, errores de Worker y cierre/reinicio de sesión. El Worker de inferencia se prueba directamente; las pruebas no duplican sus algoritmos.

La compilación separa la interfaz (~262,64 kB de JS; ~80,87 kB gzip), el Worker de inferencia (~73,80 kB), el Worker de espectrograma (~3,89 kB) y el recurso WASM (~14,24 MB). El modelo ONNX sigue siendo un recurso independiente de 38.727.042 bytes. El WASM se sirve desde el mismo origen, sin depender de una CDN.

En este entorno se ejecutó npm mediante `C:/Program Files/nodejs/node.exe` y `C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js`, porque el acceso habitual a npm apuntaba a un archivo inexistente. No se modificó la instalación global.

## Prueba en navegador con audio grabado

Requiere el modelo local y las cuatro grabaciones descritas en `public/test-audio/metadata.json`. Estos binarios no están versionados. La integración de Vitest se omite si el modelo no existe; su aprobación no debe interpretarse como validación del modelo en una instalación sin esos recursos.

Para desarrollo:

```sh
npm run dev
```

Abrir `http://127.0.0.1:5173/src/test/browser/listening.html`.

Para verificar los Workers compilados:

```sh
npm run build
node scripts/prepare-browser-check.mjs
npm run preview -- --host 127.0.0.1 --port 9013 --strictPort
```

Abrir `http://127.0.0.1:9013/sprint3-check.html`. El preparador genera la página solamente en `dist/`; no forma parte del build normal ni se versiona.

1. Seleccionar una grabación y pulsar «Iniciar escucha».
2. Comprobar la preparación del modelo, el vúmetro, el espectrograma y una detección de la especie de referencia. La primera ventana necesita 3 s de captura.
3. Revisar confianza, estado, ambas latencias y ventanas descartadas.
4. Detener la escucha; comprobar niveles en cero y reiniciar con otra especie.
5. Repetir a 360 px y 1280 px, en ambos temas y con teclado. Comprobar ausencia de desbordamiento horizontal.

La página sustituye exclusivamente su micrófono por una grabación local y procesa ventanas continuas a través de los servicios reales. No solicita permisos de micrófono ni reproduce el audio por los altavoces. Las confianzas pueden cambiar al variar la alineación de las ventanas; no equivalen a una evaluación general de precisión biológica.

La verificación local reconoció las cuatro especies de referencia y permitió detener y reiniciar la captura. En sesiones estables del build se observaron latencias desde la captura de 145–160 ms, cero ventanas descartadas y cero tareas largas. Se verificaron 360 px y 1280 px sin desbordamiento horizontal. Son observaciones de escritorio, no garantías para otros equipos.

El indicador de tareas largas se reinicia al preparar cada grabación. Debe medirse con la sesión estable y sin ejecutar compilaciones ni otras pruebas simultáneamente. En una ejecución inicial se observaron picos durante la verificación concurrente; por ello RNF-03 requiere seguimiento y no se declara cumplido universalmente.

## Comprobaciones pendientes en dispositivo real

- HU-01: medir inicio con modelo disponible y permiso concedido; la primera descarga queda fuera de esa comprobación.
- HU-02 / RNF-01: medir detección desde el final de la ventana y latencia en el teléfono de referencia. La evidencia de escritorio no valida un dispositivo de gama media.
- RNF-02 / RNF-04: sesiones de una hora, continuidad de captura y consumo de batería, con al menos dos pruebas de campo.
- RNF-03 / RNF-10 / RNF-11: tareas largas, contraste bajo luz solar, manejo con una mano y compatibilidad real en los navegadores previstos.
- Despliegue: disponibilidad pública del modelo y WASM, cabeceras COOP/COEP/CSP y `crossOriginIsolated`. No se desplegó ni se ejecutó CI remoto.

La caché persistente, la descarga con progreso y comprobación SHA-256, la instalación PWA y la cola local siguen pendientes para S4. No se garantiza funcionamiento sin conexión en S3.
