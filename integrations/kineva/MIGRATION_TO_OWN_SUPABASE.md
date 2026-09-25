# Traslado de Insomnia a un Supabase propio

Estado: preparacion local. El frontend sigue apuntando al backend de Lovable Cloud
`pbormuamewbajnylzfqs`. No se ha cambiado el destino ni se han desplegado
migraciones o funciones en un proyecto nuevo.

## 1. Identificar proyecto y datos existentes

- El propietario crea el nuevo proyecto en su cuenta de Supabase y comparte
  solo el **Reference ID** (no contrasenas ni claves).
- La CLI autenticada debe mostrar ese ID en `bunx supabase projects list`.
  Vincular el repositorio con `bunx supabase link --project-ref <ID>` solo tras
  confirmar que es el backend nuevo de Insomnia.
- Decidir si hay usuarios, series, historias o medios que deban conservarse.
  Un proyecto nuevo esta vacio: cambiar solamente las variables VITE_ no
  traslada ningun dato.

## 2. Conservar datos si existen

En Lovable: More -> Cloud -> Overview -> Advanced settings ->
Export project data -> Database -> Export. El paquete incluye estructura,
datos y usuarios con hashes de contrasena. Descargar los archivos de Storage
por separado en More -> Cloud -> Storage. Mantener el respaldo fuera de git,
Cursor chat y la carpeta del frontend. No eliminar Lovable Cloud durante la
transicion.

El respaldo completo ya contiene tablas y datos. **No ejecutar las migraciones
iniciales encima de un esquema restaurado** sin comparar estructura e historia
de migraciones. Si no hay datos que conservar, se puede iniciar desde un
proyecto vacio y aplicar los archivos del repositorio en orden cronologico.

Fuentes: [exportacion de Lovable Cloud](https://docs.lovable.dev/features/advanced-settings)
y [migracion externa de Lovable](https://docs.lovable.dev/tips-tricks/external-deployment-hosting).
## 3. Preparar el esquema y la aplicacion

- Hay 16 migraciones en `supabase/migrations/`: 12 anteriores de Insomnia,
  dos de trabajos y montaje Kineva, una de renovacion de lease y una de
  `shorts-media` privado. En un proyecto vacio, revisar
  `bunx supabase migration list` y `bunx supabase db push --dry-run`
  antes de `bunx supabase db push`. En uno restaurado, resolver la historia
  con el esquema real antes de aplicar solo las pendientes.
- Verificar tablas, politicas RLS, RPC, triggers y los buckets
  `story-covers`, `user-story-covers`, `shorts-media` y
  `kineva-references`. La ultima migracion crea el bucket de videos como
  privado y permite firmar solo el video actual de una serie publicada o
  visible para su propietario. Las tomas intermedias no son publicas.
- Desplegar las Edge Functions que usa Insomnia, ademas de
  `generate-novel` y `kineva-video`; revisar las 11 carpetas en
  `supabase/functions/`. Confirmar configuracion JWT en `config.toml`.
- Configurar en el proyecto nuevo proveedores de Auth, URL de sitio y
  redirecciones OAuth/correo, segun los proveedores reales de la app.
  Una sesion existente debe iniciar sesion de nuevo tras el cambio.
- Configurar los secretos que correspondan en Supabase: `NOVITA_API_KEY`,
  `LOVABLE_API_KEY` (si aun funciona fuera de Lovable) y
  `KINEVA_ALLOWED_USER_IDS` con UUID de Auth del nuevo proyecto.
  Supabase suministra sus variables de entorno de Edge Functions.
  El worker usa la clave service-role **solo en su proceso local**.
- Restituir archivos de Storage en los buckets correspondientes y comprobar
  rutas antes de la prueba de reproduccion.

[Guia de migraciones de Supabase](https://supabase.com/docs/guides/deployment/database-migrations);
[limitaciones de la copia de un proyecto](https://supabase.com/docs/guides/platform/clone-project).
## 4. Prueba privada antes del cambio de destino

1. Configurar URL, Reference ID y clave publicable del proyecto nuevo
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
   cambiar `.env` y `supabase/config.toml` al nuevo ID en una revision
   separada, construir, desplegar la app y verificarla de nuevo.

Las claves de servicio, contrasenas de base de datos, exportaciones y secretos
nunca se incluyen en commits ni mensajes de chat.
