# Verificación del rediseño visual

Fecha: 6 de octubre de 2026. Rama: `sprint-3/field-interface`.

## Alcance y decisiones

Rediseño de captura, diagnóstico y configuración sobre S3 cerrado. RF-01, RF-04, RF-05, RF-06 y RNF-08/09/10; ADR-08 y ADR-09 conservados. No se implementa S4, no se modifica la lógica de audio/inferencia, rutas, contratos ni servicios remotos.

La dirección visual fue instrumento de campo: tema claro principal, texto firme, controles contrastados, verde profundo y estructura mediante separadores. Se conservan los textos de privacidad, confianza y verificación. Las fuentes usan las disponibles en el dispositivo.

Se revisó la referencia Segmented Control de 21st.dev (halaska-studio, demo 34763) para jerarquía de selección y navegación. La implementación es propia con botones y radios nativos: no se copió su código ni se incorporaron sus efectos, fuentes o tokens.

## Comandos y resultados

En este entorno, npm se invoca mediante el CLI instalado, por la ruta global defectuosa ya documentada:

```powershell
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run lint
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run typecheck
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run test
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run build
```

Todos finalizaron con código 0. Salida final:

```text
Test Files  26 passed (26)
Tests       143 passed (143)
vite v8.3.1 building client environment for production...
✓ 42 modules transformed.
dist/assets/index-Ds3ZVVHR.css  20.40 kB │ gzip: 4.05 kB
dist/assets/index-BZ_PUBlx.js  261.13 kB │ gzip: 81.32 kB
✓ built in 527ms
```

Lint y typecheck no emitieron errores. Las siete pruebas adicionales verifican contraste sobre los tokens reales de CSS (texto ≥4,5:1, controles/barras/foco ≥3:1 y equivalencia del oscuro automático), cancelación durante preparación y ausencia de una afirmación falsa de caché persistente.

## Revisión en navegador

- Edge: las tres pantallas en claro/oscuro a 360 y 1280 px efectivos. Las medidas se comprobaron con `innerWidth`; el control del navegador inicialmente aplicaba un factor 1,25. No se observó desbordamiento horizontal. Botón de escucha medido en 80 × 80 px.
- Comprobación adicional de captura clara a 768 y 1440 px efectivos, sin desbordamiento horizontal.
- Estados vacío y pendiente, configuración seleccionada/no seleccionada, foco por teclado, cambios de idioma y estados del modelo.
- Audio grabado mediante la página existente `src/test/browser/listening.html`: escucha, espectrograma, RMS/pico, detención y detección local de `Turdus fuscater` con confianza numérica y barra. No se usó el micrófono real.
- Build de producción mediante `node scripts/prepare-browser-check.mjs` y preview local.
- El build también produjo una detección provisional de `Turdus fuscater` (65,6 %) en la escucha de referencia. La ventana y su alineación explican que el estado varíe respecto a otros resultados de la misma grabación. No se registraron errores nuevos de consola en esa revisión.
- Confirmada/provisional: datos deterministas de prueba (0,89 y 0,60) renderizados con el componente real en una página temporal ignorada. No representan nuevas observaciones.
- Error de modelo y carga prolongada: página temporal del build con fallo/espera del fetch del manifiesto. Se verificaron el mensaje, el estado escrito y el botón de cancelar/reintentar. La simulación no modifica la aplicación distribuida.
- Los rótulos del espectrograma se reforzaron tras detectar su reducción excesiva en móvil.

Para repetir el recorrido con audio:

```powershell
node scripts/prepare-browser-check.mjs
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 9015 --strictPort
```

Abrir `http://127.0.0.1:9015/sprint3-check.html`, seleccionar una grabación y comprobar ambos temas a 360/1280 px. Los binarios locales siguen excluidos de Git. Las capturas y páginas temporales de revisión quedan en `tmp/` o `dist/`, excluidos.

## Límites

La descarga porcentual, SHA-256, caché persistente y uso sin conexión continúan pendientes de S4. La interfaz presenta «preparando» porque el servicio no distingue descarga y carga del runtime. No se añadió un estado «procesando» inferido de tiempos.

No se verificaron luz solar real, uso caminando con una mano, micrófono físico, consumo de batería, red móvil, Safari/iOS, despliegue ni servicios remotos. El tamaño y contraste están comprobados localmente; no sustituyen esas pruebas.

Los muestreos de tareas largas durante la revisión concurrente no se consideran benchmark. RNF-03 continúa pendiente en el dispositivo de referencia. No se ejecutaron push, merge ni despliegue.
