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
    - Todos los textos visibles por el usuario final en la interfaz gráfica (UI), centralizados en un módulo de internacionalización (`src/i18n/es.ts`).
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
2. **Tipado estricto**: Esquema TypeScript (`TranslationSchema`) que valida en tiempo de compilación y en pruebas unitarias que no falten claves ni existan valores vacíos.
3. **Formateo nativo con `Intl`**: Se centralizan en `src/i18n/formatters.ts` los formateadores para decimales (coma en español `48,3` vs punto en inglés `48.3`), porcentajes, frecuencias (`Hz`), latencias (`ms`), decibelios (`dBFS`), bytes (`MB`) y fechas, sin formateos artesanales (`toFixed`, etc.).
4. **Persistencia local**: La preferencia se almacena en `localStorage` bajo `birdnet_settings` con tolerancia a fallos por cuota o modo incógnito (`try/catch`).

### Consecuencias
- **Positivas**: Cero impacto en el tiempo de carga del bundle principal, cero dependencias adicionales, soporte estricto de tipos de TypeScript y cumplimiento de la política de cero costo en dependencias.
- **Negativas / Mitigaciones**: No soporta interpolación compleja de plurales avanzados (no requerida en la aplicación, donde los mensajes son directos y técnicos).

---

## ADR-09. Doble tema visual (claro / oscuro) con verificación de contraste AA para trabajo de campo

### Contexto
El monitoreo acústico de aves se realiza tanto a plena luz solar (donde los reflejos en pantalla exigen alto contraste y fondos claros) como al amanecer, anochecer o noche (donde fondos oscuros evitan deslumbrar al observador y reducen el consumo en pantallas OLED).

### Decisión
1. **Tokens centralizados en CSS variables**: Definición en `src/index.css` de tokens semánticos tanto en `:root` (tema claro) como en `[data-theme="dark"]` y `@media (prefers-color-scheme: dark)`.
2. **Cumplimiento estricto WCAG 2.1 AA**: Todos los pares de contraste texto/fondo superan 4,5:1 (ratio verificado automáticamente mediante pruebas automatizadas con el algoritmo de luminancia relativa estándar).
3. **Reactivación de elementos Canvas**: Los elementos dibujados sobre `<canvas>` (como `SpectrogramCanvas`) leen dinámicamente los estilos calculados (`getComputedStyle`) y se suscriben al cambio de tema en `useTheme()`, redibujando inmediatamente la interfaz sin dejar colores fijos.
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

