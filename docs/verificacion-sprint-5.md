# Verificación del Sprint 5 — Cuenta, registro en la nube y mapa

## Alcance

- **Cuenta (RF-08, HU-05)**: registro e inicio de sesión con correo y contraseña en Supabase Auth. La sesión se entrega al trabajador de servicio en cada inicio y renovación del token, de modo que la cola de S4 se sincroniza sola. Las detecciones guardadas sin cuenta solo se asocian si la persona lo acepta de forma explícita.
- **Registro en la nube (RF-10)**: las detecciones con ubicación aproximada viajan por `POST /v1/detections/batch` (S4) a la tabla `detections`.
- **Mapa (RF-12, HU-07)**: vista con MapLibre y mapa base de OpenFreeMap (gratuito, sin clave). Agrupamiento nativo de puntos, filtros por especie y periodo, ficha emergente con especie, confianza y estado, y lista textual equivalente para lectores de pantalla. El mapa se descarga solo al abrir la vista.
- **API**: `GET /v1/detections?west&south&east&north[&species][&since][&until]`. Requiere sesión, respeta RLS (lectura colectiva), excluye las detecciones descartadas, no expone autor ni ruta de audio y devuelve como máximo 2.000 filas con la marca `truncated`.

## Configuración del proyecto de Supabase (una sola vez)

1. **Esquema**: en el panel de Supabase, abre *SQL Editor* y ejecuta, en este orden, el contenido completo de:
   1. `supabase/migrations/20260928000000_initial_schema.sql`
   2. `supabase/migrations/20261006000000_sync_integrity.sql`

   Comprueba en *Table Editor* que existen `profiles`, `sites`, `detections`, `verification_jobs` y `model_versions`, todas con RLS activo.
2. **Autenticación**: en *Authentication → URL Configuration*, pon como *Site URL* la dirección de producción (`https://birdnet-nu.vercel.app`) y añádela a *Redirect URLs*. Con la confirmación por correo activada (valor por defecto), cada cuenta nueva debe confirmar el correo antes de iniciar sesión. El servicio de correo gratuito de Supabase tiene un límite bajo de envíos por hora.
3. **Audio dudoso (opcional, S4)**: crea un bucket **privado** (por ejemplo `audio`) para los fragmentos autorizados. El bucket público `models` es solo para el modelo.

## Variables de entorno en Vercel

| Variable | Valor | Dónde se usa |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://tugzxyleoidiimhbnwde.supabase.co` | Cliente (build) |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima/publicable (*Project Settings → API*) | Cliente (build) |
| `SUPABASE_AUTH_ISSUER` | `https://tugzxyleoidiimhbnwde.supabase.co/auth/v1` | API: validación del JWT |
| `DATABASE_URL` | Cadena del *Transaction pooler* (puerto 6543) de *Connect* | API: consultas con RLS |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_AUDIO_BUCKET` | Solo si se activa la subida de audio | API: URL firmada |
| `MODEL_RESOURCE_BASE_URL` | Ya configurada | API: manifiesto del modelo |

Las variables `VITE_*` se incrustan en el build: después de crearlas hay que **volver a desplegar**. La clave `service_role` nunca lleva prefijo `VITE_`.

## Comprobación manual en producción

1. **Cuenta → Crear cuenta**: aparece el aviso de confirmación por correo. Tras confirmar, **Iniciar sesión** muestra el correo de la sesión.
2. Si había detecciones sin cuenta, aparece la pregunta de asociación. Al aceptar, se muestra el aviso de asociación.
3. En **Configuración**, activa la ubicación aproximada, vuelve a **Captura** y escucha hasta obtener una detección confirmada o provisional.
4. En **Configuración**, el contador de detecciones pendientes baja a 0 cuando la sincronización termina.
5. **Mapa**: aparece el punto o grupo en la celda aproximada. Pulsa un grupo (acerca la vista) y un punto (ficha con especie, confianza, estado y momento). Cambia especie y periodo.
6. Con el modo avión, el mapa muestra el aviso sin conexión y la captura sigue funcionando.

## Evidencia automatizada

- `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build` sin errores.
- `pytest backend/tests`: contrato HTTP del mapa (sesión obligatoria, límites del área y zona horaria). La prueba contra PostGIS real (lectura colectiva, descartadas ocultas, filtros por área y especie) se ejecuta con la base local de S4 o en CI.

## Límites conocidos

- No se admiten vistas que crucen el antimeridiano (irrelevante para la región de despliegue).
- El estilo de OpenFreeMap avisa en consola de una textura ausente (`wood-pattern`); no afecta al mapa.
- La ocultación de especies amenazadas en el mapa público se deja para cuando exista un catálogo de especies sensibles.
