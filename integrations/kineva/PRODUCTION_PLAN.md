# Plan de produccion: Insomnia + Kineva

Insomnia es la aplicacion: Studio crea la historia y sus assets; Shorts muestra el
episodio y permite repetir una toma. Kineva es un motor local en Windows y no
recibe claves del navegador. El proyecto Supabase transporta solicitudes,
referencias y resultados. La rama de trabajo es
`feature/kineva-insomnia-integration`; su PR permanece en borrador.

## Contrato del episodio

| Nivel | Dato que se conserva | Estado actual |
| --- | --- | --- |
| Serie | Biblia de personajes, escenario, idioma, imagen de referencia | Studio la guarda; una sola imagen se asocia al primer personaje visible |
| Episodio | Capitulo y direccion visual | Hasta 384 palabras habladas en la vista previa |
| Toma | Texto exacto, orden, imagen, identidad de proyecto | Hasta 32 palabras por toma y 12 tomas por episodio |
| Version | Nuevo intento de una sola toma | Se conserva el video anterior durante la reparacion |
| Publicacion | Video unido con audio y manifiesto | El worker deja el montaje listo tras QC basico de todas las tomas; el creador publica la serie despues de revisarla |

Las series de Kineva se crean sin publicar y solo el dueno las ve en el catalogo por RLS. Lovable reporta `shorts-media` como bucket privado en el origen; la politica SQL de lectura se debe contrastar con el export real. La migracion `20260925145500_shorts_media_privacy.sql` configura el bucket privado en el destino y restringe la firma de URLs al video actual de una serie publicada o a su dueno. Falta probar ambas cuentas despues del despliegue.

El texto hablado se fija despues del planificador y se compara con el plan del
manifiesto antes de subir la toma. Esta comprobacion evita **perdidas de texto en
el plan**; no demuestra que cada palabra sea audible en el video final. El
reconocimiento de voz y una revision humana deben comprobar la pista de audio.

## Puertas de aceptacion

### 1. Conexion de Insomnia (pendiente de migracion controlada)

- Revisar historia de migraciones en el Supabase de Insomnia. Aplicar
  `20260924220000_kineva_render_jobs.sql`,
  `20260924221000_kineva_multishot.sql` y
  `20260925144000_kineva_job_renewal.sql` y
  `20260925145500_shorts_media_privacy.sql` en orden.
- Auditar y adaptar las diez Edge Functions de Insomnia que llaman al gateway
  de IA de Lovable; su clave no se traslada al Supabase propio. Completar
  tambien el bucket `story-gallery` tras examinar el export de Storage.
- Desplegar `generate-novel` y `kineva-video`; habilitar un UUID de creador
  mediante `KINEVA_ALLOWED_USER_IDS`.
- Reiniciar el ComfyUI principal para cargar Plan Lock actualizado. Ejecutar
  `worker.py --preflight` sin clave de servidor; despues iniciar el worker con
  `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo en su proceso local.
- Repetir primero el clip H3 con una referencia de una sola persona y prompt
  coherente; exigir QC sin saltos y revisar identidad y audio antes de conectar.
- Probar en Studio una serie corta con referencia propia, dos tomas, estado en
  Shorts, montaje reproducible y denegacion a otra cuenta. Confirmar que una
  referencia privada de otro usuario no se acepta.
- Comprobar una reparacion: conservar el episodio anterior mientras se genera
  la nueva version y cambiar el video solo al terminar su montaje.

### 2. Continuidad cinematografica (pendiente)

Renderizar dos o tres episodios enlazados con el mismo protagonista, escenario,
vestuario y timbre. Guardar cada salida y su manifiesto. Revisar por toma:
cara/cabello/ropa, fondo, movimiento, continuidad del encuadre, idioma,
pronunciacion, dialogo completo, sincronizacion labial, volumen y cortes. El
actual QC comprueba errores tecnicos y presencia de audio, pero aun no mide
automaticamente identidad, labios o dialogo audible. Corregir una toma y
comparar que el resto del episodio no cambie.

### 3. Escenas y varios personajes (pendiente)

- Convertir cada capitulo narrativo en guion con voces y accion por escena;
  asignar explicitamente personaje y texto a cada toma. Hoy la prueba controlada
  usa una voz principal: la narracion y el dialogo de varios personajes no
  cuentan aun con asignacion fiable.
- Permitir varias referencias de personaje y escenario, identidad persistente,
  vestuario por episodio, voces autorizadas y semillas de movimiento.
- Editar orden y duracion de las tomas desde Insomnia antes del render; ofrecer
  vista previa y aprobacion del creador antes de publicar una serie.

### 4. Operacion sostenida (pendiente)

El worker renueva su lease cada cinco minutos y puede recuperar un lease
vencido tras suspender Windows si nadie reclamo el trabajo. Aun faltan reintentos
con limites, subida reanudable para archivos grandes, presupuesto/reserva de
creditos, metricas de cola, duracion y fallos y revision de derechos de imagen
y voz. Mantener el worker y ComfyUI encendidos para aceptar nuevas solicitudes.

## Estado y limite de esta rama

El clip H3 del DEV termino en la instancia temporal de ComfyUI: 15,08 s,
video H.264, audio AAC y plan bloqueado con el texto exacto solicitado, sin
advertencias del Plan Lock. **No paso QC:** el manifiesto detecto un salto en
el fotograma 14 (0,58 s). La inspeccion muestra un cambio brusco de protagonista
y fondo. La referencia usada contenia varias personas y el prompt pedia una
mujer; se debe repetir con una sola persona y direccion coherente. El worker
rechazaria esta toma por la incidencia. La prueba tampoco transcribe el audio
hablado. La instancia temporal se cerro despues de la prueba. El tiempo de
pared incluyo una noche y no sirve como medida de velocidad de render.

El 25 de septiembre la CLI inicio sesion, pero la cuenta autenticada no lista
`pbormuamewbajnylzfqs` (Lovable Cloud). El propietario propuso un solo
Supabase para Insomnia y Kineva: usar `kineva-staging`
(`cexzmelshvbgabihtfvx`) como destino compartido. Una inspeccion de solo
lectura encontro siete tablas Kineva con datos y ninguna migracion registrada;
el dry-run propone las 16 de Insomnia. Faltan el respaldo de Kineva, la
exportacion de Lovable, la conciliacion de esquemas y usuarios, y el recorrido
conectado Studio -> Supabase -> worker -> Shorts. No se modifica
`KINEVA_WORKFLOW_MASTER_QUALITY.json` hasta que el DEV supere las pruebas
conectadas y la revision visual.
