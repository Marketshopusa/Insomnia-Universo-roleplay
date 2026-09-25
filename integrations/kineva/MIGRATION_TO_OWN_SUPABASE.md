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
  Shorts y 9 episodios visibles mediante acceso publico. Lovable reporta 12
  tablas de Insomnia. Pueden existir usuarios y borradores adicionales.
  Cambiar solamente las variables VITE_ no traslada los datos; la app sigue
  usando el origen hasta el corte.

## 2. Conservar datos si existen

En Lovable: More -> Cloud -> Overview -> Advanced settings ->
Export project data -> Database -> Export. El paquete incluye estructura,
datos y usuarios con hashes de contrasena segun la documentacion oficial;
verificar que el archivo real incluya Auth. Lovable reporta cuatro buckets
con 33 objetos: `shorts-media` (8), `story-covers` (5),
`story-gallery` (12) y `user-story-covers` (8). Solicitar ZIP de
objetos conservando bucket/ruta y CSV de inventario, y descargarlos aparte
de la base. Mantener respaldos fuera de git, Cursor chat y el frontend. No
eliminar Lovable Cloud durante la transicion.

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
  `story-covers`, `user-story-covers`, `story-gallery`,
  `shorts-media` y `kineva-references`. El repositorio contiene una
  politica para `story-gallery`, pero ninguna migracion crea ese bucket;
  completar su definicion tras revisar el export e inventario reales.
  La ultima migracion crea `shorts-media` como privado y limita la firma
  de URLs al video actual visible. Lovable reporta ese bucket como privado
  en el origen; verificar su politica SELECT del esquema real.
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
