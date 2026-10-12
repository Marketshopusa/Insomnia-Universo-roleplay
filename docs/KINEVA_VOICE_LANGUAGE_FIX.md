# Kineva — Voz en español del estudio

Fecha: 2026-10-12

## Problema confirmado

El usuario aprobó la mejora visual del render del 11 de octubre, pero señaló voz sintética y pronunciación tipo spanglish.

El estudio usa H3 para crear una muestra de timbre en `MinimaxStoryVoiceCastingH3`, la conecta por `KinevaVoiceRouter/H3_DESIGNED` y H3 vuelve a generar el diálogo dentro del video. Esto es un modelo neuronal, pero la naturalidad no está garantizada por usarlo.

Se encontraron:
- Texto de referencia en inglés: `The morning train was late again...`.
- `director.render_voice` llamaba a `prompts.build_voice_prompt` sin idioma; el valor por defecto era `English`.
- Caché de voz por nombre, sin invalidación por idioma, texto, voz, semilla o muestreo.

## Cambios aplicados

- API ACTIVE, copia versionada, DEV y Desktop reciben una frase de referencia en español.
- `voice_language_policy.py` obtiene el idioma del diálogo del personaje y prepara el timbre. Para español añade indicaciones de pronunciación latinoamericana y ritmo conversacional; estas instrucciones son una intención, no evidencia de calidad auditiva.
- El generador de la muestra recibe el idioma explícito.
- Caché `voice_v2` con huella de idioma, referencia, voz, identidad, semilla y muestreo. Las referencias antiguas no se seleccionan para la nueva configuración.
- `install_voice_language_fix.py` aplica el cambio con comprobación de la implementación y backup a MinimaxStoryBuilder local.
- `start-comfy.ps1` mantiene el parche del motor sincronizado con el repositorio al iniciarlo.
- ComfyUI se reinició con la cola vacía. El registro de la muestra confirma `language=Spanish` y una clave nueva de caché.

## Validación y alcance

- 67 pruebas Python aprobadas, incluyendo seis del contrato de idioma y caché.
- Prueba de audio: `verify_voice_reference.py` utiliza la misma rama H3 del estudio y la referencia visual del render anterior, pero ejecuta únicamente la creación de timbre y SaveAudio.
- Prompt ID: `f80ed92c-8117-4530-b689-1c418b3987fd`.
- Evidencia: `docs/evidence/voice_es_20261012_034001/`.
- El audio de esta prueba es una muestra de referencia; no es el diálogo final de un video nuevo. Se requiere escucharla y después verificar un MP4 para aprobar voz y sincronización labial.
- Se mantienen 0,75 MP, 18 pasos de video, upscaler y refinado. No se cambiaron chat ni llamadas.
- Master SHA-256: `e22836a675711f0eb4bf6ee1e5e4d56d09c2f5898f83c4f9c0cb9eda740749be`.

## Resultado de la muestra

- Archivo: `KINEVA_VOZ_ESPANOL_20261012_034001.wav`.
- Duración: 5,0 s; PCM de 16 bits, estéreo, 32 kHz.
- Generación del verificador: 319,34 s.
- Decodificación completa aprobada; señal audible comprobada por RMS 0,2028 y pico 0,9837.
- SHA-256: `e78ca077c44374c1cbb70327f14c776224704032ec3ac45aee5ef7ac5711e424`.
- Se comprobó la generación con idioma español y caché nueva. No se aprobó auditivamente la naturalidad ni se comprobó sincronización labial de un MP4 nuevo.
- El resultado sigue siendo la muestra de timbre que condicionará H3, no una sustitución del audio del MP4 ya entregado.
