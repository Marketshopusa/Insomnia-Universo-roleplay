import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Map app voice keys -> Gemini prebuilt voices (stable, never randomized)
const VOICE_MAP: Record<string, string> = {
  "scarlett-hd": "Aoede", // warm, breezy female
  "luna-sweet": "Leda", // youthful, sweet female
  "aria-calm": "Kore", // calm, elegant female
  "max-deep": "Charon", // deep male
  "leo-warm": "Puck", // warm, close male
};

interface Body {
  text: string;
  voice?: string;
  /** Optional tone/style instruction, e.g. "susurro íntimo y sereno" */
  style?: string;
  /** stream raw PCM over SSE for instant playback */
  stream?: boolean;
}

function stripMarkup(s: string) {
  return s
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_/g, "")
    .replace(/#+\s/g, "")
    .replace(/`+/g, "")
    .trim();
}

function base64Encode(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, voice, style, stream }: Body = await req.json();
    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: "missing_text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const voiceName = VOICE_MAP[voice || "scarlett-hd"] || voice || "Aoede";
    const cleaned = stripMarkup(text);
    const tone =
      style ||
      "con voz cálida, suave y serena, tono íntimo y sensual, ritmo natural";
    const speechText = [
      `Lee en voz alta el texto completo, palabra por palabra, ${tone}.`,
      "Debes pronunciar tanto la narración y las acciones como el diálogo entre comillas.",
      "No omitas, resumas ni conviertas ninguna parte en una indicación silenciosa.",
      `TEXTO COMPLETO:\n${cleaned}`,
    ].join(" ");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-tts-preview",
        ...(stream ? { stream_format: "sse" } : {}),
        contents: [
          {
            role: "user",
            parts: [{ text: speechText }],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
        },
      }),
    });

    if (stream && resp.ok && resp.body) {
      return new Response(resp.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }

    if (!resp.ok) {
      const t = await resp.text();
      console.error("Gemini TTS error:", resp.status, t);
      return new Response(
        JSON.stringify({ error: "tts_error", fallback: true, detail: t }),
        {
          // 200 so the client can gracefully fall back to browser TTS
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const buf = await resp.arrayBuffer();
    const audioContent = base64Encode(buf);

    return new Response(
      JSON.stringify({ audioContent, mimeType: "audio/wav" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("text-to-speech error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
