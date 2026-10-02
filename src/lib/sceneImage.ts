import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { renderLocalScene } from "@/lib/kinevaLocal";

type Reply = { jobId?: string; status?: string; imageUrl?: string; error?: string; message?: string };
type Invoke = typeof invokeFunctionWithRetry;

const defaultWait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateSceneImage(
  body: Record<string, unknown>,
  options: {
    renderLocal?: typeof renderLocalScene;
    invoke?: Invoke;
    wait?: (ms: number) => Promise<unknown>;
    attempts?: number;
  } = {},
): Promise<string> {
  const renderLocal = options.renderLocal ?? renderLocalScene;
  const invoke = options.invoke ?? invokeFunctionWithRetry;
  const wait = options.wait ?? defaultWait;
  const attempts = options.attempts ?? 90;
  const local = await renderLocal(body);
  if (local) return local;
  const created = await invoke<Reply>("illustrate-scene", body);
  if (created.data?.status === "ready" && created.data.imageUrl) return created.data.imageUrl;
  if (created.error || !created.data?.jobId) {
    throw new Error(created.data?.message || created.error?.message || "No se pudo iniciar la imagen en ComfyUI.");
  }
  const jobId = created.data.jobId;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(2000);
    const result = await invoke<Reply>("illustrate-scene", { action: "status", jobId });
    if (result.error) throw new Error(result.data?.message || result.error.message);
    if (result.data?.status === "ready" && result.data.imageUrl) return result.data.imageUrl;
    if (result.data?.status === "failed") throw new Error(result.data.message || "ComfyUI no pudo crear la imagen.");
  }
  throw new Error("ComfyUI no tomó la ilustración. En esta computadora reinicia Kineva con ComfyUI encendido. Desde el teléfono, deja el worker de imágenes corriendo en esa computadora.");
}
