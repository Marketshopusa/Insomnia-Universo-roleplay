import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  /** base64 encoded audio bytes (no data: prefix) */
  audio: string;
  /** mime type of the audio, e.g. audio/wav */
  mimeType?: string;
  /** ISO-639-1 code, omit to auto-detect */
  language?: string;
}

function base64Decode(b64: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { audio, mimeType, language }: Body = await req.json();
    if (!audio) {
      return new Response(JSON.stringify({ error: "missing_audio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const bytes = base64Decode(audio);
    if (bytes.length < 2048) {
      return new Response(JSON.stringify({ error: "empty_audio" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const type = mimeType || "audio/wav";
    const ext = type.includes("webm")
      ? "webm"
      : type.includes("mp4") || type.includes("m4a")
      ? "mp4"
      : type.includes("mpeg")
      ? "mp3"
      : "wav";

    const form = new FormData();
    form.append("model", "google/gemini-3.5-transcribe");
    form.append("file", new Blob([bytes], { type }), `speech.${ext}`);
    if (language) form.append("language", language);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("STT error:", resp.status, detail);
      return new Response(
        JSON.stringify({ error: "stt_error", detail, status: resp.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    return new Response(JSON.stringify({ text: data.text || "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("speech-to-text error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
