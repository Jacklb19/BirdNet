# BirdNet Local

Aplicación web progresiva (PWA) para el monitoreo continuo de biodiversidad mediante identificación acústica de aves con inferencia híbrida y enfoque local-first.

## Propósito

BirdNet Local permite a observadores ciudadanos, investigadores y estudiantes registrar y monitorear la avifauna en campo utilizando únicamente el navegador web del dispositivo móvil o de escritorio, operando sin conexión a internet y preservando la privacidad del usuario y de las especies sensibles.

## Características Principales

- **Captura continua en cliente**: Captura de audio continuo y segmentación en ventanas de duración fija mediante `AudioWorklet` en el hilo de audio sin bloquear la interfaz.
- **Inferencia local en el navegador**: Cálculo de mel-espectrogramas y ejecución de modelo acústico exportado a ONNX (cuantizado a 8 bits) dentro de un `Web Worker` con aceleración WebGPU o WebAssembly.
- **Política de decisión híbrida**:
  - Confianza alta ($\ge 0.80$): aceptación y registro local directo.
  - Confianza intermedia ($0.45 - 0.80$): registro provisional y encolado de fragmento de audio para verificación diferida en la nube con modelo de alta fidelidad.
  - Confianza baja ($< 0.45$): descarte automático para optimizar almacenamiento.
- **Local-first y funcionamiento sin conexión**: Almacenamiento local persistente con cola de sincronización diferida e idempotente hacia la nube.
- **Privacidad y geolocalización aproximada**: Las ubicaciones se truncan automáticamente mediante trigger en base de datos a una cuadrícula de ~100 metros (PostGIS), protegiendo el domicilio del usuario y la ubicación exacta de especies vulnerables. El audio solo se transmite en casos de duda razonable con consentimiento.
- **Arquitectura de costo cero**: Diseñado para operar íntegramente dentro de los límites de los planes gratuitos de Vercel (Hobby) y Supabase (Free tier) con Row Level Security (RLS) estricto.

## Requisitos del Entorno

- **Node.js**: $\ge 24.0.0$ (definido en `.nvmrc` y `engines`)
- **Navegador**: Soporte para Web Audio API, Web Workers, WebAssembly y aislamiento de origen cruzado (`crossOriginIsolated`).

## Puesta en Marcha

1. Clonar el repositorio y verificar la versión de Node.js:
   ```bash
   node -v # debe ser >= 24
   ```

2. Instalar dependencias:
   ```bash
   npm ci
   ```

3. Configurar variables de entorno:
   ```bash
   cp .env.example .env.local
   ```

4. Iniciar el servidor de desarrollo local:
   ```bash
   npm run dev
   ```

## Verificación de Calidad

El proyecto cuenta con un flujo estricto de verificación estática, pruebas unitarias y cobertura:

- **Verificación de tipos estáticos**:
  ```bash
  npm run typecheck
  ```
- **Análisis de código estático (Lint)**:
  ```bash
  npm run lint
  ```
- **Pruebas unitarias (Vitest)**:
  ```bash
  npm test
  ```
- **Cobertura de pruebas**:
  ```bash
  npm run test:coverage
  ```
- **Compilación de producción**:
  ```bash
  npm run build
  ```