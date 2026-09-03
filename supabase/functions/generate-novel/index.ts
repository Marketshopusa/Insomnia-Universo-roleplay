const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const body = await req.json();
    const idea: string = (body.description ?? "").toString().slice(0, 4000);
    if (idea.trim().length < 10) {
      return new Response(JSON.stringify({ error: "description_too_short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const chapters = Math.min(Math.max(Number(body.chapterCount ?? 7), 3), 20);
    const language: string = (body.language ?? "Spanish").toString();
    const creativity: string = (body.creativity ?? "balanced").toString();
    const sfw: boolean = !!body.isSafeForWork;

    const tempMap: Record<string, number> = {
      conservative: 0.5,
      balanced: 0.8,
      creative: 1.0,
      wild: 1.2,
    };

    const system = `Eres un novelista profesional y showrunner. Escribes en ${language}.
Tu salida DEBE ser JSON valido, sin texto extra, con esta forma exacta:
{
  "title": "...",
  "logline": "...",
  "characters": [
    {"name":"...","age":"...","role":"...","appearance":"descripcion fisica MUY detallada y fija: etnia, altura, complexion, color y corte de pelo, color de ojos, rasgos faciales, marcas distintivas","wardrobe":"vestuario base recurrente","personality":"...","voice":"forma de hablar","visual_prompt":"prompt en INGLES, una sola linea, para generar SIEMPRE al mismo personaje de forma identica"}
  ],
  "setting": {"place":"...","time":"...","visual_style":"prompt en INGLES de estilo visual, paleta e iluminacion, consistente para toda la serie"},
  "outline": "resumen por capitulos en markdown",
  "chapters": [
    {"number":1,"title":"...","summary":"...","characters_present":["..."],"content":"texto completo del capitulo","video_prompt":"prompt tecnico 9:16 que reutiliza literalmente las descripciones visuales de los personajes presentes y el visual_style; todo dialogo, narracion, subtitulo y texto visible debe estar en ${language}"}
  ]
}
REGLAS DE PERSISTENCIA (criticas):
- Define los personajes UNA vez y no cambies jamas su apariencia, edad, nombre ni vestuario base.
- Cada "video_prompt" debe repetir textualmente el "visual_prompt" de cada personaje que aparece, para que el generador de video no los altere.
- El titulo, logline, outline, titulos de capitulos, contenido, narracion y dialogos deben estar completamente en ${language}.
- Aunque las instrucciones visuales tecnicas esten en ingles, toda voz, conversacion, subtitulo o texto perceptible del short debe estar en ${language}.
- Todos los personajes son adultos de 25+ anios.
${sfw ? "- Contenido apto para el trabajo: sin sexo ni desnudez." : "- Tono sensual y adulto sugerente, sin describir actos sexuales explicitos ni desnudez."}
- Cada capitulo: 4-6 parrafos con dialogo entre comillas.
- Exactamente ${chapters} capitulos numerados y conectados.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        temperature: tempMap[creativity] ?? 0.8,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Idea del usuario:\n${idea}\n\nGenera la novela completa con ${chapters} capitulos.` },
        ],
      }),
    });

    if (aiRes.status === 429 || aiRes.status === 402) {
      return new Response(JSON.stringify({ error: aiRes.status === 429 ? "rate_limited" : "credits_exhausted" }), {
        status: aiRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error("ai error", aiRes.status, detail);
      return new Response(JSON.stringify({ error: "ai_error", detail }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiRes.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("La IA no devolvio un proyecto valido");
    const novel = JSON.parse(match[0]);

    return new Response(JSON.stringify({ novel }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-novel error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
