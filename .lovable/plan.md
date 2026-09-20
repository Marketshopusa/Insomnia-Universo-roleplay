# Corregir la voz entrecortada

## Objetivo
Hacer que la narración y las respuestas de llamada se reproduzcan completas, fluidas y sin pausas microscópicas.

## Cambios
- Reemplazar la reproducción de muchos fragmentos pequeños por una sola pista continua construida con todos los fragmentos recibidos.
- Verificar que la transmisión termine correctamente antes de reproducir; si falta la señal final, mostrar el error real y no reproducir audio incompleto.
- Mantener intacta la voz elegida, el botón de llamada y el resto de la pantalla.
- Evitar que una interrupción voluntaria active otra voz de respaldo.

## Validación
- Probar una respuesta que combine narración y diálogo y comprobar que la duración reproducida coincide con todo el audio recibido.
- Verificar en chat y llamada que la reproducción termina antes de volver a escuchar por el micrófono.
- Confirmar que no haya errores de compilación ni reproducción en el navegador.

## Nota técnica
La causa está en que el navegador está reproduciendo numerosos bloques PCM independientes de apenas milisegundos; las variaciones en la llegada de esos bloques producen huecos y cortes. Una pista PCM única elimina esas uniones y garantiza continuidad.
