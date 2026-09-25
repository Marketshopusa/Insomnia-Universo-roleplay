# Traslado de Insomnia a un Supabase propio

Estado: preparacion local. El frontend sigue apuntando al backend de Lovable Cloud
`pbormuamewbajnylzfqs`. El destino candidato para **ambas aplicaciones** es el
Supabase existente `kineva-staging` (`cexzmelshvbgabihtfvx`), en la cuenta del
propietario. No se ha cambiado el destino ni se ha escrito en Kineva Supabase.

## 1. Identificar el destino y los datos

- Reutilizar `kineva-staging` como destino compartido evita un segundo backend
  permanente. La CLI lo lista como `cexzmelshvbgabihtfvx`.
- La inspeccion de solo lectura encontro siete tablas publicas propias de Kineva:
  `series`, `episodes`, `characters`, `images`, `users`,
  `site_settings` y `audio_tracks`. Hay datos; no tratarlo como vacio.
  Ninguno de esos nombres coincide con las 13 tablas publicas que crean las
  migraciones de Insomnia. Auth, Storage, funciones y politicas siguen
  requiriendo auditoria. Su historial remoto de migraciones esta vacio.
  Un `db push --dry-run`
  propone las 16 migraciones del repositorio, pero no valida que cada SQL
  sea compatible con el esquema existente.
- El backend de Lovable Cloud presenta al menos 108 historias, 2 series de
  Shorts y 9 episodios visibles mediante acceso publico. Pueden existir
  usuarios, borradores y medios adicionales. Cambiar solamente las variables
  VITE_ no traslada los datos. La app sigue usando el origen hasta el corte.

## 2. Conservar datos si existen

En Lovable: More -> Cloud -> Overview -> Advanced settings ->
Export project data -> Database -> Export. El paquete incluye estructura,
datos y usuarios con hashes de contrasena. Descargar los archivos de Storage
por separado en More -> Cloud -> Storage. Mantener el respaldo fuera de git,
Cursor chat y la carpeta del frontend. No eliminar Lovable Cloud durante la
transicion.

El respaldo completo del origen contiene esquema, datos y Auth. **No restaurarlo
sin filtrar sobre el Supabase de Kineva**: podria reemplazar sus siete tablas,
usuarios, politicas o buckets. Respaldar primero el destino Kineva y revisar
esquema, Auth, Storage, triggers, funciones y migraciones existentes. Despues,
anadir Insomnia de forma selectiva, conservando IDs y relaciones; conciliar
usuarios y archivos de ambos lados. Probar la importacion antes del corte.

Fuentes: [exportacion de Lovable Cloud](https://docs.lovable.dev/features/advanced-settings)
y [migracion externa de Lovable](https://docs.lovable.dev/tips-tricks/external-deployment-hosting).

## 3. Preparar el esquema y la aplicacion

- Hay 16 migraciones en `supabase/migrations/`: 12 anteriores de Insomnia,
  dos de trabajos y montaje Kineva, una de renovacion de lease y una de
  `shorts-media` privado. En el destino existente, ya se ejecutaron
  `bunx supabase migration list --project-ref cexzmelshvbgabihtfvx` y
  `bunx supabase db push --dry-run --skip-vault --project-ref cexzmelshvbgabihtfvx`.
  El historial remoto no tiene entradas y el dry-run enumera las 16. No hacer
  un `db push` completo hasta comprobar colisiones y respaldar el destino.
- Verificar tablas, politicas RLS, RPC, triggers y los buckets
  `story-covers`, `user-story-covers`, `shorts-media` y
  `kineva-references`. La ultima migracion crea el bucket de videos como
  privado y permite firmar solo el video actual de una serie publicada o
  visible para su propietario. Las tomas intermedias no son publicas.
- Desplegar las Edge Functions que usa Insomnia, ademas de
  `generate-novel` y `kineva-video`; revisar las 11 carpetas en
  `supabase/functions/`. Confirmar configuracion JWT en `config.toml`.
- Conciliar en el proyecto compartido proveedores de Auth, URL de sitio y
  redirecciones OAuth/correo usados por ambas aplicaciones.
  Una sesion existente debe iniciar sesion de nuevo tras el cambio.
- Configurar los secretos que correspondan en Supabase: `NOVITA_API_KEY`,
  `LOVABLE_API_KEY` (si aun funciona fuera de Lovable) y
  `KINEVA_ALLOWED_USER_IDS` con UUID de Auth del proyecto compartido.
  Supabase suministra sus variables de entorno de Edge Functions.
  El worker usa la clave service-role **solo en su proceso local**.
- Restituir archivos de Storage en los buckets correspondientes y comprobar
  rutas antes de la prueba de reproduccion.

[Guia de migraciones de Supabase](https://supabase.com/docs/guides/deployment/database-migrations);
[limitaciones de la copia de un proyecto](https://supabase.com/docs/guides/platform/clone-project).

## 4. Prueba privada antes del cambio de destino

1. Configurar URL, Reference ID y clave publicable de `kineva-staging`
   para una **vista previa local**; mantener el sitio publicado apuntando
   al backend anterior hasta terminar la validacion.
2. Probar registro/inicio de sesion, perfiles, categorias, historias,
   Studio, Shorts, portadas y acceso de otra cuenta. Verificar que los
   registros migrados conservan usuarios y referencias.
3. En Kineva, reiniciar ComfyUI principal cuando no haya trabajos, ejecutar
   `start-worker.ps1 -PreflightOnly`, seleccionar una referencia de **una
   sola persona** y generar una toma neutral que pase QC. La prueba H3 del
   24-25 de septiembre cambio abruptamente de personaje en el fotograma 14
   y debe repetirse.
4. Probar dos tomas, montaje, reparacion de una toma y publicacion manual;
   verificar que otra cuenta no ve borradores ni puede firmar sus videos.
   Transcribir y revisar el dialogo audible: el bloqueo del texto en el
   plan no demuestra pronunciacion ni sincronizacion labial.
5. Revisar conteos de tablas y archivos, funciones y secretos. Luego
   cambiar `.env` y `supabase/config.toml` al ID compartido en una revision
   separada, construir, desplegar la app y verificarla de nuevo.

Las claves de servicio, contrasenas de base de datos, exportaciones y secretos
nunca se incluyen en commits ni mensajes de chat.
