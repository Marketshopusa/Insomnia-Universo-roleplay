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
   - Activado de `(off)` a `0.9035, 0.6316, 0.3158, 0.0000`, eliminando el efecto de desenfoque y mejorando la nitidez de bordes y texturas.
4. **Consistencia de Identidad y Entorno**:
   - Enlace directo a través de `KinevaDirectShotPlan` con indicaciones fijas de iluminación natural y preservación geométrica de la habitación de referencia.

## 3. Evidencia y Verificación de Video MP4 Real

Se analizó la nitidez espectral y de detección facial sobre los renders verificados en disco usando `video_quality.py`:

- **Render Insomnia (`INSOMNIA_KINEVA_VIDEO_20261004.mp4`)**:
  - Resolución: 768x1360 | Duración: 6.58s | Audio: Presente (TTS sincronizado)
  - Rostros detectados: 1 (consistencia continua a lo largo de toda la toma)
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
