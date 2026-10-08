# Despliegue y configuración

BirdNet Local se compone de dos proyectos (ver ADR-11 en `decisiones.md`):

| Parte | Repositorio | URL |
|---|---|---|
| Aplicación web (React + Vite) | `Jacklb19/BirdNet` | https://birdnet-nu.vercel.app |
| API (FastAPI) | `Jacklb19/Bird_Back` | https://bird-back.vercel.app |

Ambos se despliegan solos en Vercel al fusionar en `main`. El trabajo diario va en `dev`.

## Supabase (una sola vez)

1. **Esquema**: en *SQL Editor*, ejecutar en orden los archivos de `supabase/migrations/` del repositorio de la API.
2. **Autenticación**: en *Authentication → URL Configuration*, *Site URL* = `https://birdnet-nu.vercel.app`.
3. **Modelo**: bucket público `models` con `birdnet-v2.4/birdnet_model.onnx` y `birdnet-v2.4/labels.txt`.
4. **Audio dudoso** (opcional): bucket privado para los fragmentos autorizados.

## Variables de entorno en Vercel

**Aplicación web** (se incrustan en el build; volver a desplegar tras cambiarlas):

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://tugzxyleoidiimhbnwde.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clave `anon` / *publishable* (pública por diseño; todas las tablas tienen RLS) |

Variables opcionales de la web (proveedor de mapas, centro inicial, zona horaria por defecto, fuentes de fotos, tiempos de espera): ver `.env.example`. Todo origen externo que se cambie debe añadirse también a la CSP de `vercel.json` (la prueba `src/config/config.test.ts` lo comprueba para los valores por defecto).

**API** (preset *Other*, Root Directory `.`):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Cadena del *Transaction pooler* (puerto 6543) con la contraseña de la base |
| `SUPABASE_AUTH_ISSUER` | `https://tugzxyleoidiimhbnwde.supabase.co/auth/v1` |
| `MODEL_RESOURCE_BASE_URL` | `https://tugzxyleoidiimhbnwde.supabase.co/storage/v1/object/public/models/birdnet-v2.4` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_AUDIO_BUCKET` | Solo para la subida de audio dudoso |

Ajustes opcionales de la API (tiempos de espera, límites de resultados y exportación, zona horaria por defecto, `MODEL_MANIFEST_ALLOWED_HOSTS`): ver el README y `.env.example` del repositorio de la API. Si se define `MODEL_MANIFEST_URL`, su host debe coincidir con el de `SUPABASE_URL` o figurar en `MODEL_MANIFEST_ALLOWED_HOSTS`.

**Supabase Auth**: la longitud mínima de contraseña (*Authentication → Providers → Email*) debe ser 8, igual que `PASSWORD_MIN_LENGTH` del formulario.

## Comprobación rápida

- `https://bird-back.vercel.app/v1/health` y `https://birdnet-nu.vercel.app/api/v1/health` responden `{"status":"ok"}`.
- Primera visita → Empezar (descarga el modelo); Escuchar → iniciar la escucha.
- Cuenta → crear cuenta, confirmar el correo, iniciar sesión. Con «Guardar dónde escuchas» activado en Ajustes, las detecciones se sincronizan y aparecen en Mapa.
- Sitios → crear un sitio, elegirlo como activo, escuchar y abrir su panel; exportar CSV.

## Desarrollo local

- Web: `npm ci`, `npm run dev` (Vite reenvía `/api` a `API_PROXY_TARGET`, por defecto `http://127.0.0.1:8000`). En desarrollo no hay Service Worker: el modelo se carga directamente al empezar a escuchar.
- API: ver el README del repositorio de la API (`uvicorn birdnet_api.app:app --port 8000`).
- Verificación: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
