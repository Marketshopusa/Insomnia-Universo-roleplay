# Recuperación del personaje y galería plegable

## Cambios
- Detectar respuestas vacías dentro del servicio del personaje y repetir la generación automáticamente antes de mostrar un error.
- Mantener el mensaje del usuario disponible si todos los intentos fallan, tanto en chat como en llamada.
- Convertir la galería de la historia en una sección plegable: flecha hacia abajo para abrir y hacia arriba para cerrar.
- Mantener la galería cerrada inicialmente para que no empuje el chat hacia arriba; la generación y sus imágenes seguirán disponibles al abrirla.

## Verificación
- Probar una conversación real y confirmar que una respuesta válida aparece y queda en el historial.
- Verificar en móvil y escritorio que la galería abre, cierra y no ocupa espacio cuando está plegada.
- Confirmar que la aplicación compila sin errores.

## Detalles técnicos
- El servicio de chat tratará una respuesta vacía como un fallo temporal recuperable, no como una respuesta válida.
- El control de la galería tendrá estado local y atributos accesibles para indicar si está abierto o cerrado.
