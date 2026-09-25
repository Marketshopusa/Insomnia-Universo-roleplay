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

Las series de Kineva se crean sin publicar y solo el dueno las ve en el catalogo por RLS. El backup confirma que `shorts-media` es privado en el origen, aunque su antigua politica SQL permite SELECT de todos los objetos. La migracion `20260925145500_shorts_media_privacy.sql` configura el bucket privado en el destino y restringe la lectura al video actual de una serie publicada o a su dueno. Las 8 rutas `video_url` originales coinciden con los 8 objetos del bucket. Falta probar ambas cuentas despues del despliegue.

El texto hablado se fija despues del planificador y se compara con el plan del
manifiesto antes de subir la toma. Esta comprobacion evita **perdidas de texto en
el plan**; no demuestra que cada palabra sea audible en el video final. El
reconocimiento de voz y una revision humana deben comprobar la pista de audio.

### Encuadre y habla antes de aceptar una toma

El QC actual detecta fallos tecnicos, ausencia de audio y saltos bruscos,
pero **no detecta un movimiento de camara continuo que cambie el encuadre
respecto a la referencia**. El segundo render lo demuestra: `qc.issues=[]`
aun cuando la toma arranca en los pies. La tercera vista previa parte
del rostro, pero se aleja durante la toma sin generar un corte temporal.
Para TALKING_PRESENTER y tomas
marcadas con camara fija, revisar al menos el primer fotograma, la
primera mitad de segundo y el final frente a la imagen de referencia;
exigir que el rostro/torso esten visibles desde el comienzo y que
fondo, ropa y posicion permanezcan coherentes. Antes de automatizar esa
puerta, medir similitud de composicion y presencia del personaje sobre
tomas aprobadas y fallidas, con revision humana de los casos dudosos.

Una transcripcion local puede detectar dialogo omitido o instrucciones
visuales habladas, como ocurrio en la primera toma. Guardar evidencia
de texto planeado, audio transcrito y escucha humana para confirmar
idioma, timbre, pronunciacion y labios. El worker aun solo comprueba
que el texto del plan coincida y que exista audio; el creador debe
revisar el borrador antes de publicarlo.

## Puertas de aceptacion

### 1. Conexion de Insomnia (pendiente de migracion controlada)

- Ya se verificaron copias de base y Storage del Supabase compartido
  `kineva-staging`: 7 tablas Kineva, 0 usuarios Auth, 3 buckets y 29
  objetos. Insomnia tiene 12 tablas, 2 usuarios Auth y 33 objetos en otros
  4 buckets. Hay un correo compartido entre el usuario Kineva heredado de
  ID entero y un usuario Auth UUID; mapear identidades y comprobar accesos.
  Auditar definiciones SQL, RLS, triggers y las 17 migraciones enumeradas
  por el dry-run, que no comprueba compatibilidad del contenido SQL.
  Preparar las tablas de Insomnia de forma selectiva; aplicar en orden
  `20260924220000_kineva_render_jobs.sql`,
  `20260924221000_kineva_multishot.sql`,
  `20260925144000_kineva_job_renewal.sql`,
  `20260925145500_shorts_media_privacy.sql` y
  `20260925160000_story_gallery_privacy.sql` solo tras validar el esquema
  anterior y las politicas. No ejecutar `db push` completo en el destino
  que ya tiene datos Kineva.
- Auditar y adaptar las diez Edge Functions de Insomnia que llaman al gateway
  de IA de Lovable; su clave no se traslada al Supabase propio. La nueva
  migracion crea `story-gallery` privado y exige imagen `ready` vinculada
  a una historia visible. Las 12 rutas del backup cumplen la condicion;
  probar SELECT anonimo, propio y ajeno despues de subirlas.
- Desplegar `generate-novel` y `kineva-video`; habilitar un UUID de creador
  mediante `KINEVA_ALLOWED_USER_IDS`.
- El ComfyUI principal en 8188 se reinicio el 25 de septiembre: Plan Lock
  actualizado y `start-worker.ps1 -PreflightOnly` pasaron. El nuevo
  `start-comfy.ps1` fija `MSB_LLAMA_SERVER` al ejecutable local del planner;
  el preflight del worker no lo comprueba. Despues de validar la toma DEV,
  iniciar el worker con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo
  en su proceso local.
- La primera prueba H3 de una persona fallo QC en el fotograma 10 y
  leyo instrucciones visuales en voz alta. Plan Lock ignoraba
  `exact_dialogue`; se corrigio y la segunda toma de 5,875 s produjo
  exactamente el dialogo solicitado segun una transcripcion local.
  Esa segunda toma pasa QC temporal, pero hace un barrido desde las
  piernas al rostro pese a pedir camara fija. La tercera vista previa
  sin upscale empieza con el rostro visible, pero se aleja durante
  la toma; su QC tambien senala la resolucion 544x960, esperada
  para esta prueba. Ya no basta con afinar el prompt: exigir control
  de primer frame/pose y QC de composicion antes de conectar el
  worker a trabajos reales.
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

El 25 de septiembre se reinicio ComfyUI principal y el preflight local del
worker paso. La prueba H3 con referencia de una persona termino con video
H.264/AAC de 15,083 s (768x1360, 24 fps), pero **fallo QC**: un salto
de postura y encuadre en el fotograma 10 (0,417 s; puntuacion 0,227979
sobre umbral 0,18). El manifiesto tambien mostraba el texto descriptivo
completo como dialogo, pese a pedir cinco palabras en `exact_dialogue`.
El worker la habria rechazado por cualquiera de ambos motivos.

Se corrigio KinevaPlanLock en el nodo local: TALKING_PRESENTER requiere un
dialogo exacto y una toma con personaje visible, conserva la camara fija
y bloquea cortes. Se agrego el texto hablado al workflow
`KINEVA_MINISERIES_DEV.json`. Tras reiniciar ComfyUI, una prueba runtime
de plan sin render confirmo 1 toma y 5 palabras exactas, sin advertencias.
El segundo render DEV produjo 5,875 s de video H.264/AAC (768x1360,
24 fps). El manifiesto tiene `qc.issues=[]` y salto temporal maximo
0,081742 (<0,18); una transcripcion local con faster-whisper-small
obtuvo solo las cinco palabras solicitadas. Sin embargo, la revision de
12 fotogramas muestra un barrido ascendente desde las piernas hasta
el rostro durante los tres primeros segundos. La referencia empieza
con rostro y torso de una mujer sentada ante el muro; la toma no
cumple la camara fija y no esta aceptada. La tercera prueba de vista previa (544x960, 5,875 s)
consiguio rostro y torso visibles desde el primer fotograma, pero
aleja el encuadre progresivamente hacia las piernas. El QC marca
solo la baja resolucion intencional; no detecta el reencuadre suave.
Ninguna de estas tomas supera la revision visual de camara fija.
El siguiente paso es anclar el primer frame o la pose con una
referencia de movimiento y agregar comprobaciones de composicion;
no promover el DEV por un QC temporal limpio. Los prompts API,
manifiestos y trazas estan fuera de Git bajo
`Kineva-Workflows/ACTIVE/DEV_TESTS/`. El worker conectado no se inicio.
El archivo Master Quality conserva su hash de referencia.

El propietario eligio un solo Supabase, `kineva-staging`
(`cexzmelshvbgabihtfvx`), para Insomnia principal y Kineva como motor.
Se recibieron y verificaron el backup PostgreSQL custom de Lovable y
33 archivos de Storage (49 033 175 bytes). La copia de la base de Kineva
tambien esta verificada (388 621 bytes; SHA-256
`7704375a385576f85f93ac701fd67bf6aac1009c4bab4582f3de46031477de18`);
sus 29 archivos de Storage (31 641 956 bytes) estan respaldados aparte.
Ambas copias e inventarios siguen en Descargas y fuera de Git. El destino
tiene 0 usuarios Auth, pero el usuario heredado `public.users` comparte
un correo con un usuario Auth de Insomnia; requiere mapeo explicito.
Faltan el ensayo de migracion selectiva, la sustitucion del gateway de IA
de Lovable y las pruebas conectadas Studio -> Supabase -> worker -> Shorts.
No se ha escrito en Supabase ni modificado
`KINEVA_WORKFLOW_MASTER_QUALITY.json`.
