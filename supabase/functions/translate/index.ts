// Translate edge function: translates an array of texts to a target language using Lovable AI Gateway.
// Public function (no JWT required) — declared in supabase/config.toml.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LANG_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish (neutral, natural)",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { texts, targetLang } = await req.json();

    if (!Array.isArray(texts) || texts.length === 0) {
      return new Response(
        JSON.stringify({ translations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const langName = LANG_NAMES[targetLang] || LANG_NAMES.en;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const numbered = texts
      .map((t: string, i: number) => `${i + 1}. ${t ?? ""}`)
      .join("\n");

    const prompt = `Translate the following list of short texts to ${langName}. 
Rules:
- Preserve markdown formatting (*, **, line breaks).
- Keep proper names of characters as-is unless they have a clear equivalent.
- Keep the same numbering and order.
- Output ONLY a JSON array of strings (no prose, no numbering, no markdown fences), one entry per input.

Texts:
${numbered}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a precise translator. Output only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      return new Response(JSON.stringify({ translations: texts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "[]";

    let parsed: string[] = [];
    try {
      const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(match ? match[0] : cleaned);
    } catch (e) {
      console.error("JSON parse failed", e, content);
      parsed = texts;
    }

    // Pad/truncate to match input length
    const translations = texts.map((t: string, i: number) =>
      typeof parsed[i] === "string" && parsed[i].length > 0 ? parsed[i] : t
    );

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});