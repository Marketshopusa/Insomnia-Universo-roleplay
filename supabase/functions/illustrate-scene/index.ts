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

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function hasAny(source: string, terms: string[]): boolean {
  return terms.some((term) => source.includes(term))
}

function buildActionAnchors(sceneText: string, focusText: string): string {
  const source = normalizeForMatch(`${focusText}\n${sceneText}`)
  const anchors: string[] = []

  if (hasAny(source, ['de rodillas', 'rodilla', 'kneel', 'kneeling', 'on knees'])) {
    anchors.push('female character clearly kneeling on her knees')
  }
  if (hasAny(source, ['boca abierta', 'abrio la boca', 'abre la boca', 'open mouth', 'opened her mouth'])) {
    anchors.push('open mouth clearly visible')
  }
  if (hasAny(source, ['mano', 'manos', 'agarro', 'tomo', 'sujeto', 'sostuvo', 'acaricio', 'hand', 'hands', 'holding', 'grabbing', 'touching'])) {
    anchors.push('hands clearly visible performing the described action')
  }
  if (hasAny(source, ['sexo oral', 'oral', 'chupar', 'lamer', 'mouth on', 'oral sex'])) {
    anchors.push('adult intimate oral-sex pose exactly matching the text')
  }
  if (hasAny(source, ['cama', 'bed'])) anchors.push('bed setting only if described')
  if (hasAny(source, ['pared', 'wall'])) anchors.push('against a wall only if described')
  if (hasAny(source, ['sentada', 'sentado', 'sitting', 'seated'])) anchors.push('seated pose')
  if (hasAny(source, ['acostada', 'acostado', 'recostada', 'recostado', 'lying', 'laying'])) anchors.push('lying or reclining pose')
  if (hasAny(source, ['de pie', 'parada', 'parado', 'standing'])) anchors.push('standing pose')
  if (hasAny(source, ['beso', 'besar', 'kiss', 'kissing'])) anchors.push('kissing or mouth contact exactly as described')

  return anchors.join(', ')
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
  const actionAnchors = buildActionAnchors(sceneText, focusText)
  const fallback = [actionAnchors, focusText.slice(0, 900) || sceneText.slice(0, 900)].filter(Boolean).join(', ')
  if (!LOVABLE_API_KEY) return fallback
  try {
    const sys =
      'You convert roleplay context into ONE concise English image-generation prompt (max 130 words). ' +
      'Translate Spanish faithfully. The LATEST MOMENT is mandatory and must control the image: exact action, body position, hand placement, mouth/facial expression, clothing, setting, and every visible adult participant. ' +
      'If action anchors are provided, include them literally and do not contradict them. If the player/second character is present or implied, include them clearly. ' +
      'Do not invent a wall, phone, object, robe, lying pose, standing pose, or solo portrait unless the latest moment says so. Keep identity consistent through description only; create a NEW composition, not a cover-photo clone. ' +
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
            content: `Story title: ${storyTitle || ''}\nPremise: ${storyDescription || ''}\nMain character: ${characterRole || 'the protagonist'}\nPlayer/second character: ${playerRole || 'the player'}\nScene language: ${language}\nMandatory action anchors: ${actionAnchors || 'follow the latest moment exactly'}\nLatest moment to illustrate:\n${focusText.slice(0, 1400)}\n\nRecent roleplay context:\n${sceneText.slice(0, 2600)}`,
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
      ', exact scene from the latest roleplay message, faithful body positions, faithful hand placement, faithful facial expression, new camera angle, new scene composition, dynamic pose, scene-accurate clothing, cinematic lighting, highly detailed, sharp focus, natural anatomy, proportional limbs'
    const negativePrompt =
      'lowres, bad anatomy, bad hands, bad fingers, extra fingers, missing fingers, fused fingers, extra arms, extra legs, missing limbs, broken limbs, twisted limbs, dislocated joints, elbow from head, arm through face, leg through body, malformed body, deformed, mutated, distorted face, asymmetrical face, blurry, low quality, ugly, watermark, text, signature, copied cover photo, same pose, static portrait, wrong pose, wrong action, wrong setting, invented wall, unwanted phone, random object, unchanged robe, same outfit, solo when two people are described'

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
      steps: 36,
      seed: -1,
      clip_skip: 1,
      guidance_scale: 8.5,
      sampler_name: 'DPM++ 2M Karras',
    }
    if (imageBase64) {
      request.image_base64 = imageBase64
      request.strength = 0.93 // use the cover only as a very loose identity reference; prioritize the roleplay action
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