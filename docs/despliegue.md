# Despliegue y configuración

Trino (antes BirdNet Local) se compone de dos proyectos (ver ADR-11 en `decisiones.md`):

| Parte | Repositorio | URL |
|---|---|---|
| Aplicación web (React + Vite) | `Jacklb19/BirdNet` | https://birdnet-nu.vercel.app |
| API (FastAPI) | `Jacklb19/Bird_Back` | https://bird-back.vercel.app |

Ambos se despliegan solos en Vercel al fusionar en `main`. El trabajo diario va en `dev`.

## Supabase (una sola vez)

1. **Esquema**: en *SQL Editor*, ejecutar en orden los archivos de `supabase/migrations/` del repositorio de la API. La migración `20261008000000_profiles_and_avatars.sql` (S7) crea también el bucket privado `avatars` (fotos de perfil, solo WebP de hasta 200 kB). La migración `20261010000000_fine_location_and_sharing.sql` (S8, ADR-22) añade la celda de ~10 m y la columna de compartir: se aplica **antes** de fusionar la API, y la API se despliega **antes** que la web. La migración `20261011000000_recordings_and_review.sql` (S9, ADR-28) crea el bucket privado `recordings` (solo WebM de hasta 100 kB) y las columnas de grabación y de revisión, con el mismo orden: migración, archivos del modelo (punto 3), API, web.
2. **Autenticación**: en *Authentication → URL Configuration*, *Site URL* = `https://birdnet-nu.vercel.app` y en *Redirect URLs* `https://birdnet-nu.vercel.app/**` y `http://localhost:5180/**` (regreso de Google y del enlace para recuperar la contraseña).
3. **Modelo**: bucket público `models`, carpeta `birdnet-v2.4/` (la base de `MODEL_RESOURCE_BASE_URL`), con `birdnet_model.onnx` y `labels.txt`. Desde S9 (ADR-31) se suben además, **antes** de fusionar la API y la web, los archivos que escribe `python scripts/prepare-birdnet-plus.py` en `public/models/`:

   | Archivo | Tamaño | Qué es |
   |---|---|---|
   | `birdnet_geo_model_v3.onnx` | 13,7 MB | Filtro geográfico del V3 para el modelo de siempre |
   | `birdnet_plus_model.part1.onnx`, `birdnet_plus_model.part2.onnx` | 33,5 MB cada uno | BirdNET+ V3 en dos partes (Supabase Free no guarda archivos de más de 50 MB) |
   | `birdnet_plus_labels.txt` | 0,4 MB | Sus etiquetas |
   | `birdnet_plus_geo_model.onnx` | 13,7 MB | Su filtro geográfico |

   El hash y el tamaño de cada archivo están en `public/models/manifest.json` y en el manifiesto de la API (`birdnet_api/model_manifest.json`), que deben ser iguales; si se vuelve a ejecutar el script, se actualizan los dos con lo que imprime. `birdnet_geo_model.onnx` (el filtro del v2.4, ADR-18) se deja en el bucket mientras haya versiones anteriores de la app instaladas; sigue generándose con `python scripts/prepare-geo-model.py` porque la evaluación y el script anterior lo usan. Cada instalación nueva descarga 52,4 MB y quien elige el V3, 80,6 MB más: con los 5 GB de egreso al mes de Supabase Free alcanza para unas 95 instalaciones al mes sin el V3.
4. **Audio dudoso**: retirado en S9 (ADR-32). Si existía el bucket privado de fragmentos, se puede borrar.
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
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Necesarias desde S7 para la foto de perfil; sin ellas la foto no se puede subir |
| `SUPABASE_AVATAR_BUCKET` | Opcional: nombre del bucket de las fotos de perfil (por defecto `avatars`). `SUPABASE_AUDIO_BUCKET` ya no se usa (ADR-32) y se puede borrar |
| `SUPABASE_RECORDING_BUCKET`, `RECORDING_QUOTA_BYTES` | Opcionales (S9): bucket de las grabaciones guardadas (por defecto `recordings`) y tope por cuenta (por defecto 50 MiB). Las grabaciones necesitan `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` |

Ajustes opcionales de la API (tiempos de espera, límites de resultados y exportación, zona horaria por defecto, `MODEL_MANIFEST_ALLOWED_HOSTS`): ver el README y `.env.example` del repositorio de la API. Si se define `MODEL_MANIFEST_URL`, su host debe coincidir con el de `SUPABASE_URL` o figurar en `MODEL_MANIFEST_ALLOWED_HOSTS`.

**Supabase Auth**: la longitud mínima de contraseña (*Authentication → Providers → Email*) debe ser 8, igual que `PASSWORD_MIN_LENGTH` del formulario.

## Comprobación rápida

- `https://bird-back.vercel.app/v1/health` y `https://birdnet-nu.vercel.app/api/v1/health` responden `{"status":"ok"}`.
- `https://birdnet-nu.vercel.app/privacy.html` muestra la política de privacidad.
- Primera visita → página de inicio → «Abrir Trino» (descarga una sola vez el modelo acústico y el geográfico); Escuchar → iniciar la escucha.
- Mapa → «Empezar caminata»: pide micrófono y ubicación, la pantalla se queda encendida, el sendero se dibuja al moverse y cada ave queda en su punto; «Terminar caminata» la guarda y aparece en la Bitácora.
- Guía → una ficha: clasificación, estado de conservación y mapa «Dónde vive» (GBIF).
- Cuenta → crear cuenta (contraseña dos veces) o continuar con Google; «¿Olvidaste tu contraseña?» envía el enlace. Con «Guardar dónde escuchas» activado (o un lugar activo), las detecciones se sincronizan; aparecen en «De todos» solo si la persona eligió compartir.
- Ajustes → Grabaciones: con sesión, encender «Guardarlas también en mi cuenta»; escuchar hasta registrar un ave; en la Bitácora, abrir el registro y oír la grabación; tras sincronizar, Ajustes muestra cuántas hay en la cuenta y deja borrarlas.
- Ajustes → Opciones técnicas: «Modelo que escucha» ofrece BirdNET v2.4; «Modelo de vista previa» deja descargar BirdNET+ V3 (unos 81 MB) y, una vez en el teléfono, elegirlo solo o junto al otro; «Cuándo anotar un canto» ofrece Cuidadosa y Amplia. Lo elegido se aplica al volver a empezar a escuchar. En Permisos ya no aparece «Enviar cantos dudosos».
- Bitácora → un registro → «¿Era esta ave?»: confirmar, corregir (buscar otra especie) o descartar; el estado cambia en la Bitácora y, tras sincronizar, en la ficha de la especie.
- Bitácora → resumen y últimas caminatas; si hay cantos sin ubicación, «Asignar y subir» con un lugar.
- Mapa → botón de lugares → crear un lugar, abrir su panel; exportar CSV.

## Desarrollo local

- Web: `npm ci`, `npm run dev` (Vite reenvía `/api` a `API_PROXY_TARGET`, por defecto `http://127.0.0.1:8000`). En desarrollo no hay Service Worker: el modelo se carga directamente al empezar a escuchar.
- API: ver el README del repositorio de la API (`uvicorn birdnet_api.app:app --port 8000`).
- Verificación: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
