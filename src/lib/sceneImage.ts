import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { renderLocalScene } from "@/lib/kinevaLocal";

type Reply = { status?: string; imageUrl?: string; error?: string; message?: string };
type Invoke = typeof invokeFunctionWithRetry;

export async function generateSceneImage(
  body: Record<string, unknown>,
  options: { renderLocal?: typeof renderLocalScene; invoke?: Invoke } = {},
): Promise<string> {
  const renderLocal = options.renderLocal ?? renderLocalScene;
  const invoke = options.invoke ?? invokeFunctionWithRetry;
  const local = await renderLocal(body);
  if (local) return local;
  const created = await invoke<Reply>("illustrate-scene", body);
  if (created.data?.imageUrl) return created.data.imageUrl;
  throw new Error(created.data?.message || created.error?.message || "No se pudo ilustrar la escena.");
}
