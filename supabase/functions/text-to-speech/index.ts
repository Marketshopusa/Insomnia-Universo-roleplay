import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Map app voice keys -> ElevenLabs voice IDs (multilingual capable)
const VOICE_MAP: Record<string, string> = {
  "scarlett-hd": "EXAVITQu4vr4xnSDxMaL", // Sarah - elegant female
  "max-deep": "JBFqnCBsd6RMkjVDRZzb",    // George - deep male
  "luna-sweet": "XrExE9yKIg1WjnnlVkGX",  // Matilda - sweet playful
};

interface Body {
  text: string;
  voice?: string;
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, voice }: Body = await req.json();
    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: "missing_text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

    const voiceId = VOICE_MAP[voice || "scarlett-hd"] || VOICE_MAP["scarlett-hd"];
    const cleaned = stripMarkup(text).slice(0, 2500);

    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleaned,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.4,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!resp.ok) {
      const t = await resp.text();
      console.error("ElevenLabs error:", resp.status, t);
      return new Response(JSON.stringify({ error: "tts_error", detail: t }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = await resp.arrayBuffer();
    const audioContent = base64Encode(new Uint8Array(buf));

    return new Response(JSON.stringify({ audioContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("text-to-speech error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});