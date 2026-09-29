import { invokeFunctionWithRetry } from "@/lib/invokeFunction";

type Reply = { jobId?: string; status?: string; imageUrl?: string; error?: string; message?: string };
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function generateSceneImage(body: Record<string, unknown>): Promise<string> {
  const created = await invokeFunctionWithRetry<Reply>("illustrate-scene", body);
  if (created.error || !created.data?.jobId) {
    throw new Error(created.data?.message || created.error?.message || "No se pudo iniciar la imagen.");
  }
  const jobId = created.data.jobId;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await wait(2000);
    const result = await invokeFunctionWithRetry<Reply>("illustrate-scene", { action: "status", jobId });
    if (result.error) throw new Error(result.data?.message || result.error.message);
    if (result.data?.status === "ready" && result.data.imageUrl) return result.data.imageUrl;
    if (result.data?.status === "failed") throw new Error(result.data.message || "Kineva no pudo crear la imagen.");
  }
  throw new Error("La ilustraciÃ³n sigue pendiente. Comprueba que Kineva estÃ© activo e intÃ©ntalo de nuevo.");
}
