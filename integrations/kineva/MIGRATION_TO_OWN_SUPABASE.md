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
  Ninguno de esos nombres coincide con las 12 tablas publicas de Insomnia
  presentes en el respaldo. La rama agrega `kineva_render_jobs` como tabla
  numero 13. Auth, Storage, funciones y politicas del **destino** siguen
  requiriendo auditoria. Su historial remoto de migraciones esta vacio.
  Un `db push --dry-run`
  propone las 16 migraciones del repositorio, pero no valida que cada SQL
  sea compatible con el esquema existente.
- El respaldo descargado confirma 12 tablas publicas, 108 historias, 2 series
  de Shorts y 9 episodios; contiene ademas 2 usuarios de Auth y 2 perfiles.
  Cambiar solamente las variables VITE_ no traslada los datos; la app sigue
  usando el origen hasta el corte.

## 2. Respaldos recibidos de Insomnia

El 25 de septiembre se recibio en Descargas
`bucket-database_export_25_09_26-files.zip` (86 194 783 bytes; SHA-256
`04ffde52e2b2ad3d32e9db7ca791eec158b45036c3a9cc6d1528c9e736610a57`).
Contiene `persona-play-world_260925.backup`, un archivo binario PostgreSQL
custom (`PGDMP`), no SQL de texto. Se verifico el ZIP y se leyo el indice con
`pg_restore -l` y SQL generado solo a stdout; **no se restauro ni se conecto
al destino**. El respaldo tiene 687 entradas, incluidas 12 tablas publicas,
2 usuarios de `auth.users` con hashes de contrasena, 2 identidades y 2 perfiles
vinculados por `profiles.user_id`. Hay ademas 106 refresh tokens y 13 sesiones
antiguas: no son sesiones que deban copiarse al proyecto nuevo. Conservar los
originales fuera de git, chats y frontend; mantener Lovable Cloud durante el
corte y pedir nuevo respaldo si se siguen creando datos.

Conteos de filas publicas del respaldo (snapshot del 25 de septiembre):

| Tabla | Filas | Tabla | Filas |
| --- | ---: | --- | ---: |
| `categories` | 85 | `novel_projects` | 3 |
| `profiles` | 2 | `shorts_episodes` | 9 |
| `shorts_series` | 2 | `stories` | 108 |
| `story_categories` | 443 | `story_customizations` | 2 |
| `story_images` | 12 | `story_sessions` | 9 |
| `user_stories` | 1 | `voice_settings` | 0 |

El 25 de septiembre se recibieron y verificaron por separado
`insomnia-storage.zip` y `insomnia-storage-inventory.csv` en Descargas:

| Bucket | Objetos | Bytes sin comprimir | MIME verificado |
| --- | ---: | ---: | --- |
| `shorts-media` | 8 | 23 072 515 | MP4 |
| `story-covers` | 5 | 6 528 712 | PNG |
| `story-gallery` | 12 | 2 317 158 | JPEG |
| `user-story-covers` | 8 | 17 114 790 | MP4 |
| **Total** | **33** | **49 033 175** | |

Cada ruta `bucket/ruta` y tamano del CSV coincide con un archivo del ZIP;
no hay archivos faltantes, extras ni duplicados. Los 33 pasan CRC y firma de
tipo; no hay rutas de escape, entradas cifradas ni enlaces simbolicos. El
archivo comprimido incluye 11 entradas de directorio. SHA-256 del ZIP:
`c3764ba884ecf78fbe3cd27879d8b70bd11663d181f86b8f8b31fafcb43bc28c`;
del CSV: `0e03f2d05f7684f6b9f20446c51e01f4d83c9df9a27d621ca24f3d65e165dbbb`.
Conservar los originales; la validacion no los extrajo ni subio a Supabase.

Las 33 entradas `storage.objects` del respaldo coinciden exactamente por
bucket, ruta y tamano con el CSV y el ZIP de archivos. `storage.buckets` tambien
incluye `database_export_25_09_26`, usado solo para entregar el backup:
**excluirlo de la migracion**. La base no contiene los bytes de los archivos;
los 33 del ZIP deben subirse por separado. Hay 8 videos referenciados en los
9 episodios; las 8 rutas `video_url` coinciden con los nombres de los 8 objetos
de `shorts-media`.

**No restaurar el backup completo sobre Kineva**: incluye objetos internos de
`auth`, `storage`, `realtime` y otras extensiones del proyecto de origen. Orden
para integrar en el unico Supabase compartido:

1. Obtener respaldo verificable de `kineva-staging`, incluidos esquema, datos,
   Auth y Storage. Inventariar sus UUID/correos de Auth, triggers, funciones,
   politicas y buckets; comprobar colisiones con los 2 usuarios del origen.
2. Comparar el esquema publico real del backup con las 16 migraciones del
   repositorio y el esquema actual de Kineva. Seleccionar solo los objetos
   propios de Insomnia; no importar esquemas administrados ni roles enteros.
3. Preparar tablas, indices, RLS y funciones de Insomnia sin borrar tablas ni
   datos de Kineva. Conciliar `on_auth_user_created`, que inserta en
   `public.profiles`, antes de cargar Auth. `profiles.id` y `profiles.user_id`
   son UUID distintos; mantener las relaciones por `user_id`.
4. Tras comprobar conflictos de UUID y correo, insertar los 2 usuarios y sus
   identidades conservando hashes, con el trigger de perfiles controlado para
   evitar duplicados. Cargar los 2 perfiles y las filas publicas respetando
   claves externas. No copiar refresh tokens ni sesiones; iniciar sesion de
   nuevo en el destino, que tiene otro secreto JWT.
5. Crear los cuatro buckets de Insomnia con sus permisos revisados y subir
   los 33 archivos. El origen marca `story-gallery` y `shorts-media` privados,
   pero tiene politicas SELECT amplias para ambos. Restringir `story-gallery`
   al acceso previsto y aplicar la politica revisada de `shorts-media` antes
   de exponerlos. No traer el bucket de exportacion.
6. Inventariar y actualizar las URL absolutas antiguas tras copiar los medios;
   el host Lovable anterior aparece al menos en 9 filas publicas (8 historias,
   1 historia de usuario). No cambiar rutas relativas ya validas de los 8
   episodios. Verificar conteos, integridad referencial, RLS y accesos con
   dos cuentas en un ensayo aislado antes del corte.
7. Poner la vista previa local de Insomnia en el Supabase compartido, probar
   las funciones de IA y el recorrido Studio -> worker Kineva -> Shorts, y
   solo entonces preparar el cambio del sitio publicado.

Fuentes: [exportacion de Lovable Cloud](https://docs.lovable.dev/features/advanced-settings),
[migracion externa de Lovable](https://docs.lovable.dev/tips-tricks/external-deployment-hosting)
y [migracion de usuarios Auth](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects).

## 3. Preparar el esquema y la aplicacion

- Hay 16 migraciones en `supabase/migrations/`: 12 anteriores de Insomnia,
  dos de trabajos y montaje Kineva, una de renovacion de lease y una de
  `shorts-media` privado. En el destino existente, ya se ejecutaron
  `bunx supabase migration list --project-ref cexzmelshvbgabihtfvx` y
  `bunx supabase db push --dry-run --skip-vault --project-ref cexzmelshvbgabihtfvx`.
  El historial remoto no tiene entradas y el dry-run enumera las 16. No hacer
  un `db push` completo hasta comprobar colisiones y respaldar el destino.
- Verificar tablas, politicas RLS, RPC, triggers y los buckets
  `story-covers`, `user-story-covers`, `story-gallery`,
  `shorts-media` y `kineva-references`. El repositorio contiene una
  politica SELECT amplia para `story-gallery`, pero ninguna migracion crea
  ese bucket: el backup confirma que es privado y que tiene 12 objetos.
  Crear el bucket y decidir el acceso por usuario/historia antes de migrar
  esa politica. `shorts-media` es privado en el origen, aunque su politica
  original permite SELECT de todos sus objetos. La ultima migracion elimina
  esa politica y permite leer solo el video de un episodio visible o propio;
  las 8 rutas originales de episodios coinciden con `storage.objects.name`.
  Probarla con ambas cuentas tras migrar.
- Desplegar las Edge Functions que usa Insomnia, ademas de
  `generate-novel` y `kineva-video`; revisar las 11 carpetas en
  `supabase/functions/`. Confirmar configuracion JWT en `config.toml`.
- Conciliar Auth del proyecto compartido con el acceso por correo y
  contrasena de Insomnia. Lovable reporta como redirecciones actuales
  `https://persona-play-world.lovable.app` y
  `https://id-preview--1f258efc-a1f1-4c06-81e7-dff7d171d288.lovable.app`;
  agregar el dominio definitivo tras verificarlo. Una sesion existente
  debe iniciar sesion de nuevo tras el cambio.
- Configurar `NOVITA_API_KEY` y `KINEVA_ALLOWED_USER_IDS` si se usan;
  Lovable tambien reporta `ELEVENLABS_API_KEY`, aunque no aparece en el
  codigo actual del repositorio: conciliar versiones desplegadas.
  `LOVABLE_API_KEY` sirve a su propio gateway y Lovable reporta que no
  funciona fuera de su plataforma. Las diez funciones que lo invocan
  necesitan un proveedor alternativo y pruebas antes de cambiar la app.
  Supabase suministra sus variables de entorno de Edge Functions. El worker
  usa la clave service-role **solo en su proceso local**.
- Restituir archivos de Storage en los buckets correspondientes. Varias
  columnas pueden almacenar URL absolutas del backend Lovable anterior:
  inventariar y reescribir solo las referencias verificadas despues de
  copiar archivos, conservando relaciones e IDs.

[Guia de migraciones de Supabase](https://supabase.com/docs/guides/deployment/database-migrations);
[limitaciones de la copia de un proyecto](https://supabase.com/docs/guides/platform/clone-project).

## 4. Sustituir el gateway de IA de Lovable

El codigo de diez funciones usa `LOVABLE_API_KEY` y
`https://ai.gateway.lovable.dev`: `generate-narrative`, `generate-novel`,
`generate-shorts-series`, `illustrate-scene`, `shorts-video`,
`speech-to-text`, `story-chat`, `story-gallery`,
`text-to-speech` y `translate`. Solo `kineva-video` no depende de ese
gateway. No copiar la clave de Lovable al nuevo Supabase como supuesto
reemplazo. Adaptar esas funciones a proveedores propios con claves privadas
y probar texto, imagen, video, chat, traduccion, voz y transcripcion.
Los modelos y formatos de respuesta se revisan por funcion; migrar solamente
la base dejaria funcionalidades sin IA. El usuario no debe pagar ni activar
proveedores nuevos antes de aprobar la seleccion y sus costos.

## 5. Prueba privada antes del cambio de destino

1. Configurar URL, Reference ID y clave publicable de `kineva-staging`
   para una **vista previa local**; mantener el sitio publicado apuntando
   al backend anterior hasta terminar la validacion.
2. Probar registro/inicio de sesion, perfiles, categorias, historias,
   Studio, Shorts, portadas y acceso de otra cuenta. Verificar que los
   registros migrados conservan usuarios y referencias.
3. En Kineva, la instancia principal se reinicio sin trabajos el 25 de
   septiembre y `start-worker.ps1 -PreflightOnly` paso. Una prueba nueva con
   referencia de **una sola persona** se esta renderizando; esperar el
   manifiesto, QC y revision visual antes de aceptarla. La prueba H3 anterior
   cambio abruptamente de personaje en el fotograma 14. Al iniciar ComfyUI,
   usar `start-comfy.ps1` para suministrar el `llama-server` local al planner.
4. Probar dos tomas, montaje, reparacion de una toma y publicacion manual;
   verificar que otra cuenta no ve borradores ni puede firmar sus videos.
   Transcribir y revisar el dialogo audible: el bloqueo del texto en el
   plan no demuestra pronunciacion ni sincronizacion labial.
5. Revisar conteos de tablas y archivos, funciones y secretos. Luego
   cambiar `.env` y `supabase/config.toml` al ID compartido en una revision
   separada, construir, desplegar la app y verificarla de nuevo.

Las claves de servicio, contrasenas de base de datos, exportaciones y secretos
nunca se incluyen en commits ni mensajes de chat.
