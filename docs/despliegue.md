# Despliegue y configuración

Trino (antes BirdNet Local) se compone de dos proyectos (ver ADR-11 en `decisiones.md`):

| Parte | Repositorio | URL |
|---|---|---|
| Aplicación web (React + Vite) | `Jacklb19/BirdNet` | https://birdnet-nu.vercel.app |
| API (FastAPI) | `Jacklb19/Bird_Back` | https://bird-back.vercel.app |

Ambos se despliegan solos en Vercel al fusionar en `main`. El trabajo diario va en `dev`.

## Supabase (una sola vez)

1. **Esquema**: en *SQL Editor*, ejecutar en orden los archivos de `supabase/migrations/` del repositorio de la API. La migración `20261008000000_profiles_and_avatars.sql` (S7) crea también el bucket privado `avatars` (fotos de perfil, solo WebP de hasta 200 kB). La migración `20261010000000_fine_location_and_sharing.sql` (S8, ADR-22) añade la celda de ~10 m y la columna de compartir: se aplica **antes** de fusionar la API, y la API se despliega **antes** que la web.
2. **Autenticación**: en *Authentication → URL Configuration*, *Site URL* = `https://birdnet-nu.vercel.app` y en *Redirect URLs* `https://birdnet-nu.vercel.app/**` y `http://localhost:5180/**` (regreso de Google y del enlace para recuperar la contraseña).
3. **Modelo**: bucket público `models` con `birdnet-v2.4/birdnet_model.onnx`, `birdnet-v2.4/labels.txt` y, desde S7, `birdnet-v2.4/birdnet_geo_model.onnx` (modelo geográfico, ADR-18; se genera con `python scripts/prepare-geo-model.py`). El hash y el tamaño de cada archivo están en `public/models/manifest.json` y en el manifiesto de la API.
4. **Audio dudoso** (opcional): bucket privado para los fragmentos autorizados.
5. **Correo** (S7, ADR-21): en *Authentication → Sign In / Providers → Email* desactivar *Confirm email*. El correo integrado de Supabase solo entrega a los miembros del equipo del proyecto; para recuperar contraseñas de cualquier persona hace falta un SMTP propio (*Authentication → Emails → SMTP Settings*; por ejemplo Gmail con contraseña de aplicación: `smtp.gmail.com`, puerto 587) y subir el límite en *Authentication → Rate Limits*.
6. **Google** (S7, ADR-21): en Google Cloud, *Google Auth Platform* → cliente OAuth de tipo *Aplicación web* con origen `https://birdnet-nu.vercel.app` y URI de redirección `https://<proyecto>.supabase.co/auth/v1/callback` (la *Callback URL* que muestra Supabase en *Sign In / Providers → Google*). El ID y el secreto se pegan en ese mismo panel de Supabase. Desde S8 el mismo ID (público) va también en `VITE_GOOGLE_CLIENT_ID` de la web: el botón usa entonces el selector de cuentas del navegador y el aviso nombra a Trino en lugar del dominio de Supabase; en el cliente de Google, `https://birdnet-nu.vercel.app` debe figurar en *Orígenes de JavaScript autorizados*. Para publicar la app en Google hacen falta página principal y política de privacidad: `https://birdnet-nu.vercel.app` y `https://birdnet-nu.vercel.app/privacy.html`. Mientras tanto, en modo de prueba solo entran los usuarios de prueba agregados.

## Variables de entorno en Vercel

**Aplicación web** (se incrustan en el build; volver a desplegar tras cambiarlas):

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://tugzxyleoidiimhbnwde.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clave `anon` / *publishable* (pública por diseño; todas las tablas tienen RLS) |
| `VITE_GOOGLE_CLIENT_ID` | Opcional. ID de cliente OAuth de Google (termina en `.apps.googleusercontent.com`; es público). Sin él, Google funciona por redirección de Supabase |

Variables opcionales de la web (proveedor de mapas, centro inicial, zona horaria por defecto, fuentes de fotos, de resúmenes de Wikipedia y de GBIF, tiempos de espera): ver `.env.example`. Todo origen externo que se cambie debe añadirse también a la CSP de `vercel.json` (la prueba `src/config/config.test.ts` lo comprueba para los valores por defecto).

**API** (preset *Other*, Root Directory `.`):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Cadena del *Transaction pooler* (puerto 6543) con la contraseña de la base |
| `SUPABASE_AUTH_ISSUER` | `https://tugzxyleoidiimhbnwde.supabase.co/auth/v1` |
| `MODEL_RESOURCE_BASE_URL` | `https://tugzxyleoidiimhbnwde.supabase.co/storage/v1/object/public/models/birdnet-v2.4` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Necesarias desde S7 para la foto de perfil (y para el audio dudoso); sin ellas la foto no se puede subir |
| `SUPABASE_AVATAR_BUCKET`, `SUPABASE_AUDIO_BUCKET` | Opcionales: nombres de los buckets (por defecto `avatars`) |

Ajustes opcionales de la API (tiempos de espera, límites de resultados y exportación, zona horaria por defecto, `MODEL_MANIFEST_ALLOWED_HOSTS`): ver el README y `.env.example` del repositorio de la API. Si se define `MODEL_MANIFEST_URL`, su host debe coincidir con el de `SUPABASE_URL` o figurar en `MODEL_MANIFEST_ALLOWED_HOSTS`.

**Supabase Auth**: la longitud mínima de contraseña (*Authentication → Providers → Email*) debe ser 8, igual que `PASSWORD_MIN_LENGTH` del formulario.

## Comprobación rápida

- `https://bird-back.vercel.app/v1/health` y `https://birdnet-nu.vercel.app/api/v1/health` responden `{"status":"ok"}`.
- `https://birdnet-nu.vercel.app/privacy.html` muestra la política de privacidad.
- Primera visita → página de inicio → «Abrir Trino» (descarga una sola vez el modelo acústico y el geográfico); Escuchar → iniciar la escucha.
- Mapa → «Empezar caminata»: pide micrófono y ubicación, la pantalla se queda encendida, el sendero se dibuja al moverse y cada ave queda en su punto; «Terminar caminata» la guarda y aparece en la Bitácora.
- Guía → una ficha: clasificación, estado de conservación y mapa «Dónde vive» (GBIF).
- Cuenta → crear cuenta (contraseña dos veces) o continuar con Google; «¿Olvidaste tu contraseña?» envía el enlace. Con «Guardar dónde escuchas» activado (o un lugar activo), las detecciones se sincronizan; aparecen en «De todos» solo si la persona eligió compartir.
- Bitácora → resumen y últimas caminatas; si hay cantos sin ubicación, «Asignar y subir» con un lugar.
- Mapa → botón de lugares → crear un lugar, abrir su panel; exportar CSV.

## Desarrollo local

- Web: `npm ci`, `npm run dev` (Vite reenvía `/api` a `API_PROXY_TARGET`, por defecto `http://127.0.0.1:8000`). En desarrollo no hay Service Worker: el modelo se carga directamente al empezar a escuchar.
- API: ver el README del repositorio de la API (`uvicorn birdnet_api.app:app --port 8000`).
- Verificación: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
