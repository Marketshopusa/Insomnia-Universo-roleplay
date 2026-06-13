import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const NOVITA_API_KEY = Deno.env.get('NOVITA_API_KEY')
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

// Realistic, permissive (unfiltered) checkpoints hosted on Novita.
// SFW/soft scenes use a high-quality realistic model; explicit roles use an uncensored model.
const REALISTIC_MODEL = 'realisticVisionV60B1_v60B1VAE_190174.safetensors'
const EXPLICIT_MODEL = 'uberRealisticPornMerge_urpmv13.safetensors'

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk))
    }
    return btoa(binary)
  } catch (_e) {
    return null
  }
}

// Turn the long scene text into a compact, vivid SDXL-style visual prompt.
async function buildVisualPrompt(
  sceneText: string,
  focusText: string,
  characterRole: string,
  playerRole: string,
  storyTitle: string,
  storyDescription: string,
  explicit: boolean,
  language: string,
): Promise<string> {
  const fallback = focusText.slice(0, 900) || sceneText.slice(0, 900)
  if (!LOVABLE_API_KEY) return fallback
  try {
    const sys =
      'You convert roleplay context into ONE concise English image-generation prompt (max 110 words). ' +
      'Prioritize the latest roleplay moment over any reference image. Describe the actual action, body positions, facial expressions, clothing changes, setting, lighting, camera angle, and every visible participant. ' +
      'If the player/second character is present or implied, include them clearly. Keep identity consistent but create a NEW composition; do not copy a cover-photo pose, outfit, phone, robe, or background unless the scene explicitly says so. ' +
      'Output ONLY the prompt, comma-separated keywords and short phrases, no quotes, no explanations.' +
      (explicit ? ' Sensual and explicit details are allowed when present in the text.' : '')
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content: `Story title: ${storyTitle || ''}\nPremise: ${storyDescription || ''}\nMain character: ${characterRole || 'the protagonist'}\nPlayer/second character: ${playerRole || 'the player'}\nScene language: ${language}\nLatest moment to illustrate:\n${focusText.slice(0, 1200)}\n\nRecent roleplay context:\n${sceneText.slice(0, 2600)}`,
          },
        ],
      }),
    })
    if (!res.ok) return fallback
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content?.trim()
    return text && text.length > 0 ? text : fallback
  } catch (_e) {
    return fallback
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!NOVITA_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'missing_key', detail: 'NOVITA_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json().catch(() => ({}))
    const sceneText: string = (body?.sceneText || '').toString().trim()
    const focusText: string = (body?.focusText || sceneText).toString().trim()
    const coverImageUrl: string | undefined = body?.coverImageUrl
    const characterRole: string = (body?.characterRole || '').toString()
    const playerRole: string = (body?.playerRole || '').toString()
    const storyTitle: string = (body?.storyTitle || '').toString()
    const storyDescription: string = (body?.storyDescription || '').toString()
    const explicit: boolean = !!body?.explicit
    const language: string = (body?.language || 'es').toString()

    if (!sceneText) {
      return new Response(
        JSON.stringify({ error: 'invalid_input', detail: 'sceneText is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const prompt = await buildVisualPrompt(sceneText, focusText, characterRole, playerRole, storyTitle, storyDescription, explicit, language)
    const styleSuffix =
      ', new scene composition, dynamic pose, scene-accurate clothing, cinematic lighting, highly detailed, 8k, sharp focus, beautiful, romantic atmosphere'
    const negativePrompt =
      'lowres, bad anatomy, bad hands, extra fingers, deformed, blurry, watermark, text, signature, ugly, distorted face, low quality, copied cover photo, same pose, static portrait, unwanted phone, unchanged robe, same outfit, solo when two people are described'

    const imageBase64 = coverImageUrl ? await fetchImageAsBase64(coverImageUrl) : null

    // image-to-image when we have the cover (keeps the character's face),
    // otherwise fall back to txt2img.
    const endpoint = imageBase64
      ? 'https://api.novita.ai/v3/async/img2img'
      : 'https://api.novita.ai/v3/async/txt2img'

    const request: Record<string, unknown> = {
      model_name: explicit ? EXPLICIT_MODEL : REALISTIC_MODEL,
      prompt: prompt + styleSuffix,
      negative_prompt: negativePrompt,
      width: 512,
      height: 768,
      image_num: 1,
      steps: 28,
      seed: -1,
      clip_skip: 1,
      guidance_scale: 7,
      sampler_name: 'DPM++ 2M Karras',
    }
    if (imageBase64) {
      request.image_base64 = imageBase64
      request.strength = 0.82 // use the cover only as loose identity; allow new pose, clothing, setting and action
    }

    const startRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOVITA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        extra: { response_image_type: 'jpeg' },
        request,
      }),
    })

    const startText = await startRes.text()
    if (!startRes.ok) {
      return new Response(
        JSON.stringify({ error: 'novita_error', detail: startText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const startData = JSON.parse(startText)
    const taskId = startData?.task_id
    if (!taskId) {
      return new Response(
        JSON.stringify({ error: 'novita_error', detail: 'No task_id returned' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Poll for the result (image generation is async).
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500))
      const pollRes = await fetch(
        `https://api.novita.ai/v3/async/task-result?task_id=${taskId}`,
        { headers: { Authorization: `Bearer ${NOVITA_API_KEY}` } },
      )
      if (!pollRes.ok) continue
      const pollData = await pollRes.json()
      const status = pollData?.task?.status
      if (status === 'TASK_STATUS_SUCCEED') {
        const url = pollData?.images?.[0]?.image_url
        if (!url) {
          return new Response(
            JSON.stringify({ error: 'novita_error', detail: 'Succeeded but no image' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({ imageUrl: url, prompt }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      if (status === 'TASK_STATUS_FAILED') {
        return new Response(
          JSON.stringify({ error: 'novita_error', detail: pollData?.task?.reason || 'Task failed' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    return new Response(
      JSON.stringify({ error: 'timeout', detail: 'Image generation timed out' }),
      { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'server_error', detail: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})