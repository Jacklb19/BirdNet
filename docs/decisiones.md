# Registro de Decisiones de Arquitectura y Convenciones — BirdNet Local

Este documento registra los Registros de Decisión de Arquitectura (ADR) adicionales y decisiones transversales que complementan a `docs/definicion-proyecto.md`.

---

## Convención Transversal: Idioma del Código Fuente y Mensajes de Control

- **Estado**: Aprobado (Sprint 2).
- **Decisión**:
  - Todo el código fuente del repositorio se escribe exclusivamente en **inglés**:
    - Nombres de clases, componentes, funciones, métodos, variables, tipos, interfaces, constantes y enums.
    - Nombres de archivos y directorios.
    - Rutas de URL de la aplicación.
    - Variables y clases CSS.
    - Nombres de suites y casos de prueba (`describe`, `it`, `test`).
    - Comentarios en el código y documentación de interfaces (JSDoc/TSDoc).
    - Mensajes de commit (formato Conventional Commits en imperativo en inglés).
  - Se mantienen en **español**:
    - Todos los textos visibles por el usuario final en la interfaz gráfica (UI). Cada funcionalidad los declara en su propio módulo `src/features/<funcionalidad>/i18n.ts` (español e inglés) y `src/i18n/messages.ts` los compone (ver ADR-08).
    - Toda la documentación dentro del directorio `docs/`.

---

## ADR-07. Tamaño de descarga del modelo acústico desacoplado de la aplicación (Modificación de RNF-05)

### Contexto
El requisito no funcional inicial RNF-05 establecía que la aplicación y el modelo cuantizado no debían superar los 25 MB combinados en la primera carga. Durante la validación empírica del Sprint 2 con el modelo BirdNET v2.4, se constató que la cuantización dinámica estándar INT8 a 13,2 MB reducía la precisión del clasificador (75 % acierto top-1, fallo crítico en especies locales como *Turdus fuscater*), mientras que la variante optimizada para ARM/WASM de 36,93 MB mantiene el 100 % de acierto top-1 en grabaciones de prueba colombianas con latencias muy reducidas (24-75 ms en CPU, cumpliendo holgadamente RNF-01).

### Decisión
Se modifica el criterio de RNF-05: **se acepta un modelo de más de 25 MB siempre que sea el más preciso y cumpla con los límites de latencia estipulados**.

La arquitectura desacopla el ciclo de vida del paquete web y del modelo:
1. **Aplicación web ultraligera**: El paquete inicial de la SPA (HTML, CSS y JS compilado) se mantiene en el orden de ~250 KB (menos de 80 KB transferidos con compresión gzip/brotli), garantizando una carga casi instantánea de la interfaz.
2. **Descarga explícita y bajo demanda (ADR-05)**: El modelo acústico binario (`.onnx`) no se incluye en el bundle inicial ni se descarga automáticamente en la visita inicial. La descarga es disparada de forma explícita por el usuario mediante un botón ("Descargar modelo para usar sin conexión"), informando de antemano el tamaño exacto del archivo, con barra de progreso interactiva (bytes transferidos y porcentaje) y sugerencia de utilizar una conexión Wi-Fi.
3. **Persistencia y verificación de integridad**:
   - El archivo ONNX descargado se almacena en la API `Cache Storage` del navegador.
   - Se solicita persistencia de almacenamiento con `navigator.storage.persist()` para evitar que el navegador purgue el modelo bajo presión de memoria.
   - Se valida el hash SHA-256 del binario contra el manifiesto (`manifest.json`) antes de darlo por válido.
   - Se implementa detección y aviso al usuario si el modelo desaparece de la caché local para permitir su reinstalación.

### Alternativas consideradas
1. *Forzar modelo inferior a 25 MB a costa de precisión*: Rechazado. Provocaba falsos positivos y clasificaba erróneamente especies autóctonas, desvirtuando el propósito de monitoreo biológico fiable.
2. *Empaquetar el modelo dentro del bundle de la aplicación*: Rechazado. Haría la carga inicial de la web inaceptablemente lenta en redes móviles y violaría ADR-05.

### Consecuencias
- **Positivas**: Máxima precisión biológica en campo, carga inicial web instantánea, descarga única y controlada por el usuario, funcionamiento sin conexión garantizado.
- **Negativas / Mitigaciones**: Requiere implementar la UI de gestión de descarga, progreso y caché local en el cliente.

---

## ADR-08. Sistema ligero de internacionalización propio (~0,5 KB) frente a frameworks externos

### Contexto
La aplicación requiere soporte multi-idioma (español nativo e inglés internacional) y formateo localizado estricto para números, fechas y unidades físicas (RNF-10). La librería estándar del ecosistema React es `i18next` con `react-i18next`, la cual añade aproximadamente ~40 KB minificados al bundle de producción y múltiples dependencias transitivas.

### Decisión
Se implementa un proveedor propio y ultraligero de internacionalización en `src/i18n/` basado en Context API nativa de React y la API estándar `Intl` de ECMAScript:
1. **Peso despreciable**: Menos de 0,5 KB de código de lógica (`src/i18n/index.tsx`), sin dependencias externas adicionales en `package.json`.
2. **Tipado estricto y modular** (actualizado en el Sprint 6): cada funcionalidad declara sus textos con `defineMessages({ es, en })`; el español define la forma y el inglés debe tener exactamente las mismas claves, así que una traducción faltante es un error de compilación. Los textos con datos son funciones de valores ya formateados, de modo que el orden de las palabras queda en la traducción. Una prueba comprueba que ningún texto quede vacío.
3. **Formateo nativo con `Intl`**: Se centralizan en `src/i18n/formatters.ts` los formateadores para decimales (coma en español `48,3` vs punto en inglés `48.3`), porcentajes, frecuencias (`Hz`), latencias (`ms`), decibelios (`dBFS`), bytes (`MB`) y fechas, sin formateos artesanales (`toFixed`, etc.).
4. **Persistencia local**: La preferencia se guarda en `localStorage` mediante `src/config/storage.ts` (clave `STORAGE_KEYS.preferences`), con tolerancia a fallos por cuota o modo incógnito. Los idiomas disponibles y su región de formato viven en `src/i18n/locales.ts`.

### Consecuencias
- **Positivas**: Cero impacto en el tiempo de carga del bundle principal, cero dependencias adicionales, soporte estricto de tipos de TypeScript y cumplimiento de la política de cero costo en dependencias.
- **Negativas / Mitigaciones**: No soporta interpolación compleja de plurales avanzados (no requerida en la aplicación, donde los mensajes son directos y técnicos).

---

## ADR-09. Doble tema visual (claro / oscuro) con verificación de contraste AA para trabajo de campo

### Contexto
El monitoreo acústico de aves se realiza tanto a plena luz solar (donde los reflejos en pantalla exigen alto contraste y fondos claros) como al amanecer, anochecer o noche (donde fondos oscuros evitan deslumbrar al observador y reducen el consumo en pantallas OLED).

### Decisión
1. **Tokens centralizados en CSS variables** (actualizado en el Sprint 6): `src/styles/tokens.css` define los tokens del diseño aprobado en Figma, el tema claro en `:root` y un único bloque oscuro en `:root[data-theme='dark']`. El tema resuelto (incluido «Automático») se escribe siempre en `data-theme` antes del primer render, por lo que no hace falta repetir la paleta en una media query.
2. **Cumplimiento estricto WCAG 2.1 AA**: Todos los pares de contraste texto/fondo superan 4,5:1 (ratio verificado automáticamente mediante pruebas automatizadas con el algoritmo de luminancia relativa estándar).
3. **Reactivación de elementos Canvas**: Los elementos dibujados sobre `<canvas>` (espectrograma) y el mapa leen dinámicamente los estilos calculados (`getComputedStyle`) y se suscriben al cambio de tema en `useTheme()`, redibujando inmediatamente la interfaz sin dejar colores fijos.
4. **Selector accesible en `/settings`**: Opciones `Sistema`, `Claro` y `Oscuro` con áreas táctiles mínimas de 44 px, accesibles por teclado y persistidas en `localStorage`.

---

## ADR-10. El modelo recibe audio crudo; el mel-espectrograma propio es solo visual

### Contexto
La especificación preveía calcular el mel-espectrograma en TypeScript y pasarlo como tensor al clasificador. BirdNET v2.4 recibe directamente audio normalizado `[1, 144000]` a 48 kHz y calcula sus propias características dentro del grafo ONNX.

### Decisión
El Worker de inferencia entrega el audio crudo al modelo. El mel-espectrograma de 64 bandas calculado en otro Worker se usa únicamente para la visualización en vivo.

### Consecuencias
RF-04 se cumple fuera del hilo principal (el grafo corre en un Worker) y se evitan diferencias numéricas con el preprocesamiento con el que se entrenó el modelo.

---

## ADR-11. Aplicación web y API en repositorios y despliegues separados

### Contexto
Se requieren dos direcciones públicas independientes: una para la aplicación web y otra para la API.

### Decisión
- **Aplicación web**: repositorio `Jacklb19/BirdNet`, proyecto de Vercel `birdnet-nu.vercel.app`.
- **API (FastAPI)**: repositorio `Jacklb19/Bird_Back`, proyecto de Vercel `bird-back.vercel.app` (preset *Other*), con las migraciones de Supabase.
- La aplicación web reenvía `/api/*` a la API mediante una reescritura de `vercel.json`. El navegador sigue llamando al mismo origen, de modo que no se necesitan CORS ni cambios en la CSP, el Service Worker o el cliente.
- Ramas: `main` (producción) y `dev` (trabajo) en ambos repositorios.

### Consecuencias
Cada parte se despliega y versiona por separado. Las variables del servidor (`DATABASE_URL`, `SUPABASE_AUTH_ISSUER`, `MODEL_RESOURCE_BASE_URL`) viven solo en el proyecto de la API. El manifiesto del modelo existe en ambos repositorios y debe actualizarse a la vez. La prueba E2E sin conexión necesita el repositorio de la API clonado al lado (`../backend`).

---

## ADR-12. Configuración centralizada: ningún valor cambiable queda escrito en el código

### Contexto
Al empezar el Sprint 6 había URL, límites, tiempos de espera, umbrales, listas de opciones, claves de almacenamiento y nombres de protocolo repetidos en muchos módulos de ambos repositorios, y algunos ya se habían desincronizado.

### Decisión
- **Web**: `src/config/env.ts` es el único módulo que lee `import.meta.env`; valida cada variable y documenta su valor por defecto (`.env.example`). `src/config/api.ts` tiene las rutas de la API y un cliente común con tiempo de espera; `src/config/contract.ts` refleja las reglas de dominio de la API (umbrales, celda de ubicación, límites, periodos, estados); `src/config/storage.ts`, las claves del navegador; `build.config.mjs`, las constantes del build. Los estilos usan solo tokens y los textos solo i18n.
- **API**: `birdnet_api/settings.py` (variables de entorno leídas una vez y validadas), `birdnet_api/domain.py` (reglas de dominio y formato WAV derivado) y `birdnet_api/errors.py` (cada error con su código HTTP y mensaje).
- Pruebas que mantienen sincronizado lo que no puede compartir código: la CSP de `vercel.json` debe permitir los orígenes externos de la configuración, las cabeceras de Vite y Vercel deben coincidir, y los colores y textos estáticos de `index.html` y del manifiesto deben coincidir con los tokens y el idioma por defecto.

### Consecuencias
Cambiar un proveedor de mapas, un límite o un umbral es un cambio en un solo lugar. `vercel.json` sigue fijando el destino de `/api/*` porque Vercel no lee variables en ese archivo.

---

## ADR-13. Nombres comunes y fotos de especies

### Decisión
- **Nombres comunes**: instantánea versionada de la taxonomía de eBird (español internacional) en `public/models/species-names.json`, regenerable con `npm run data:species-names`. Se precachea para que funcione sin conexión. Si una especie no tiene nombre en español se usa el inglés y, en último caso, el nombre científico: nunca se inventan traducciones.
- **Fotos**: imagen principal del artículo de Wikipedia de la especie, servida desde Wikimedia Commons con autor y licencia visibles. El Service Worker guarda las fotos vistas para usarlas sin conexión. Sin foto se muestra un marcador neutro.

---

## ADR-14. Rediseño de la interfaz (Sprint 6)

### Decisión
Dirección «clara y tranquila» aprobada en Figma: fondo neutro, verde de marca, amarillo solo para «canta ahora» y rojo solo al grabar; una sola familia tipográfica (Radio Canada, autoalojada para funcionar sin conexión) con cursiva solo en nombres científicos. En teléfonos, barra inferior de pestañas y un mini reproductor sobre ella mientras se escucha fuera de la pantalla Escuchar; en pantallas anchas, barra superior flotante que integra el mini reproductor. La escucha vive por encima del enrutador, de modo que sigue activa al navegar.

### Consecuencias
Los sitios de monitoreo se crean solo con conexión y cuenta; la lista se guarda en el teléfono para poder elegir el sitio activo sin señal.


---

## ADR-15. Página de inicio en lugar de la Bienvenida (Sprint 7)

### Decisión
La primera visita (y `#/home`) muestra una página de inicio tipo web: qué es BirdNet Local, cómo funciona (escucha, reconoce, registra), qué se puede hacer (álbum, fichas, mapa, sitios), la privacidad y los créditos, con dos entradas: «Empezar a escuchar» e «Iniciar sesión o crear cuenta». Sustituye a la pantalla de Bienvenida de S6; los enlaces antiguos `#/welcome` llevan a ella. La política de privacidad completa es una página estática (`public/privacy.html`), legible sin JavaScript y enlazable desde la pantalla de consentimiento de Google; el Service Worker no la reemplaza por la aplicación.

### Consecuencias
Amplía la especificación (no hay un RF para ella); apoya RF-17 y RNF-08 al explicar desde el inicio qué datos salen del teléfono.

---

## ADR-16. La ubicación de un canto sale del sitio activo; los cantos sin ubicación se asignan después (Sprint 7)

### Contexto
En la prueba real de S6 los cantos quedaban «sin ubicación» aunque hubiera un sitio activo: la ubicación solo salía del GPS con «Guardar dónde escuchas» activado, y sin ubicación nunca se sincronizan (RF-10, RF-08).

### Decisión
- Cada canto se archiva en la celda del sitio activo (su centro ya está redondeado a ~100 m, ADR-04). Sin sitio activo se usa la celda del GPS si está permitido; sin ninguno, el canto queda sin ubicación. El sitio manda sobre el GPS para que todo lo que se oye en un sitio cuente en sus estadísticas.
- Escuchar avisa antes de empezar cuando no habrá ubicación.
- La Bitácora ofrece asignar a un sitio los cantos sin ubicación del teléfono (solo los de la cuenta o los aún sin dueño, nunca los que tienen GPS) y los sincroniza enseguida.

### Consecuencias
La regla vive en `recordingLocation` y `unlocatedAssignment` (`queuePolicy.ts`), con pruebas de regresión. Si se escucha lejos del sitio activo, el canto queda en la zona del sitio: es la elección de quien escucha.

---

## ADR-17. Ficha de especie con Wikipedia, álbum y guía regional opcional (Sprint 7)

### Decisión
- **Ficha de especie** (`#/species/<nombre científico>`, primera fase de RF-14 sin modelo de lenguaje): foto, resumen de Wikipedia (API REST, en el idioma de la interfaz o en inglés si no existe) con su fuente y licencia CC BY-SA, y lo que la persona registró: cuándo (reloj de 24 horas), dónde (sitios) y sus registros con confianza y estado (RNF-09). Con cuenta y conexión usa el registro de la nube (`GET /v1/me/species/{especie}`); si no, el del teléfono. Se abre desde Escuchar, la Bitácora, el álbum, el mapa y los sitios.
- **Álbum** (`#/log/album`): una calcomanía por especie registrada (teléfono y nube unidos) y, como espacios por llenar, las especies probables de la zona según el modelo geográfico (ADR-18).
- **Guía regional**: lo que se ve se guarda solo (el Service Worker conserva fotos y resúmenes); un único botón opcional guarda la foto y el resumen de las especies más probables de la zona para usarlas sin conexión, con su tamaño a la vista.
- Las fichas que redacta el modelo de lenguaje (RF-14 completo) quedan para un sprint posterior; el texto de Wikipedia nunca se presenta como generado.

---

## ADR-18. Modelo geográfico de BirdNET como filtro de especies (Sprint 7)

### Contexto
La especificación prevé restringir el catálogo a la región (sección del modelo acústico local); el catálogo fijo `species_bogota.json` nunca llegó a aplicarse.

### Decisión
- Se usa el modelo geográfico de BirdNET v2.4 (meta-modelo de Zenodo 10.5281/zenodo.15050749, CC BY-NC-SA 4.0) convertido a ONNX por `scripts/prepare-geo-model.py`. Sus 6522 salidas están alineadas una a una con las etiquetas del modelo acústico, por eso se prefiere al geo-modelo 3.0 (unas 14 000 etiquetas de otra taxonomía). La matriz del clasificador se guarda en float16 (15,4 MB) y el resto en float32; la validación exige diferencias ≤ 1e-3 y los mismos conjuntos de especies que el original en nueve lugares de prueba.
- En el Worker de inferencia, para la celda del canto (ADR-16) y la semana BirdNET de su fecha (48 semanas, cuatro por mes), las especies con probabilidad menor que 0,03 (umbral por defecto de BirdNET-Analyzer, comparado en float32) se descartan antes de clasificar la ventana. Sin ubicación no se filtra nada y Escuchar lo indica.
- Se distribuye con el modelo acústico en la misma descarga verificada (ADR-19); un manifiesto sin modelo geográfico sigue siendo válido.

### Consecuencias
Menos confusiones con especies que no viven en la zona (mejora la precisión efectiva sin entrenar nada). Reemplaza a `species_bogota.json`.

---

## ADR-19. Una sola descarga obligatoria, automática; todo lo demás opcional (Sprint 7, modifica ADR-07)

### Decisión
- La única descarga obligatoria es el modelo (acústico y geográfico juntos), una vez: empieza sola al pulsar «Empezar a escuchar» en la página de inicio, que informa su tamaño, y se verifica con SHA-256 como en ADR-07. Ya no hay que pulsar un botón de descarga.
- Si se publica otra versión, se descarga en segundo plano y la instalada sigue funcionando mientras tanto.
- Fotos y fichas se guardan solas al verlas; la guía regional (ADR-17) es el único botón opcional.

---

## ADR-20. Dirección visual «Plumaje» con el cielo de la hora (Sprint 7, reemplaza a ADR-14)

### Decisión
Elegida por el dueño entre dos propuestas (`diseno-s7/` en la carpeta de trabajo):
- Cada ave pinta su lámina con el color de su plumaje. El color se elige de una paleta de diez láminas cuyo par texto/fondo cumple AA (probado); se deduce del tono dominante en el centro de la foto, con una tabla curada para las aves más comunes de Bogotá.
- Las fotos son calcomanías troqueladas (borde blanco, contorno irregular, inclinación propia de cada especie), y la Bitácora tiene un álbum.
- Anotaciones de cuaderno de campo en DM Mono; nombres y títulos en Fraunces (suave), texto en Radio Canada; todo autoalojado.
- De la otra propuesta se toma el cielo: el fondo de la parte superior sigue la hora local (alba, día, atardecer, noche) en ambos temas.
- Animaciones con sentido: la calcomanía cae con un pequeño rebote, la lámina se inunda del color del ave que canta, las muestras de la sesión entran en fila; «reducir movimiento» las desactiva.

---

## ADR-21. Cuenta completa: confirmar y recuperar contraseña, Google y perfil (Sprint 7)

### Decisión
- Al crear la cuenta la contraseña se escribe dos veces; «¿Olvidaste tu contraseña?» envía el enlace de Supabase y, al abrirlo, la app pide la nueva.
- Inicio de sesión con Google mediante Supabase Auth (sin costo). Solo se piden `openid`, `email` y `profile`.
- Se desactiva «Confirm email» en Supabase. Para que los correos de recuperación lleguen a cualquiera se configura un SMTP propio (el integrado solo entrega al equipo del proyecto).
- Perfil con nombre para mostrar y foto. La foto se reduce en el teléfono a 256 px WebP y se sube por URL firmada a un bucket privado; se lee con URL firmada. No se usa la foto de Google, para no abrir otro origen en la CSP.
- Totales propios en Cuenta (`GET /v1/me/summary`) y lista de especies para el álbum (`GET /v1/me/species`).
- En el mapa colectivo, el nombre del sitio solo aparece en las detecciones propias (`own`, `site_name`).
- La verificación en dos pasos queda pendiente.
