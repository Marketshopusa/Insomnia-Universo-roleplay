import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { renderLocalScene } from "@/lib/kinevaLocal";

type Reply = { status?: string; jobId?: string; imageUrl?: string; error?: string; message?: string };
type Invoke = typeof invokeFunctionWithRetry;
const pause = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

/** Asks the PC ComfyUI worker for the still, then waits until that worker finishes it. */
export async function queueComfyStill(
  body: Record<string, unknown>,
  invoke: Invoke,
  wait: (milliseconds: number) => Promise<void> = pause,
): Promise<string> {
  const created = await invoke<Reply>("illustrate-scene", { ...body, engine: "comfy" });
  const jobId = created.data?.jobId;
  if (!jobId) {
    throw new Error(created.data?.message || created.error?.message || "No se pudo enviar la ilustración a ComfyUI.");
  }
  let running = false;
  const started = Date.now();
  while (Date.now() - started < 180000) {
    if (!running && Date.now() - started > 45000) {
      throw new Error("ComfyUI no tomó la ilustración. En esta PC ejecuta start-local-studio.ps1 y deja ComfyUI encendido en 127.0.0.1:8188.");
    }
    await wait(2000);
    const status = await invoke<Reply>("illustrate-scene", { action: "status", jobId });
    if (status.data?.status === "ready" && status.data.imageUrl) return status.data.imageUrl;
    if (status.data?.status === "failed") {
      throw new Error(status.data.message || "ComfyUI no pudo ilustrar la escena.");
    }
    if (status.data?.status === "running") running = true;
  }
  throw new Error("ComfyUI sigue ilustrando. Déjalo encendido y vuelve a pedir la misma escena.");
}

export async function generateSceneImage(
  body: Record<string, unknown>,
  options: {
    renderLocal?: typeof renderLocalScene;
    invoke?: Invoke;
    queueComfy?: ((payload: Record<string, unknown>) => Promise<string | null>) | null;
  } = {},
): Promise<string> {
  const renderLocal = options.renderLocal ?? renderLocalScene;
  const invoke = options.invoke ?? invokeFunctionWithRetry;
  const local = await renderLocal(body);
  if (local) return local;
  const queue = options.queueComfy === undefined
    ? (payload: Record<string, unknown>) => queueComfyStill(payload, invoke)
    : options.queueComfy;
  if (queue) {
    try {
      const queued = await queue(body);
      if (queued) return queued;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/enviar la ilustración/.test(message)) throw error;
    }
  }
  const created = await invoke<Reply>("illustrate-scene", body);
  if (created.data?.imageUrl) return created.data.imageUrl;
  throw new Error(created.data?.message || created.error?.message || "No se pudo ilustrar la escena.");
}
