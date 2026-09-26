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
  numero 13. El respaldo del destino confirma 1 usuario Kineva, 2 series,
  2 episodios, 4 personajes, 6 imagenes, 1 ajuste y 0 pistas de audio.
  Auth no tiene usuarios ni identidades; Storage tiene 3 buckets y 29
  objetos. Su historial remoto de migraciones esta vacio.
  `db push --dry-run` enumera las 17 migraciones, incluida la nueva
  privacidad de `story-gallery`. Un dry-run no valida que cada SQL sea
  compatible con el esquema existente.
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

La comparacion offline encontro las 12 tablas del origen en las migraciones:
11 coinciden en nombres de columnas desde CREATE TABLE; las dos columnas
adicionales de `user_stories` aparecen en una migracion ALTER TABLE. Los
nombres de las 32 politicas publicas del backup tambien aparecen en las
migraciones. Una lectura adicional de ambos respaldos con `pg_restore
--schema-only --no-owner --no-acl` confirma que los nombres de 12 tablas,
3 funciones, 2 tipos, 9 triggers y 32 politicas del esquema `public` de
Insomnia no colisionan con los de Kineva (7 tablas y sin funciones,
tipos, triggers o politicas propios en `public`). Los nombres de esos objetos
Insomnia aparecen en los SQL del repositorio; tambien existe un trigger
`on_auth_user_created` sobre `auth.users` en el origen. Este cotejo de
nombres no compara definiciones completas, claves ni RLS efectivo y no
autoriza un `db push` sobre el destino con datos.

**Semillas historicas que interfieren con la importacion.** La primera
migracion agrega 12 categorias y 12 historias de demostracion con UUID
nuevos. La tercera borra esas categorias y carga 85 categorias; conserva
las 12 historias de ejemplo. El backup incluye sus propios 85 registros
de `categories` y 108 de `stories` con IDs que deben preservarse. Antes
de cargar sus filas, el ensayo aislado debe comprobar que las tablas
Insomnia recien creadas contienen solo las semillas esperadas
(`categories=85`, `stories=12`, `story_categories=0`), y retirar las
semillas de esas tres tablas en orden de dependencias. Con la app todavia
sin apuntar al destino, verificar tambien que el resto de tablas Insomnia
siguen vacias. Repetir conteos despues de importar: 85 categorias y 108
historias, con las relaciones del origen intactas. No hacer este borrado
en tablas con datos nuevos del usuario, no tocar las siete tablas Kineva
y no asumir que `db push --dry-run` detectara este conflicto.

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

1. Conservar los dos backups de base y los dos ZIP de Storage verificados
   fuera de Git. Repetir los snapshots si cambia algun origen antes del
   corte. El destino tiene 0 usuarios Auth; el correo del usuario Kineva
   heredado coincide con uno de los usuarios de Insomnia. Conciliar ese
   acceso sin sobreescribir contrasenas ni asumir que los IDs enteros y UUID
   son equivalentes.
2. Comparar el esquema publico real del backup con las 17 migraciones del
   repositorio y el esquema actual de Kineva. Seleccionar solo los objetos
   propios de Insomnia; no importar esquemas administrados ni roles enteros.
3. Preparar tablas, indices, RLS y funciones de Insomnia sin borrar tablas ni
   datos de Kineva. En el ensayo aislado comprobar y retirar las 85 categorias
   y 12 historias sembradas por las migraciones antes de importar las filas
   del respaldo; los UUID originales y referencias cruzadas deben sobrevivir.
   Conciliar `on_auth_user_created`, que inserta en `public.profiles`, antes
   de cargar Auth. `profiles.id` y `profiles.user_id` son UUID distintos;
   mantener las relaciones por `user_id`.
4. Tras comprobar conflictos de UUID y correo, insertar los 2 usuarios y sus
   identidades conservando hashes, con el trigger de perfiles controlado para
   evitar duplicados. Cargar los 2 perfiles y las filas publicas respetando
   claves externas. No copiar refresh tokens ni sesiones; iniciar sesion de
   nuevo en el destino, que tiene otro secreto JWT.
5. Crear los cuatro buckets de Insomnia con sus permisos revisados y subir
   los 33 archivos. El origen marca `story-gallery` y `shorts-media` privados,
   pero tiene politicas SELECT amplias para ambos. Aplicar las migraciones
   nuevas de privacidad: la galeria solo admite lectura de imagenes `ready`
   vinculadas a historias visibles y Shorts de episodios propios o publicados.
   Los 12 objetos de galeria coinciden con `story_images.storage_path` y
   tienen estado `ready`. Probar acceso anonimo, propio y ajeno tras aplicar
   los SQL. No traer el bucket de exportacion.
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

## 2A. Respaldo verificado del Supabase Kineva

El 25 de septiembre se genero y verifico en Descargas
`kineva-staging-20260925-155839.backup` (388 621 bytes; SHA-256
`7704375a385576f85f93ac701fd67bf6aac1009c4bab4582f3de46031477de18`).
Es un backup PostgreSQL custom con 615 entradas de indice. El contenido
publico de Kineva conserva estas filas: `users` 1, `series` 2,
`episodes` 2, `characters` 4, `images` 6,
`site_settings` 1 y `audio_tracks` 0. Auth del destino tiene 0
usuarios y 0 identidades, y no tiene el trigger de perfil de Insomnia.
Los nombres de las tablas publicas, funciones publicas y buckets del origen
no colisionan con los del destino. Las columnas de `auth.users` y
`auth.identities` de ambos snapshots coinciden en nombre y orden.
Los ACL tambien difieren: el origen Lovable concede permisos al rol
`sandbox_exec` y el destino conserva el rol `kineva_runtime`.
Excluir ACL y roles del origen durante el traslado; preservar los permisos
de Kineva y definir permisos minimos de Insomnia para roles existentes.

El `public.users` heredado de Kineva usa ID **entero** y contrasena bcrypt;
Insomnia relaciona perfiles e historias con usuarios Auth de ID **UUID**.
Un correo aparece en ambos sistemas. Mantener el usuario Kineva y las dos
cuentas Auth sin sobreescribir credenciales; cualquier enlace de identidades
entre aplicaciones requiere un mapeo explicito y una prueba de acceso.
El trigger de Insomnia crea `public.profiles` tras registrar un usuario
Auth: controlar ese trigger al cargar las dos cuentas y sus dos perfiles.

Los bytes de Storage del destino se copiaron por separado en Descargas.
`kineva-staging-storage-20260925-155839.zip` contiene exactamente
29 objetos, 29 896 551 bytes comprimidos, SHA-256
`94914c127d0754c70619a0c1b73bba811d8be83f9f3f8b688a420620c50a9774`.
El inventario `kineva-staging-storage-20260925-155839-inventory.csv`
tiene SHA-256
`5bcc800bc44fa0ac470c594e0a43199a96e8e94ab1bde78a9c0272dc418f4280`.
Las 29 rutas y tamanos coinciden con `storage.objects`; el ZIP pasa CRC.

| Bucket Kineva | Objetos | Bytes sin comprimir | Acceso |
| --- | ---: | ---: | --- |
| `dubs` | 12 | 851 616 | Privado |
| `images` | 15 | 7 838 513 | Privado |
| `renders` | 2 | 22 951 827 | Privado |
| **Total** | **29** | **31 641 956** | |

Conservar backup, ZIP, inventario y copias de archivos fuera de Git y del
chat. Estos snapshots son del 25 de septiembre: si el origen o el destino
reciben escrituras nuevas, generar un delta o respaldo actualizado antes
del corte. Aun faltan comparacion completa de definiciones SQL, politicas
RLS y ensayo de restauracion selectiva. No se ha importado nada al destino.

## 3. Preparar el esquema y la aplicacion

- Hay 17 migraciones en `supabase/migrations/`: 12 anteriores de Insomnia,
  dos de trabajos y montaje Kineva, una de renovacion de lease y dos de
  privacidad para `shorts-media` y `story-gallery`. En el destino existente,
  ya se ejecutaron
  `bunx supabase migration list --project-ref cexzmelshvbgabihtfvx` y
  `bunx supabase db push --dry-run --skip-vault --project-ref cexzmelshvbgabihtfvx`.
  El historial remoto no tiene entradas y el dry-run enumera las 17.
  El destino ya se respaldo: no hacer un `db push` completo hasta comparar
  definiciones, politicas y orden de las migraciones en un ensayo aislado.
- Verificar tablas, politicas RLS, RPC, triggers y los buckets
  `story-covers`, `user-story-covers`, `story-gallery`,
  `shorts-media` y `kineva-references`. Los buckets actuales de Kineva
  (`dubs`, `images`, `renders`) son privados y no comparten nombre con
  los cuatro de Insomnia; mantener sus objetos y permisos. La nueva
  migracion `20260925160000_story_gallery_privacy.sql` crea la galeria
  privada (limite 10 MB) y sustituye la politica amplia del origen:
  solo puede leerse un objeto con ruta `stories/<story_id>/...` si coincide
  con un registro `story_images.storage_path` en estado `ready` unido a la
  historia. Las 12 rutas antiguas cumplen estas condiciones. La migracion
  `20260925145500_shorts_media_privacy.sql` restringe los videos a episodios
  visibles o propios; las 8 rutas antiguas coinciden con `storage.objects.name`.
  Probar ambas politicas con sesion anonima y dos cuentas antes del corte.
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

Inventario del codigo de la rama, para preparar credenciales sin exponerlas:

| Capacidad | Funciones actuales | Credenciales en el destino |
| --- | --- | --- |
| Texto, chat, traduccion y guion | `generate-narrative`, `generate-novel`, `generate-shorts-series`, `story-chat`, `translate` | Clave de un proveedor de texto elegido y pruebas de formato/modelo; la de Lovable no migra. |
| Imagen y galeria | `illustrate-scene`, `story-gallery` | `NOVITA_API_KEY` para imagenes y una clave de texto para prompts/analisis que hoy usan Lovable. |
| Video legado de Shorts | `shorts-video` | Credencial de un proveedor de video alternativo si se mantiene ese modo; Kineva local usa otra ruta. |
| Voz y transcripcion | `text-to-speech`, `speech-to-text` | Credenciales de servicios TTS/STT a elegir y probar; `ELEVENLABS_API_KEY` figura en Lovable, pero este codigo no la invoca. |
| Motor Kineva | `kineva-video` + worker local | UUID autorizado en `KINEVA_ALLOWED_USER_IDS` y clave `SUPABASE_SERVICE_ROLE_KEY` solo en proceso local del worker. |

Supabase genera `SUPABASE_URL`, clave publica para navegador y clave de
servicio para las funciones/worker. Aun no se ha seleccionado proveedor
sustituto para todos los modos de IA ni colocado claves en el destino.

## 5. Prueba privada antes del cambio de destino

1. Configurar URL, Reference ID y clave publicable de `kineva-staging`
   para una **vista previa local**; mantener el sitio publicado apuntando
   al backend anterior hasta terminar la validacion.
2. Probar registro/inicio de sesion, perfiles, categorias, historias,
   Studio, Shorts, portadas y acceso de otra cuenta. Verificar que los
   registros migrados conservan usuarios y referencias.
3. En Kineva, `start-worker.ps1 -PreflightOnly` paso. La prueba H3 con
   referencia de una persona termino con audio, pero fallo QC por un salto
   de postura y encuadre en el fotograma 10. El Plan Lock del perfil
   TALKING_PRESENTER ignoraba `exact_dialogue`; se corrigio en el nodo
   local y se valido en runtime un plan con el texto hablado exacto.
   La segunda toma de 5,875 s pasa QC temporal y transcripcion de las
   cinco palabras, pero empieza con las piernas y mueve la camara hasta
   el rostro: no cumple el encuadre fijo. La tercera vista previa
   (544x960, sin upscale) ya muestra el rostro en el primer fotograma,
   pero se aleja gradualmente; falla la condicion de camara inmovil y
   el QC senala resolucion inferior a 720 px, esperable en la vista
   previa. Pasar a control visual del primer frame/pose y QC de
   composicion antes de conectar el worker. Al iniciar ComfyUI, usar
   `start-comfy.ps1` para suministrar `llama-server` al planner.
4. Probar dos tomas, montaje, reparacion de una toma y publicacion manual;
   verificar que otra cuenta no ve borradores ni puede firmar sus videos.
   Transcribir y revisar el dialogo audible: el bloqueo del texto en el
   plan no demuestra pronunciacion ni sincronizacion labial.
5. Revisar conteos de tablas y archivos, funciones y secretos. Luego
   cambiar `.env` y `supabase/config.toml` al ID compartido en una revision
   separada, construir, desplegar la app y verificarla de nuevo.

Las claves de servicio, contrasenas de base de datos, exportaciones y secretos
nunca se incluyen en commits ni mensajes de chat.
