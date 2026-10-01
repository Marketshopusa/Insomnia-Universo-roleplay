export const LOCAL_KINEVA_URL = "http://127.0.0.1:8787";

export type LocalStudioStatus = "ready" | "missing-worker" | "missing-comfy" | "missing-template";

export interface LocalProbe {
  status: LocalStudioStatus;
  ready: boolean;
  template: boolean;
  comfy: boolean;
}

export interface LocalVideo {
  episode: number;
  url: string;
  script?: string;
}

export interface LocalJob {
  id: string;
  state: string;
  current: number;
  total: number;
  videos: LocalVideo[];
  error: string | null;
}

type LoopbackInit = RequestInit & { targetAddressSpace?: "loopback" };
type FetchLike = (input: string, init?: LoopbackInit) => Promise<Response>;

/** Chrome blocks a public HTTPS page from calling http://127.0.0.1 unless the request is marked as loopback. */
export function loopbackInit(init: LoopbackInit = {}): LoopbackInit {
  return { mode: "cors", ...init, targetAddressSpace: "loopback" };
}

export function localVideoSrc(url: string) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return LOCAL_KINEVA_URL + (url.startsWith("/") ? url : `/${url}`);
}

export function clampLocalEpisodes(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(1, Math.round(value)));
}

export async function probeLocalKineva(fetchImpl: FetchLike = fetch): Promise<LocalProbe> {
  try {
    const response = await fetchImpl(`${LOCAL_KINEVA_URL}/health`, loopbackInit());
    const data = await response.json().catch(() => ({})) as { ready?: boolean; template?: boolean; comfy?: boolean };
    const comfy = data.comfy === true;
    const template = data.template === true;
    const ready = response.ok && data.ready === true && comfy && template;
    if (ready) return { status: "ready", ready: true, template, comfy };
    if (!comfy) return { status: "missing-comfy", ready: false, template, comfy };
    return { status: "missing-template", ready: false, template, comfy };
  } catch {
    return { status: "missing-worker", ready: false, template: false, comfy: false };
  }
}

export async function encodeLocalImage(file: File) {
  if (file.size > 10_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Usa una foto PNG, JPEG o WebP de hasta 10 MB.");
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  const parts: string[] = [];
  for (let pos = 0; pos < buffer.length; pos += 0x8000) {
    parts.push(String.fromCharCode(...buffer.subarray(pos, pos + 0x8000)));
  }
  return btoa(parts.join(""));
}

export async function createLocalJob(
  input: { idea: string; image?: string | null; episodes?: number },
  fetchImpl: FetchLike = fetch,
): Promise<LocalJob> {
  const idea = input.idea.trim().slice(0, 1500);
  if (idea.length < 5) throw new Error("Escribe una idea breve de 5 a 1500 caracteres.");
  let response: Response;
  try {
    response = await fetchImpl(`${LOCAL_KINEVA_URL}/jobs`, loopbackInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea,
        image: input.image || null,
        episodes: clampLocalEpisodes(input.episodes ?? 1),
      }),
    }));
  } catch {
    throw new Error("Chrome no dejó conectar con Kineva en esta PC. Si aparece el aviso de loopback, pulsa Permitir y deja el worker en 127.0.0.1:8787.");
  }
  const data = await response.json().catch(() => ({})) as LocalJob & { error?: string };
  if (!response.ok) throw new Error(data.error || "No se pudo comenzar el video en esta PC.");
  return data;
}

export async function fetchLocalJob(id: string, fetchImpl: FetchLike = fetch): Promise<LocalJob> {
  const response = await fetchImpl(`${LOCAL_KINEVA_URL}/jobs/${id}`, loopbackInit());
  const data = await response.json().catch(() => ({})) as LocalJob & { error?: string };
  if (!response.ok) throw new Error(data.error || "No se pudo leer el video local.");
  return data;
}
