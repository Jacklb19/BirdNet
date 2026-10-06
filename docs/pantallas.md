# Pantallas de BirdNet Local

## Alcance implementado

La interfaz cubre la captura e inferencia de S3 y las preferencias locales. No incorpora cola persistente, caché del modelo, verificación en nube, mapa ni funciones de S4–S6. `App` mantiene sus vistas internas `capture` y `settings`; este trabajo no añade ni modifica rutas de URL.

## Captura acústica

Es la vista inicial. Su composición representa una grabadora de campo, con un único instrumento integrado:

- En escritorio, el mando de escucha y su estado ocupan una columna de la consola. La señal ocupa el resto: espectrograma, escala temporal, vúmetro segmentado y pico. El estado del modelo forma el pie común del instrumento.
- En móvil, el estado encabeza la señal. El control de escucha permanece fijo al pie de la pantalla, con etiqueta de acción y botón de 80 × 80 px. El contenido reserva espacio para el control y el área segura del dispositivo.
- El botón conserva exactamente los estados y acciones existentes: iniciar, detener y cancelar la preparación. La solicitud de permiso mantiene su deshabilitación original.
- El espectrograma vacío presenta una retícula estática de referencia; no simula audio. El componente `SpectrogramCanvas`, su mapa de color y su lógica permanecen intactos: colores calculados, suscripción al tema y redibujado.
- El vúmetro conserva valores RMS y pico porcentuales, con escala 0–100 %. La retícula segmentada es presentacional; no convierte los datos a dBFS.
- El modelo comunica pendiente, preparación indeterminada, listo en memoria y error. No inventa porcentaje de descarga, caché persistente ni estado separado de inferencia.
- Privacidad y métricas conservan su contenido completo dentro de desplegables nativos. El resumen y el control principal recuerdan que el audio permanece en el dispositivo.

## Detecciones

Las detecciones aparecen debajo de la consola, como registros separados por líneas. En escritorio, cada fila alinea especie, verificación y confianza; en móvil, el nombre y el estado comparten una columna y la confianza permanece en el margen derecho.

Cada registro conserva nombre común, nombre científico, confianza numérica, barra proporcional y estado explícito. La confirmación se atribuye al modelo local; las provisionales indican que no están verificadas en la nube. Se conserva la advertencia de confirmación humana.

Las probabilidades cercanas a uno se presentan como «≥ 99,9 %», nunca como certeza del 100 %. El estado vacío indica expresamente que no encontrar detecciones en la última ventana no implica ausencia de aves. Se conserva el aviso de resultados temporales, todavía sin guardar ni enviar a la nube. El contador de la cabecera representa únicamente las detecciones visibles de esa ventana.

## Configuración

Tema e idioma se presentan como grupos de radios nativos con filas táctiles de al menos 80 px. Las muestras de tema muestran superficies claras, nocturnas y automáticas; no añaden modos nuevos. Los controles conservan navegación por teclado, foco visible, traducción inmediata y persistencia existente en `birdnet_settings`.

## Diagnóstico

Se retiró de la navegación principal porque sus cuatro comprobaciones actuales son técnicas: aislamiento de origen, Web Workers, WebAssembly y SharedArrayBuffer. No interviene en el flujo de identificación.

El componente y sus pruebas se conservan. Solo en desarrollo (`import.meta.env.DEV`) aparece plegado dentro de configuración, bajo «Herramientas de desarrollo». Conserva reevaluación y contador. En producción no aparece el desplegable ni se ofrece el diagnóstico. No se añadieron comprobaciones nuevas.

## Identidad visual

La dirección es una grabadora portátil de campo: marfil y naranja quemado de día; carbón verdoso y ámbar de noche. Un emblema geométrico de ave en vuelo reemplaza la marca anterior. La consola usa contornos firmes, alineaciones de instrumento y separadores; las detecciones y preferencias evitan tarjetas independientes.

Los tokens están centralizados en `src/index.css`. Tipografía disponible localmente: Bahnschrift/DIN para títulos, Trebuchet para lectura y Consolas para escalas. No hay fuentes remotas, bibliotecas nuevas ni animaciones ornamentales.

Se mantienen ADR-08/09, los textos en `src/i18n/es.ts` y `src/i18n/en.ts`, temas automático/claro/oscuro y los contratos de audio e inferencia. La verificación y sus límites están en `docs/verificacion-redisenio.md`.
