# Verificación del rediseño completo

Fecha: 6 de octubre de 2026. Rama: `sprint-3/field-redesign`.

## Alcance y dirección

Rediseño autónomo de las capacidades ya implementadas en S3: RF-01, RF-04/05/06 y RNF-08/09/10. Se mantienen ADR-08/09, servicios, DSP, Workers, contratos, rutas, política de confianza y esquema. No hay dependencias nuevas ni trabajo de S4.

La dirección elegida es una grabadora de campo. Se reemplazaron paleta, tipografía, emblema, navegación de tres destinos, franja independiente de estado, disposición lateral de detecciones y presentación de preferencias. La consola integra mando y señal; las detecciones forman una lista debajo. En móvil, el control conserva el botón de 80 × 80 px al pie.

Diagnóstico deja de ser una pantalla de producto: se conserva plegado en configuración de desarrollo. La condición de producción elimina su acceso de la interfaz. Se actualizaron las pruebas de navegación y se añadió una comprobación específica de esta exclusión.

## Uso de diseño y referencias

Se aplicó `frontend-design` para elegir una identidad específica del trabajo de campo, construir la UI real, evitar tarjetas genéricas y corregir la composición después de verla en navegador. La primera implementación aún mantenía señal y detecciones en columnas contiguas; la revisión la sustituyó por consola horizontal y registros debajo.

El MCP de 21st.dev se consultó antes de implementar con estas seis búsquedas:

- `field recording`
- `audio recording`
- `wildlife monitoring`
- `nature apps`
- `mobile field tools`
- `spectrogram audio analysis`

Se revisaron las imágenes de [Voice Recording](https://21st.dev/@erikvalencia1/components/voice-recording) y [Waveform](https://21st.dev/@thegridcn/components/waveform). Se tomaron como inspiración la acción de grabación dominante y la lectura compacta de señal con marco de instrumento. No se copiaron código, colores, efectos ni animaciones.

Los resultados de naturaleza y herramientas de campo fueron genéricos, sin una referencia especializada adecuada. Se descartaron los patrones de tarjetas, anillos animados y actividad del sistema. No se descargó código de pago ni se usaron créditos de generación.

## Comandos y resultados reales

El CLI global de npm sigue usando una ruta defectuosa ya documentada. Se ejecutó el CLI de la instalación de Node:

```powershell
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run lint
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run typecheck
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run test
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run build
```

Los cuatro comandos finalizaron con código 0. Lint y typecheck no emitieron errores.

```text
Test Files  26 passed (26)
Tests       144 passed (144)
Duration    7.84s

vite v8.3.1 building client environment for production...
✓ 42 modules transformed.
dist/assets/index-4HUMMvRL.css  24.90 kB │ gzip: 4.82 kB
dist/assets/index-DjjxYUFo.js  260.05 kB │ gzip: 81.13 kB
✓ built in 412ms
```

Las pruebas existentes de política, contrapresión, captura, inferencia, traducción y temas continúan pasando. Los pares de contraste usan el CSS de producción: texto ≥4,5:1, controles y lecturas ≥3:1, oscuro automático idéntico al explícito. Se incluyeron las muestras de tema, el texto provisional y el estado listo.

## Inspección visual y de funcionamiento

- Edge, captura y configuración en claro/oscuro a 360 y 1280 px efectivos. Se comprobó `innerWidth`: el control de viewport aplica un factor 1,25, por lo que se pidieron 288/1024 px al controlador.
- Sin desbordamiento horizontal en las vistas revisadas. Botón principal medido en 80 × 80 px.
- Detecciones confirmadas/provisionales y «≥ 99,9 %», con nombres largos, mediante el componente real y datos deterministas en una página temporal ignorada. No representan observaciones de campo.
- Configuración: tema seleccionado/no seleccionado, radios nativos, cambio real de tema y persistencia al recargar. Diagnóstico plegado en desarrollo y ausente de configuración compilada.
- Privacidad y métricas accesibles mediante desplegables; métricas actualizadas durante la escucha.
- Preparación del modelo: indicador indeterminado, texto completo y cancelación real.
- Fallo de modelo: estado error y mensaje de recuperación mediante fallo simulado del manifiesto en una página temporal de producción. La simulación no cambia el código distribuido.
- Audio grabado en build: `Turdus fuscater` reconocido, con una lectura observada de 89,6 %, confirmación atribuida al modelo local, espectrograma, RMS/pico y detención. Una lectura de métricas mostró 119 ms de modelo y 123 ms desde captura; no constituye benchmark móvil.
- Recorrido adicional en el build final a 360 px y tema oscuro: `Turdus fuscater` provisional con 56,5 %, señal y vúmetro activos, control fijo y detención. El estado cambia con la alineación de las ventanas de la grabación; no se interpreta como una medición nueva de precisión.
- El navegador no registró errores ni advertencias en esa escucha compilada. Las fallas provocadas en la página de error son parte de la simulación.

Las capturas del navegador fallaron intermitentemente en algunas transiciones. Se recuperó la inspección con recarga o navegación fresca. La comprobación de anchura se basó en el DOM, no en el tamaño de la imagen devuelta.

## Repetición local

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 9016 --strictPort
node scripts/prepare-browser-check.mjs
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 9017 --strictPort
```

Abrir `http://127.0.0.1:9016/` para la UI y `http://127.0.0.1:9017/sprint3-check.html` para el audio grabado. El segundo recorrido requiere build previo y los binarios locales del modelo y grabaciones, que siguen excluidos de Git.

Las páginas temporales de componentes y simulación están en `tmp/` y `dist/`, excluidas; no son pantallas del producto.

## Límites y comprobaciones manuales

No se verificaron luz solar real, manejo caminando con una mano, micrófono físico, batería, red móvil, Safari/iOS ni despliegue. El usuario debe medir legibilidad con reflejos, alcance del pulgar, captura real y consumo durante una sesión prolongada en su teléfono.

La caché persistente y el uso sin conexión siguen pendientes de S4. La prueba local no valida precisión general en campo ni RNF-03 en el dispositivo de referencia. No se hicieron push, merge ni acciones remotas.
