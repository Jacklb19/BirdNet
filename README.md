# BirdNet Local

Aplicación web progresiva para el monitoreo continuo de aves por sonido. Identifica especies con un modelo acústico que corre en el navegador, funciona sin conexión y registra las detecciones con ubicación aproximada en un mapa colectivo.

- **Aplicación web**: https://birdnet-nu.vercel.app (este repositorio)
- **API**: https://bird-back.vercel.app ([Jacklb19/Bird_Back](https://github.com/Jacklb19/Bird_Back))

## Funciones

- Escucha continua con el micrófono, segmentada en ventanas de 3 s en un AudioWorklet, con espectrograma en vivo.
- Identificación en el dispositivo con BirdNET v2.4 (ONNX cuantizado, 6.522 especies) dentro de un Web Worker. El audio no sale del dispositivo.
- Política de confianza: ≥ 0,80 confirmada por el modelo local; 0,45–0,80 provisional; < 0,45 descartada. Toda detección muestra su confianza y estado.
- Funcionamiento sin conexión: modelo en caché con verificación SHA-256 y cola local de detecciones que se sincroniza sola, sin duplicados.
- Cuenta con Supabase Auth y mapa colectivo (MapLibre + OpenFreeMap) con agrupamiento y filtros por especie y periodo.
- Ubicación siempre aproximada (celdas de unos 100 m).

## Tecnología

React 19, TypeScript, Vite, ONNX Runtime Web, Workbox, MapLibre GL y Supabase. Despliegue en Vercel (plan Hobby) y Supabase (plan Free).

## Desarrollo

Requiere Node.js 24 o superior.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

El servidor de desarrollo reenvía `/api` a la API local en `http://127.0.0.1:8000` (ver el repositorio de la API).

| Comando | Uso |
|---|---|
| `npm run lint` / `npm run typecheck` | Análisis estático y tipos |
| `npm run test` | Pruebas unitarias (Vitest) |
| `npm run build` | Build de producción y precaché sin conexión |
| `npm run test:offline` | E2E sin conexión (Playwright; requiere `../backend`) |

## Documentación

- `docs/definicion-proyecto.md`: especificación (requisitos, arquitectura y plan de sprints).
- `docs/decisiones.md`: decisiones de arquitectura adicionales.
- `docs/despliegue.md`: configuración de Supabase y Vercel.
