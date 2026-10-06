# Catálogo de Pantallas — BirdNet Local

Este documento especifica las vistas principales de la aplicación web progresiva BirdNet Local, sus responsabilidades, controles y accesibilidad.

---

## 1. Captura Acústica (`/` o vista `capture`)

- **Objetivo**: Permitir al observador iniciar y detener la escucha continua de aves con un solo toque (HU-01), visualizar el mel-espectrograma en tiempo real y observar las detecciones emitidas por el modelo local.
- **Componentes clave**:
  - Banner de privacidad (RNF-08): Informa que el audio permanece en el dispositivo.
  - Botón táctil principal de escucha: Área táctil de 80×80 px (excede los 44 px mínimos de accesibilidad y 48 px de RNF-10).
  - Vúmetro de nivel sonoro en dBFS (RMS y Pico).
  - Contador de ventanas analizadas y latencia en milisegundos.
  - Visualizador Canvas del mel-espectrograma (`SpectrogramCanvas`), con paleta adaptada y alto contraste para visibilidad bajo luz solar (RNF-10).
  - Panel de descarga del modelo para uso sin conexión (ADR-07).

---

## 2. Diagnóstico de Plataforma (`/diagnostics` o vista `diagnostics`)

- **Objetivo**: Evaluar y reportar el estado de compatibilidad de las APIs web requeridas en el navegador del usuario antes de iniciar sesiones de campo.
- **Capacidades verificadas**:
  - Web Audio API / AudioContext.
  - AudioWorklet para procesamiento continuo desacoplado.
  - Web Workers para inferencia y DSP.
  - WebAssembly (WASM) para el motor ONNX Runtime Web.
  - IndexedDB para la cola local sin conexión.
  - Cache Storage / Service Worker para recursos estáticos y modelo.
  - Geolocalización para la celda geográfica aproximada de ~100 m.

---

## 3. Configuración y Preferencias (`/settings` o vista `settings`)

- **Objetivo**: Permitir al usuario personalizar el tema visual y el idioma de la aplicación, garantizando accesibilidad y confort visual tanto en campo a plena luz del día como en horarios nocturnos.
- **Controles**:
  - **Tema visual**:
    - `Sistema`: Adopta automáticamente la preferencia del sistema operativo (`prefers-color-scheme`).
    - `Claro`: Fondo blanco, texto de alto contraste, óptimo para exteriores con sol directo.
    - `Oscuro`: Fondo oscuro (`#0f172a`), preserva batería en pantallas OLED y reduce fatiga visual.
  - **Idioma de interfaz**:
    - `Español (es)`: Idioma nativo y predeterminado de la aplicación.
    - `English (en)`: Alternativa internacional.
- **Persistencia**:
  - Guardado inmediato en `localStorage` bajo clave `birdnet_settings`, con protección estricta `try/catch` para entornos con almacenamiento restringido (navegación privada, cuotas excedidas).
  - *Extensión futura (Sprint 5)*: Sincronización en segundo plano con la columna `profiles.preferences` en la base de datos Supabase cuando el usuario haya iniciado sesión.
- **Accesibilidad y diseño adaptable**:
  - Navegable íntegramente por teclado con indicadores de foco visibles (`:focus-visible`).
  - Totalmente funcional y sin desplazamiento horizontal en pantallas desde 360 px hasta 1440 px.
  - Controles con etiquetas semánticas y áreas táctiles mínimas de 44 px.

## 4. Sistema visual de campo — revisión del 6 de octubre de 2026

Esta revisión presenta las tres vistas existentes; no incorpora capacidades del Sprint 4.

- Identidad de instrumento de campo: fondo claro, tinta oscura, verde profundo, títulos firmes, iconos de línea y separadores. Tema nocturno azul oscuro según ADR-09. Sin fuentes remotas, dependencias nuevas ni animaciones decorativas.
- Fuente de verdad: `src/index.css`. Colores, tamaños de texto, espaciado, bordes, radios, duración, tamaños táctiles y capas están centralizados. Los textos nuevos pertenecen a ambos diccionarios.
- Captura: en móvil, navegación inferior y control de escucha persistente encima, con botón de 80 × 80 px, etiqueta de acción y estado acompañado por icono. Se reserva espacio al final del contenido y para el área segura del dispositivo. En escritorio, señal y detecciones aparecen en dos columnas.
- Detecciones: nombre común dominante, nombre científico, confianza numérica y barra proporcional; estado escrito e icono. Se conservan las advertencias de indicios, confirmación humana, última ventana y ausencia de certeza. Las provisionales conservan el estado sin verificación en nube.
- Espectrograma: paleta interna conservada. El Canvas sigue leyendo colores calculados y redibujándose al cambiar el tema. Los rótulos HTML superpuestos conservan su tamaño de lectura cuando se reduce el Canvas en móvil.
- Vúmetro: barra de alto contraste, marcador de pico y escala porcentual 0–100 con RMS y pico numéricos. No se cambia la medida existente a dBFS.
- Modelo: pendiente, preparación con progreso indeterminado, listo para escuchar y error. «Listo» describe la sesión en memoria; no implica caché ni uso sin conexión. El servicio no expone bytes descargados ni distingue descarga e inicialización: no se muestran porcentajes ficticios. Tampoco expone un estado de inferencia en curso; se mantienen los estados reales de escucha.
- Configuración: filas táctiles de al menos 80 px, radios nativos con presentación contrastada, agrupación por tema/idioma y persistencia existente. Navegación de al menos 56 px.
- Diagnóstico: las cuatro comprobaciones ya implementadas, como lista con icono, descripción y estado explícito. Sin añadir comprobaciones descritas para futuros sprints.

Ver evidencia, comandos y límites en `docs/verificacion-redisenio.md`.
