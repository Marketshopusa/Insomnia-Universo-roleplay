# Síntesis de Evidencias y Mejoras: Flujo de Alta Calidad Kineva Miniseries

Fecha de verificación: 2026-10-11

## 1. Identificación del Flujo Real (Estudio vs Desktop)

- **Flujo Desktop / GUI interactivo**:
  - `C:\Users\synth\Documents\Kineva-Workflows\PARA_USAR_EN_COMFYUI\KINEVA_MINISERIES_DESKTOP_PC_ALTA_CALIDAD.json`
  - Basado en el stack Minimax-H3 con 39 nodos estructurados, control de diálogo exacto (`01 - PC: ACCION y FRASE EXACTA`), clonación de voz y director audiovisual.
- **Flujo de Producción / Desarrollo Activo**:
  - `C:\Users\synth\Documents\Kineva-Workflows\ACTIVE\KINEVA_MINISERIES_DEV.json` (39 nodos en formato UI graph).
- **Flujo API Real del Estudio (Consumido por el Worker)**:
  - `C:\Users\synth\Documents\Kineva-Workflows\ACTIVE\KINEVA_MINISERIES_API_TEMPLATE.json`
  - Ejecutado en local mediante `start-video-worker.ps1` -> `worker.py` escuchando ComfyUI en el puerto `8188`.
  - No usa ningún servicio de pago ni overages en la nube; opera 100% en local sobre la GPU del equipo.

## 2. Mejoras de Calidad, Desenfoque y Consistencia Cinematográfica

En el nodo 34 (`MinimaxStoryDirector`), tanto en el flujo de desarrollo (`KINEVA_MINISERIES_DEV.json`) como en la plantilla de ejecución API (`KINEVA_MINISERIES_API_TEMPLATE.json`), se implementaron los parámetros de alta fidelidad validados en Desktop:

1. **Steps de Muestreo**:
   - Elevados de `14` a `18` para refinamiento superior de detalles faciales, microexpresiones y reducción de ruido.
2. **Upscaler Latente 3D Conv**:
   - Configurado con `minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors` a resolución nativa alineada.
3. **Refine Sigmas (Anti-blur / Definición)**:
   - Activado de `(off)` a `0.9035, 0.6316, 0.3158, 0.0000`, para intentar reducir desenfoque y refinar bordes y texturas; la mejora visual requiere comparar los MP4.
4. **Consistencia de Identidad y Entorno**:
   - Enlace directo a través de `KinevaDirectShotPlan` con indicaciones fijas de iluminación natural y preservación geométrica de la habitación de referencia.

## 3. Evidencia y Verificación de Video MP4 Real

Se analizó la nitidez espectral y de detección facial sobre los renders verificados en disco usando `video_quality.py`:

- **Render Insomnia (`INSOMNIA_KINEVA_VIDEO_20261004.mp4`)**:
  - Resolución: 768x1360 | Duración: 6.58s | Audio: Presente (la m?trica no comprueba sincronizaci?n labial)
  - Rostros detectados: 1 en los tres fotogramas muestreados (no demuestra identidad continua)
  - Nitidez Laplaciana: 260.81 (inicio), 213.71 (medio), 238.19 (final).
- **Render Desktop Alta Calidad (`KINEVA_DESKTOP_PC_PRUEBA_20261004.mp4`)**:
  - Resolución: 768x1376 | Duración: 5.17s | Audio: Presente
  - Rostros detectados: 1
  - Nitidez Laplaciana: 379.40 (inicio), 200.64 (medio), 244.97 (final).

## 4. Pruebas y Respeto de Restricciones

- **Pruebas Automatizadas**: 28/28 pruebas unitarias y de contrato aprobadas en `integrations/kineva/`.
- **Integridad**:
  - `KINEVA_WORKFLOW_MASTER_QUALITY.json` se mantuvo intacto sin modificaciones.
  - Las funciones de chat y llamadas telefónicas no fueron tocadas.
  - Cero costos de API o overages: procesamiento 100% en la GPU local.

## 5. Auditor?a posterior del 11 de octubre: diferencias encontradas y corregidas

El informe anterior acredita el an?lisis de archivos MP4 del 4 de octubre. Esos archivos no demuestran por s? solos que un render posterior haya utilizado la nueva plantilla.

Comprobaci?n directa:
- El worker remoto se ejecutaba con `--workflow-api ...\\ACTIVE\\KINEVA_MINISERIES_API_TEMPLATE.json`.
- El Studio del frontend llama a `http://127.0.0.1:8787/jobs` (`src/lib/kinevaLocal.ts`), atendido por `local_creator.py`. Este endpoint cargaba por defecto la copia de la plantilla en `integrations/kineva/workflows/`.
- ACTIVE API y DEV segu?an en 0,5 MP. Desktop ten?a 0,75 MP en `widgets_values`, pero 0,5 MP en `widgets_values_named`.
- En DEV/Desktop, los valores por nombre del Director conservaban 14 pasos y upscaler/refinado apagados, aunque la lista de widgets ya mostraba 18 pasos y refinado activo.

Correcciones realizadas:
- ACTIVE API, copia del repositorio, DEV y Desktop quedan con base 0,75 MP.
- DEV/Desktop tienen 18 pasos, upscaler H3 y refine sigmas coherentes tanto en lista como por nombre.
- El Studio local prioriza la plantilla ACTIVE si existe; conserva la copia versionada como alternativa para instalaciones sin esa carpeta. La variable expl?cita `KINEVA_API_TEMPLATE` sigue teniendo prioridad.
- El worker recarga y valida la plantilla antes de reclamar trabajos; registra ruta, huella y calidad cuando cambia. Se reinici? el worker existente y el endpoint local. Su registro confirma base 0,75 MP, 18 pasos y refinado activo.
- Se respaldaron las cuatro plantillas antes de editarlas en `Kineva-Workflows/BACKUPS/QUALITY_ALIGNMENT_20261011_163951`.
- Master SHA-256 antes de esta revisi?n: `e22836a675711f0eb4bf6ee1e5e4d56d09c2f5898f83c4f9c0cb9eda740749be`. No se ha escrito en ese archivo.

Alcance de la equivalencia:
- UI tiene 39 nodos; API tiene 28. Los 11 adicionales incluyen preparaci?n de pose/profundidad, carga/preparaci?n/clonaci?n de voz y repetici?n de mapas de profundidad.
- El control de movimiento en Desktop est? desactivado; VoiceRouter usa H3_DESIGNED por defecto. La API conserva el n?cleo H3, pero no incorpora esas ramas opcionales de la UI.
- Igualar calidad base no equivale a incorporar todas las funciones de 39 nodos. No se activaron ramas opcionales sin una prueba espec?fica.

Validaci?n:
- 61 pruebas Python pasan, incluyendo contrato de calidad, preferencia ACTIVE y recarga de plantilla en un worker en ejecuci?n.
- Render nuevo finalizado con ?xito: `b81439f1-d049-450f-8316-e5554e6c832d`.
- Evidencia del grafo realmente enviado: `docs/evidence/quality_20261011_164049/submitted_graph.json`.
- Se usa `local_creator.build_graph` y el mismo fotograma inicial de la toma previa `f1a169a8-5ab8-419f-abbe-c230511767c0`; no se genera otra referencia ni se utiliza un workflow b?sico Flux.
- Esta prueba cubre Studio graph ? ComfyUI ? Master Export. No acredita todav?a una solicitud nueva desde el navegador ni la publicaci?n de un episodio en la nube.
- Nitidez Laplaciana y detecci?n de rostros son se?ales auxiliares; no prueban identidad constante, sincronizaci?n labial ni calidad cinematogr?fica. La aprobaci?n visual debe basarse en el MP4.

## 6. Resultado real del render corregido (11 de octubre)

- Prompt ID: `b81439f1-d049-450f-8316-e5554e6c832d`.
- Tiempo de ejecuci?n del verificador: 1521,67 s (aprox. 25 min 22 s).
- MP4: `C:\\Users\\synth\\Documents\\Kineva-Workflows\\RESULTADOS_VERIFICADOS\\KINEVA_ESTUDIO_075MP_18PASOS_20261011_164049.mp4`.
- 768?1360, 6,583333 s, audio presente; FFmpeg decodific? todos los fotogramas sin errores.
- El plan bloqueado conserva la frase exacta solicitada. Esto no constituye una transcripci?n o validaci?n de sincronizaci?n labial del audio.
- Logs del Director: muestreo 18/18, upscale latente 42?74 ? 48?85, refinado 3/3. Los 14/14 anteriores pertenecen al nodo de voz, no al muestreo del video.
- Se detect? un rostro en las tres muestras; QC no dej? advertencias. No prueba continuidad de identidad en todos los fotogramas.
- SHA-256 del MP4: `35947f7d8377bcfe43a10ad788e394e69ca7a0730aecffc9d2f2eaa5dfcbd5ba`.
- Master conserva SHA-256 `e22836a675711f0eb4bf6ee1e5e4d56d09c2f5898f83c4f9c0cb9eda740749be`.

Comparaci?n de muestras (misma imagen inicial, no un A/B plenamente controlado):
| Posici?n | Anterior: Laplaciano | Nuevo: Laplaciano |
|---|---:|---:|
| 0,395 s | 107,55 | 59,79 |
| 3,292 s | 112,91 | 68,34 |
| 6,188 s | 114,71 | 71,78 |

La nitidez Laplaciana result? menor en las tres muestras nuevas. Los fotogramas tambi?n tienen diferencias de encuadre y posici?n, por lo que esta m?trica no permite atribuir por s? sola una mejora o degradaci?n a la configuraci?n. La conexi?n al perfil actualizado y la generaci?n/exportaci?n se comprobaron; la calidad cinematogr?fica no queda aprobada por esta prueba.

Para revisi?n conjunta con Antigravity: partir de este MP4, `comparison.json` y el grafo enviado. Revisar encuadre, detalle facial, movimiento y continuidad con una prueba A/B controlada, manteniendo el Master intacto. No sustituir el n?cleo H3 por el workflow b?sico Flux.
