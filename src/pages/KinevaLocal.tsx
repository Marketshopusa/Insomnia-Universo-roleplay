import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const API = "http://127.0.0.1:8787";
type Video = { episode: number; url: string; script?: string };
type Job = { id: string; state: string; current: number; total: number;
  videos: Video[]; error: string | null };
async function encodeImage(file: File) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const parts: string[] = [];
  for (let pos = 0; pos < buffer.length; pos += 0x8000)
    parts.push(String.fromCharCode(...buffer.subarray(pos, pos + 0x8000)));
  return btoa(parts.join(""));
}
export default function KinevaLocal() {
  const [idea, setIdea] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [episodes, setEpisodes] = useState(1);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const check = () => fetch(API + "/health")
      .then(async (r) => setReady(r.ok && (await r.json()).ready))
      .catch(() => setReady(false));
    void check();
    const timer = window.setInterval(check, 5000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!job || ["completed", "failed"].includes(job.state)) return;
    const timer = window.setInterval(async () => {
      try {
        const r = await fetch(API + "/jobs/" + job.id);
        if (r.ok) setJob(await r.json() as Job);
      } catch { setError("Se perdio la conexion con Kineva local."); }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.state]);
  async function create() {
    if (!image || idea.trim().length < 5) {
      setError("Sube una foto y describe lo que quieres que pase."); return;
    }
    if (image.size > 10_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(image.type)) {
      setError("Usa una foto PNG, JPEG o WebP de hasta 10 MB."); return;
    }
    setBusy(true); setError("");
    try {
      const r = await fetch(API + "/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), image: await encodeImage(image), episodes }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "No se pudo comenzar el video.");
      setJob(data as Job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No hay conexion con Kineva local.");
    } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
    <Link to="/studio" className="text-sm underline">Estudio Insomnia</Link>
    <header><h1 className="text-3xl font-semibold">Crear con Kineva</h1>
      <p className="mt-2 text-muted-foreground">
        Sube una foto y escribe tu idea. La IA prepara el plan visual y genera el video en esta PC.
      </p></header>
    <Card className="space-y-5 p-6">
      <div className="space-y-2"><Label htmlFor="k-photo">Foto inicial</Label>
        <input id="k-photo" type="file" accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setImage(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
      </div>
      <div className="space-y-2"><Label htmlFor="k-idea">Tu idea</Label>
        <Textarea id="k-idea" value={idea} onChange={(e) => setIdea(e.target.value)}
          placeholder="Me levanto de la cama y me pongo a bailar." className="min-h-24" />
      </div>
      <div className="space-y-2"><Label htmlFor="k-episodes">Cantidad</Label>
        <select id="k-episodes" value={episodes}
          onChange={(e) => setEpisodes(Number(e.target.value))}
          className="block rounded-md border bg-background p-2">
          <option value={1}>Un video</option>
          <option value={2}>Miniserie de 2 episodios</option>
          <option value={3}>Miniserie de 3 episodios</option>
        </select>
      </div>
      <Button onClick={create} disabled={busy || !ready || !!job && ["queued","rendering"].includes(job.state)}>
        {busy ? "Enviando..." : "Crear video"}</Button>
      {!ready && <p role="status" className="text-sm text-amber-600">
        Inicia Kineva local y ComfyUI en esta PC.</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </Card>
    {job && <Card className="space-y-4 p-6">
      <h2 className="text-lg font-medium">Resultado</h2>
      <p role="status">{job.state === "queued" ? "En cola..." :
        job.state === "rendering" ? "Creando video " + job.current + " de " + job.total + "..." :
        job.state === "failed" ? "Error: " + job.error : "Video listo."}</p>
      {job.videos.map((v) => <div key={v.url}><h3>Episodio {v.episode}</h3>
        {v.script && <details className="mt-2"><summary>Guion generado</summary><p className="whitespace-pre-line">{v.script}</p></details>}
        <video controls className="mt-2 w-full rounded-md" src={API + v.url} />
        <a className="mt-2 inline-block text-sm underline"
          href={API + v.url} download>Descargar video</a>
      </div>)}
    </Card>}
  </main>;
}
