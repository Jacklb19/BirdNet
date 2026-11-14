# Copias y recuperación

Procedimiento del dueño; no se ejecuta contra producción desde las pruebas. Guardar una copia antes de cada migración y semanalmente mientras haya datos que conservar. Registrar la fecha de la última copia y de la última restauración: hasta entonces no existe un RPO/RTO medido de producción.

## Qué conservar

- Base: roles propios, esquema y datos, incluidas cuentas Auth, perfiles, detecciones, notas, veredictos, sitios, caminatas y reservas de grabaciones. Conservar también los triggers de `auth.users` y las políticas de Storage de las migraciones.
- Objetos: `avatars`, `recordings` y los modelos versionados con sus manifiestos y SHA-256. Un dump SQL no contiene sus archivos.
- Configuración: inventario de nombres de variables, dominios, reglas de firewall, OAuth, SMTP y MFA. Las claves y contraseñas se conservan por separado, en almacenamiento cifrado del dueño.

Las copias contienen datos personales y audio privado. Usar un volumen cifrado fuera de los repositorios, sin enlaces públicos; limitar el acceso al dueño y eliminar las copias vencidas. No restaurar una cuenta borrada para volver a publicarla: mantener el registro de solicitudes de borrado fuera de la copia y reaplicarlas antes de habilitar acceso.

## Extraer una copia real

Supabase recomienda exportaciones periódicas para Free; sus backups de base no incluyen los objetos de Storage. Consultar [backups](https://supabase.com/docs/guides/platform/backups) y el [procedimiento oficial de copia y restauración](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), verificados el 2026-11-14.

En una carpeta cifrada, con la CLI de Supabase ya instalada y la conexión de la base introducida como variable local privada (sin pegarla en código ni registros):

```powershell
supabase db dump --remote=$env:TRINO_SOURCE_DATABASE_URL -f roles.sql --role-only
supabase db dump --remote=$env:TRINO_SOURCE_DATABASE_URL -f schema.sql
supabase db dump --remote=$env:TRINO_SOURCE_DATABASE_URL -f data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
Get-FileHash -Algorithm SHA256 roles.sql, schema.sql, data.sql
```

Exportar además los objetos mediante las herramientas del dueño para Storage. Inventariar bucket, ruta, bytes y SHA-256 de cada archivo. Verificar que todas las rutas enlazadas por `profiles.avatar_path` y `detections.ruta_grabacion` están en el inventario. No basta con copiar las filas de `storage.objects`. La migración entre proyectos del enlace oficial explica la copia separada de archivos y las personalizaciones de Auth/Storage.

## Ensayar la restauración

1. Elegir una base vacía y aislada; comprobar su host y nombre antes de importar. No apuntar la restauración a la base que sirve la app. En un proyecto Supabase distinto, mantener el acceso público deshabilitado durante el ensayo y respetar el máximo de proyectos gratuitos; no crear recursos de pago.
2. Restaurar roles propios, esquema y datos siguiendo el procedimiento oficial, con parada al primer error. Revisar previamente los roles gestionados por Supabase y las personalizaciones de `auth`/`storage`; no ejecutar a ciegas un dump de roles globales sobre un proyecto gestionado.
3. Restaurar los objetos, conservando rutas, tipos, límites y privacidad de los buckets. Comparar cantidades, bytes y hashes con el inventario. Cambiar las credenciales de prueba sin reutilizar secretos de producción.
4. Comparar cantidades por tabla e integridad de referencias. Comparar `pg_policies`, `pg_class.relrowsecurity`, índices, funciones y restricciones. Probar las dos identidades del conjunto de privacidad: la segunda no puede leer notas, grabaciones, perfiles ni caminatas de la primera.
5. Entrar con una cuenta de ensayo, abrir un canto, reproducir y borrar un clip, exportar CSV y comprobar MFA. Medir el tiempo hasta que esas comprobaciones pasan. Solo entonces registrar la restauración como válida.

## Evidencia local, 2026-11-14

En el contenedor PostGIS desechable se hizo `pg_dump --format=custom`, se creó una segunda base vacía y se restauró con `pg_restore --exit-on-error`. Coincidieron 300 usuarios ficticios, 300 perfiles, 418 detecciones, 24 sitios, 18 caminatas, las 11 tablas públicas con su configuración RLS, 37 políticas y 26 índices. Los roles del clúster ya existían; este ensayo no demuestra una restauración de Auth/Storage de Supabase real. No se copiaron cuentas, secretos ni objetos reales. El índice nuevo del mapa se comprobó después, por separado.

Pendiente del dueño: primera copia real cifrada, inventario de objetos, restauración con Auth/Storage y tiempo de recuperación medido.
