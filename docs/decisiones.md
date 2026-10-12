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

---

## ADR-22. Ubicación a ~10 m, el GPS primero, y cada persona decide si comparte (Sprint 8, modifica ADR-04 y ADR-16)

### Contexto
El dueño quiere un mapa donde cada ave quede en el punto en que se oyó al caminar. La celda de ~100 m (ADR-04) y la regla «el sitio manda sobre el GPS» (ADR-16) lo impedían. La decisión es suya (2026-10-10) y cambió también la regla de dominio de `AGENTS.md`.

### Decisión
- La rejilla pasa de 3 a 4 decimales (celda de ~10 m), en el teléfono y en la API. Sigue sin guardarse ni enviarse la coordenada cruda del dispositivo.
- Orden de `recordingLocation`: la posición del teléfono (GPS con alta precisión), luego la celda del lugar activo, si no ninguna.
- Compartir es una elección explícita: `shareMap` en los ajustes locales, sin valor hasta que la persona responde (tarjeta en Escuchar e interruptor en Ajustes). Se lee al sincronizar, de modo que cubre también lo grabado antes; `POST /v1/me/sharing` la aplica a lo ya subido. Mientras no responda, nada se comparte.
- El mapa de todos solo devuelve filas compartidas o propias (consulta y política RLS `detections_select_shared_or_own`).
- La interfaz dice con verdad qué se comparte: sin nombre y a unos 10 m. Nunca presenta como privado algo que otros pueden ver.

### Consecuencias
Una celda de 10 m puede señalar una casa: por eso compartir es opcional y está apagado por defecto. Migración `20261010000000_fine_location_and_sharing.sql`; debe aplicarse antes de desplegar la API, y la API antes que la web.

---

## ADR-23. Índice de fotos incluido en la app y miniaturas más pequeñas (Sprint 8)

### Decisión
- `public/models/species-photos.json` (1611 fotos, ~370 kB, generado con `npm run data:species-photos`) trae la URL, el autor y la licencia de la foto de las especies de la región; se guarda con la app. Una foto conocida ya no necesita dos consultas a Wikipedia antes de pedir la imagen.
- Las miniaturas se piden a 500 px (antes 960). Las casillas «Por descubrir» muestran la foto atenuada con contorno punteado en lugar de un espacio vacío.

---

## ADR-24. La app se llama Trino; un sitio que la presenta y una sola barra (Sprint 8, modifica ADR-15)

### Decisión
- Nombre elegido por el dueño: **Trino**. El modelo sigue siendo BirdNET y se acredita como tal.
- La página de inicio es un sitio con secciones propias (La guía, Cómo funciona, El mapa, Privacidad) y una barra plana con enlaces a ellas. La misma barra, con las secciones de la app, es la de la app en pantallas anchas, de modo que entrar no cambia de marco. En teléfonos la app usa la barra inferior.
- La portada demuestra en vez de anunciar: una caminata dibujada donde las aves quedan pegadas, el álbum abierto con una ficha y un barrio a medio explorar. El titular es una sola frase llana, sin el recurso de la frase partida en dos estilos. Todo ejemplo va rotulado como ejemplo.
- Navegación de la app: Escuchar, Mapa, Guía (álbum y fichas, en `#/guide`), Bitácora y Cuenta. Los lugares se abren desde el mapa.
- Se quitan de la portada y de los ajustes visibles los detalles técnicos del modelo (quedan en «Opciones técnicas»).

---

## ADR-25. Modo caminata, «Mi mapa» con sendero y territorios, y lugares que agrupan solos (Sprint 8)

### Contexto
Una página web deja de escuchar cuando el teléfono se bloquea o el navegador pasa a segundo plano; una app nativa quedó descartada. El dueño eligió la propuesta «Sendero» y pidió integrar la idea de los territorios.

### Decisión
- **Modo caminata**: una sesión de escucha que mantiene la pantalla encendida (Screen Wake Lock, retomado al volver a la pestaña), sigue la posición y dibuja el recorrido. Empezarla activa la preferencia de ubicación. Termina con la sesión, sea como sea que acabe.
- **El recorrido se guarda solo en el teléfono** (base IndexedDB propia `trino-walks-v1`, hasta 60 caminatas de 2000 celdas; aparte de la cola de sincronización para no subirle la versión, que dejaría sin acceso al Service Worker de la versión anterior durante una actualización): nunca se envía. Los cantos oídos durante la caminata son detecciones normales.
- **Mi mapa** (vista por defecto): se lee del teléfono, así que funciona sin cuenta y sin conexión. Muestra los cantos propios con su foto, los recorridos como sendero punteado y los **territorios**: hexágonos de ~60 m teñidos con el color del ave más oída en cada uno; un hexágono sin cantos no se dibuja, porque de él no se sabe nada. «De todos» es el mapa compartido de siempre.
- Para que los cantos sincronizados sigan en «Mi mapa», el historial local conserva su celda (antes se descartaba).
- **Lugares** (antes Sitios): sin lugar elegido a mano, un canto cuenta para el lugar guardado más cercano a menos de 300 m (`recordingSite`); así los lugares reúnen las caminatas sin que la persona elija nada. Elegir uno a mano sigue mandando.
- Escuchar invita a caminar y muestra las aves probables de la zona que faltan en el álbum; la Bitácora abre con un resumen (especies, cantos, nuevas de la semana, hora con más cantos) y las últimas caminatas.

### Consecuencias
La caminata gasta batería (pantalla, GPS y micrófono a la vez) y la interfaz lo dice. El comportamiento con la pantalla bloqueada y la precisión real del GPS solo se comprueban en campo.

---

## ADR-26. Guía de aves: clasificación, estado de conservación y mapa de distribución de GBIF (Sprint 8, amplía ADR-17)

### Decisión
- La ficha de especie se ordena como una guía: lámina, ficha (orden, familia, estado en la Lista Roja de la UICN), descripción de Wikipedia, «Dónde vive» y, aparte, «Tus registros».
- Los datos vienen de GBIF (gratuito, sin clave, con CORS): coincidencia exacta del nombre científico (`/v1/species/match`; las coincidencias aproximadas se rechazan y los sinónimos usan la clave aceptada), categoría UICN y teselas de densidad de registros. El mapa muestra dónde se ha observado la especie, no un límite de distribución, y lo dice.
- Las respuestas de clasificación se guardan para usarlas sin conexión; las teselas no. Si GBIF no responde, la ficha lo indica con una línea y no muestra un mapa vacío.
- Las aves probables de la zona se calculan para el lugar activo, un lugar guardado, el último canto con ubicación o, a falta de todo, el centro configurado del despliegue: el álbum ya no exige tener un lugar ni pide la posición.

---

## ADR-27. Un solo sitio: Inicio siempre visitable, la sesión en la barra y el álbum como libro (Sprint 8, corrige ADR-24)

### Contexto
Tras desplegar S8 el dueño encontró que la portada y la app parecían dos aplicaciones: la portada solo se veía la primera vez, desde la app no había cómo volver a ella, y la app mostraba un perfil anónimo sin haber iniciado sesión. También pidió el álbum del diseño (libro con anillas), una Bitácora sin filas repetidas y la ficha de especie en dos partes.

### Decisión
- **Una barra en todo el sitio y a todo ancho.** En la app: Inicio, Escuchar, Mapa, Guía y Bitácora; en Inicio, sus secciones. El logo lleva siempre a Inicio. En teléfonos la barra muestra el logo, la sesión y un botón que abre un menú superpuesto con todo el sitio agrupado (la app, Trino, tu cuenta); la barra inferior de la app se mantiene.
- **La dirección raíz abre Inicio.** Con sesión iniciada lleva directo a la app (Inicio queda a un enlace, y `#/home` nunca redirige). La app instalada arranca en `#/listen`. Ya no existe una «primera visita» que oculte la portada.
- **Sin sesión no hay perfil.** La barra y la portada ofrecen siempre «Iniciar sesión» (y «Crear cuenta»), también en una compilación sin cuentas configuradas, donde la pantalla de cuenta lo explica: una puerta que desaparece sin aviso confunde. Con sesión la barra muestra la foto o las iniciales. La pestaña Cuenta de la barra inferior solo existe con sesión. Los ajustes no dependen de la cuenta: se abren desde el menú o el icono de la barra.
- **La cuenta sigue siendo opcional**: «Descubre la app» entra sin registrarse y la portada lo dice. En la portada el mapa de ejemplo va a la izquierda y el texto a la derecha.
- **La barra se funde con el cielo**: arriba de la página no tiene fondo propio; al bajar toma un velo del color del papel con desenfoque y un borde inferior difuminado. Sobre el mapa, que queda debajo desde el principio, el velo está siempre.
- **Álbum como libro** (`AlbumBook`, compartido por la portada y la Guía): página de calcomanías, anillas y pestañas de índice (todas, tuyas, por descubrir). En pantallas anchas el libro está abierto y la página derecha muestra la ficha del ave elegida; en teléfonos es una página a la vez y la calcomanía abre la ficha. Las aves por descubrir son casillas atenuadas del mismo libro. Las calcomanías se pegan una tras otra cuando el libro entra en pantalla y la hoja gira desde el lomo al cambiar de página o de pestaña (sin movimiento si el sistema lo pide). En la portada todo va rotulado como ejemplo.
- **Bitácora agrupada**: dentro de cada día, una fila por especie (cuántos cantos, entre qué horas, mejor confianza) que se despliega para ver cada registro. Lo que falta verificar o subir se cuenta en la fila, para que plegar no esconda nada.
- **Ficha en dos pestañas**: «Sobre el ave» (clasificación, descripción, dónde vive) y «Tus registros».

### Consecuencias
El titular de la portada sigue siendo una sola frase llana y la barra es plana (lo pidió el dueño antes, aunque el boceto del álbum traía la frase partida y la barra flotante). El menú del teléfono repite los destinos de la barra inferior a propósito: es el mapa completo del sitio.

---

## ADR-28. Grabaciones guardadas: un clip por canto en el teléfono y, con permiso, en la cuenta (Sprint 9, modifica RNF-08)

### Contexto
Hasta S8 solo las detecciones dudosas conservaban su audio, y solo hasta subirse. Sin poder oír lo que se registró no hay forma de comprobar una detección (RF-11) ni de que un biólogo confíe en el registro. El dueño autorizó el 2026-10-11 cambiar la regla de dominio del audio (`AGENTS.md`): puede salir del teléfono la grabación que la persona elija guardar en su cuenta, privada y con permiso explícito.

### Decisión
- **Un clip por canto, no por ventana.** Las ventanas se solapan y un ave se repite, así que un canto produce muchas detecciones de la misma especie. Un canto es una racha de detecciones de una especie (termina tras 15 s sin oírla, o al minuto si no calla) y conserva un solo clip: el de la ventana con más confianza (`recordingPolicy.ts`).
- **Comprimido en el teléfono.** La ventana de 3 s se codifica en Opus a 32 kbit/s dentro de WebM con WebCodecs: unos 14 kB frente a 288 kB en WAV. El contenedor lo escribe `mediabunny` 1.61.3 (dependencia nueva, aprobada por el dueño; WebCodecs codifica pero no empaqueta). Donde el navegador no tiene ese codificador no se guardan clips y Ajustes lo dice.
- **En el teléfono por defecto**, porque ese audio no sale de él: base IndexedDB propia `trino-recordings-v1` (no se sube la versión de la cola, por la misma razón que las caminatas), tope de 100 MB con descarte del más antiguo, interruptor para apagarlo y borrado de uno o de todos.
- **En la cuenta solo si la persona lo elige** (`saveRecordings`, apagado hasta que diga que sí; se vuelve a leer antes de cada clip). El clip se sube con URL firmada al bucket privado `recordings`, en la carpeta de su dueño, después de que el servidor tenga su detección. La API verifica ruta y contenido antes de enlazarlo y solo firma descargas de 10 minutos para su autor; nunca aparece en el mapa.
- **Tope por cuenta de 50 MB** (unos 3.500 clips), comprobado al pedir la subida y al enlazarla. Supabase Free da 1 GB de Storage, 5 GB de egreso al mes y 50 MB por archivo (documentación oficial, verificado el 2026-10-11): el tope deja sitio para unas 18 cuentas llenas además de los modelos.
- **La interfaz dice dónde está cada grabación** (en el teléfono, o también en la cuenta) y borrar una la quita de todos los sitios donde esté; si no se puede borrar de la cuenta en ese momento, no se borra del teléfono y se avisa.
- El fragmento WAV de las detecciones dudosas (RF-07) sigue aparte: es la entrada exacta del modelo y es lo que usará la verificación en la nube.

### Consecuencias
Migración `20261011000000_recordings_and_review.sql`; se aplica antes de desplegar la API, y la API antes que la web. La política de privacidad y los textos de la portada, Escuchar y Ajustes dejan de decir que el audio nunca sale del teléfono. Un clip reemplazado dentro del mismo canto después de haberse subido deja en la cuenta también el anterior. Si se borra la cuenta, sus objetos de Storage no se borran solos (no hay flujo de borrado de cuenta todavía).

---

## ADR-29. Revisión por una persona: confirmar, corregir o descartar (Sprint 9, RF-11 y HU-06)

### Contexto
La especificación prevé que la persona confirme, corrija o descarte una detección (RF-11) y que la corrección se distinga de la detección automática (HU-06), pero no define un estado para «confirmada por una persona». Con las grabaciones (ADR-28) ya se puede oír lo que se registró antes de responder.

### Decisión
- **Tres veredictos**, desde el detalle del registro en la Bitácora, junto al reproductor: «Sí, es esta», «Es otra ave» (buscador sobre las especies del modelo, por nombre común o científico) y «No era un ave». Se puede cambiar cuando se quiera.
- **Sin estado nuevo** (aprobado por el dueño): confirmar deja la detección como `verified`; corregir, como `corrected`; descartar, como `discarded`. Una columna aparte (`revisada_por`: persona o nube) dice quién revisó, de modo que la verificación en la nube (RF-09) podrá usar el mismo estado sin confundirse con la de una persona.
- **Lo que dijo el modelo no se pierde**: al corregir, la especie nueva va en `especie` y la del modelo en `especie_modelo`. Corregir de vuelta a la especie del modelo equivale a confirmar. El detalle muestra «El modelo había dicho…» con su confianza.
- **El veredicto se guarda primero en el teléfono** (base IndexedDB propia `trino-reviews-v1`) y se aplica al leer los registros; la detección guardada no se reescribe, porque es lo que dijo el modelo y así se sincroniza. Se envía con `PATCH /v1/detections/{id}` después de la detección; la petición lleva el veredicto completo, así que repetirla no cambia nada (RNF-07). Funciona sin conexión.
- **Una detección descartada no es presencia**: deja de contar en el álbum, los totales, la ficha y «Mi mapa», y sigue visible en la Bitácora, marcada, por si la persona cambia de opinión. En el mapa de todos ya no aparecía (S5).
- **CSV y panel** (aprobado por el dueño): el CSV conserva las descartadas con su estado y añade al final `model_species` y `reviewed_by`; las estadísticas del lugar las excluyen.
- Reintentar la sincronización de una detección ya corregida no es un conflicto: la API compara el lote con la especie del modelo.

### Consecuencias
Misma migración que ADR-28 (`20261011000000_recordings_and_review.sql`). Los veredictos hechos en un teléfono no se descargan a otro: la Bitácora es local, y la ficha de especie, que sí lee la nube, muestra el estado ya revisado. El buscador ordena alfabéticamente; todavía no pone primero las aves probables de la zona.

---

## ADR-30. Se mantiene el modelo int8 y cada detección se decide con la ventana anterior (Sprint 9)

### Contexto
El dueño pidió medir antes de cambiar el modelo por defecto. La medición (`docs/evaluacion.md`, 7 horas anotadas por ornitólogos) mostró que int8, fp32 y fp16 detectan igual, y que decidir con varias ventanas cambia falsas alarmas por cantos perdidos sin subir el F1.

### Decisión (del dueño, 2026-10-11)
- **El modelo sigue siendo el int8** (`BirdNET_v2.4_int8_arm_dfttrunc.onnx`, 36,9 MB). fp32 y fp16 no mejoran la detección; fp16 solo ahorraría 11 MB de descarga.
- **Regla «promedio de 2, lo seguro se queda»** (`DECISION_RULE`): la confianza de una especie es el promedio de esta ventana y la anterior, salvo que esta ventana sola ya llegue a 0,80, en cuyo caso vale la suya. Una detección dudosa tiene que oírse dos veces. En la medición quitó el 43 % de las falsas alarmas entre lo que se guarda (de 56 a 32 por hora) a cambio de 5 puntos de exhaustividad, sin perder ninguna confirmada.
- Solo son vecinas las ventanas consecutivas de una misma sesión: tras un hueco (sesión nueva, o una ventana descartada por contrapresión) la siguiente decide sola.
- La confianza que se muestra y se guarda es la ya combinada, y el estado (provisional o confirmada) sale de ella, así que la API recibe valores coherentes.

### Consecuencias
Un ave dudosa aparece una ventana más tarde (1,5 s). Un canto que solo cupo en una ventana y no llegó a 0,80 ya no se registra. La regla y los umbrales se miden con los mismos módulos que usa la app, así que cambiar cualquiera de los dos se puede volver a medir antes de desplegarlo.
