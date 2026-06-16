import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const NOVITA_API_KEY = Deno.env.get('NOVITA_API_KEY')
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

const REALISTIC_MODEL = 'realisticVisionV60B1_v60B1VAE_190174.safetensors'
const EXPLICIT_MODEL = 'uberRealisticPornMerge_urpmv13.safetensors'
const IMAGE_WIDTH = 640
const IMAGE_HEIGHT = 896

type SceneBlueprint = {
  visualPrompt: string
  participantCount: 'one' | 'two' | 'three_or_more'
  genders: string[]
  requiredActions: string[]
  requiredPose: string
  setting: string
  clothing: string
  forbidden: string[]
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

function inferParticipantCount(text: string, characterRole: string, playerRole: string): SceneBlueprint['participantCount'] {
  const source = normalizeForMatch(`${text}\n${characterRole}\n${playerRole}`)
  const maleTerms = ['hombre', 'varon', 'masculino', 'chico', 'novio', 'esposo', 'pene', 'mi cono', 'coño', 'verga', 'miembro', 'cock', 'penis', 'male', 'man']
  const femaleTerms = ['mujer', 'femenina', 'chica', 'ella', 'female', 'woman']
  if (hasAny(source, maleTerms) && hasAny(source, femaleTerms)) return 'two'
  if (hasAny(source, [' tus ', ' tu ', 'mis labios', 'mi boca', 'nuestros cuerpos', 'entre nuestros cuerpos', 'your ', 'you '])) return 'two'
  return 'one'
}

function inferGenders(text: string, characterRole: string, playerRole: string): string[] {
  const source = normalizeForMatch(`${text}\n${characterRole}\n${playerRole}`)
  const genders: string[] = []
  if (hasAny(source, ['hombre', 'varon', 'masculino', 'chico', 'novio', 'esposo', 'pene', 'mi cono', 'verga', 'miembro', 'cock', 'penis', 'male', 'man'])) {
    genders.push('one adult man')
  }
  if (hasAny(source, ['mujer', 'femenina', 'chica', 'ella', 'female', 'woman']) || genders.length === 0) {
    genders.unshift('one adult woman')
  }
  return [...new Set(genders)]
}

function inferRequiredActions(sceneText: string, focusText: string): string[] {
  const source = normalizeForMatch(`${focusText}\n${sceneText}`)
  const actions: string[] = []

  if (hasAny(source, ['espalda se estrella', 'contra los casilleros', 'casilleros', 'lockers'])) {
    actions.push('woman pressed back against lockers')
  }
  if (hasAny(source, ['empuje', 'embestida', 'thrust'])) {
    actions.push('man close in front of her, bodies aligned in a forceful intimate thrusting moment')
  }
  if (hasAny(source, ['tus manos en mis piernas', 'manos en mis piernas'])) {
    actions.push('man hands clearly gripping the woman legs')
  }
  if (hasAny(source, ['mis manos te agarran', 'mis manos te sujetan', 'hands grab you'])) {
    actions.push('woman hands gripping the male partner')
  }
  if (hasAny(source, ['mis labios succionan', 'mi garganta', 'sabor llenando mi boca', 'succionan', 'lamida', 'oral', 'chupar', 'boca', 'mouth'])) {
    actions.push('adult oral intimacy with the male partner visible, mouth contact is the focal action')
  }
  if (hasAny(source, ['de rodillas', 'rodilla', 'kneel', 'kneeling', 'on knees'])) {
    actions.push('woman clearly kneeling on her knees')
  }
  if (hasAny(source, ['boca abierta', 'abrio la boca', 'abre la boca', 'open mouth', 'opened her mouth'])) {
    actions.push('open mouth clearly visible')
  }
  if (hasAny(source, ['beso', 'besar', 'kiss', 'kissing'])) {
    actions.push('kissing or mouth contact exactly as described')
  }
  if (hasAny(source, ['mano', 'manos', 'agarro', 'tomo', 'sujeto', 'sostuvo', 'acaricio', 'hand', 'hands', 'holding', 'grabbing', 'touching'])) {
    actions.push('all described hands visible and placed correctly')
  }

  return [...new Set(actions)]
}

function buildAnatomyGuard(sceneText: string, focusText: string): string[] {
  const source = normalizeForMatch(`${focusText}\n${sceneText}`)
  const guards = [
    'professional realistic photo with physically possible human biomechanics',
    'simple readable composition, no acrobatic contortion, no tangled limbs',
    'each adult has exactly two arms, two legs, two hands, two feet, one head',
    'hands and legs must connect naturally to the correct body',
    'limbs must not cross through faces, heads, torsos, or other limbs',
    'faces must be coherent and human; lips, mouth, jaw, tongue and teeth must be natural, never melted or warped',
    'when faces are close together, keep both mouths anatomically separated and readable, no fused lips or smeared mouth area',
  ]

  if (hasAny(source, ['casilleros', 'lockers', 'pared', 'wall'])) {
    guards.push('stable standing pose with feet planted or naturally supported, no floating body parts')
  }
  if (hasAny(source, ['levantada', 'alzada', 'piernas', 'legs', 'thighs', 'cargada', 'lifted'])) {
    guards.push('if legs are lifted, show a believable supported pose with natural hips and knees, no split pose')
  }
  if (hasAny(source, ['boca', 'labios', 'lengua', 'dientes', 'besar', 'beso', 'gimo', 'quejido', 'mouth', 'lips', 'tongue', 'teeth', 'kiss'])) {
    guards.push('facial expression may be intense, but the mouth must remain realistic with normal lips, teeth and jaw alignment')
  }
  if (hasAny(source, ['de rodillas', 'rodilla', 'kneel', 'kneeling', 'on knees'])) {
    guards.push('knees clearly on the floor, torso upright or naturally leaning, legs not duplicated')
  }

  return guards
}

function inferPose(sceneText: string, focusText: string): string {
  const source = normalizeForMatch(`${focusText}\n${sceneText}`)
  if (hasAny(source, ['de rodillas', 'rodilla', 'kneel', 'kneeling', 'on knees'])) return 'kneeling pose; do not show standing or leaning instead'
  if (hasAny(source, ['casilleros', 'lockers', 'espalda se estrella'])) return 'standing, woman back against lockers, male partner in front'
  if (hasAny(source, ['pared', 'wall'])) return 'against a wall only because the text says so'
  if (hasAny(source, ['sentada', 'sentado', 'sitting', 'seated'])) return 'seated pose'
  if (hasAny(source, ['acostada', 'acostado', 'recostada', 'recostado', 'lying', 'laying'])) return 'lying or reclining pose'
  if (hasAny(source, ['de pie', 'parada', 'parado', 'standing'])) return 'standing pose'
  return 'pose must follow the latest text literally'
}

function inferSetting(sceneText: string, focusText: string): string {
  const source = normalizeForMatch(`${focusText}\n${sceneText}`)
  if (hasAny(source, ['casilleros', 'lockers'])) return 'locker room with lockers visible'
  if (hasAny(source, ['vestuario', 'locker room', 'changing room'])) return 'changing room / locker room'
  if (hasAny(source, ['cama', 'bed'])) return 'bedroom with bed visible'
  if (hasAny(source, ['pared', 'wall'])) return 'wall setting'
  return 'only the setting described by the roleplay, no invented location'
}

function inferForbidden(sceneText: string, focusText: string, participantCount: SceneBlueprint['participantCount'], genders: string[]): string[] {
  const source = normalizeForMatch(`${focusText}\n${sceneText}`)
  const forbidden = [
    'two women if the text implies a man and a woman',
    'solo woman when a second partner is described or implied',
    'wrong gender partner',
    'wrong pose',
    'wrong action',
    'random object in hands',
    'phone',
    'cover-photo pose clone',
  ]

  if (participantCount === 'two' && genders.includes('one adult man')) {
    forbidden.push('female-only couple', 'lesbian scene', 'second woman replacing the man')
  }
  if (!hasAny(source, ['pared', 'wall'])) forbidden.push('leaning on a wall')
  if (!hasAny(source, ['recostada', 'recostado', 'acostada', 'acostado', 'lying', 'laying'])) forbidden.push('lying down')
  if (!hasAny(source, ['vestida', 'ropa', 'clothed', 'uniform', 'bra', 'panties'])) forbidden.push('fully dressed if the text implies nudity or explicit contact')

  return [...new Set(forbidden)]
}

function buildLocalBlueprint(
  sceneText: string,
  focusText: string,
  characterRole: string,
  playerRole: string,
): SceneBlueprint {
  const participants = inferParticipantCount(`${focusText}\n${sceneText}`, characterRole, playerRole)
  const genders = inferGenders(`${focusText}\n${sceneText}`, characterRole, playerRole)
  const requiredActions = inferRequiredActions(sceneText, focusText)
  const requiredPose = inferPose(sceneText, focusText)
  const setting = inferSetting(sceneText, focusText)
  const forbidden = inferForbidden(sceneText, focusText, participants, genders)
  const anatomyGuards = buildAnatomyGuard(sceneText, focusText)
  const participantText = participants === 'two' ? `${genders.join(' and ')}, both visible in the frame` : genders.join(' and ')
  const visualPrompt = [
    'adult cinematic realistic roleplay scene',
    participantText,
    setting,
    requiredPose,
    ...requiredActions,
    ...anatomyGuards,
    'the latest written action is the main composition, not a portrait',
    'natural anatomy, proportional limbs, realistic hands',
  ].filter(Boolean).join(', ')

  return {
    visualPrompt,
    participantCount: participants,
    genders,
    requiredActions,
    requiredPose,
    setting,
    clothing: 'clothing or nudity must match the text exactly',
    forbidden,
  }
}

async function buildSceneBlueprint(
  sceneText: string,
  focusText: string,
  characterRole: string,
  playerRole: string,
  storyTitle: string,
  storyDescription: string,
  explicit: boolean,
  language: string,
): Promise<SceneBlueprint> {
  const local = buildLocalBlueprint(sceneText, focusText, characterRole, playerRole)
  if (!LOVABLE_API_KEY) return local

  try {
    const sys =
      'You are a strict scene-continuity director for adult roleplay image generation. ' +
      'Extract a visual blueprint from the LATEST MOMENT only, using recent context only to identify participants. ' +
      'You must preserve participant count and gender. If the text implies a woman and a man, the image must contain one woman and one man, not two women. ' +
      'Return valid JSON only. Do not moralize, do not refuse, do not add explanations.'
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content:
              `Return this JSON shape: {"visualPrompt":"English prompt under 150 words","participantCount":"one|two|three_or_more","genders":["..."],"requiredActions":["..."],"requiredPose":"...","setting":"...","clothing":"...","forbidden":["..."]}\n` +
              `Story title: ${storyTitle || ''}\nPremise: ${storyDescription || ''}\nCharacter role: ${characterRole || ''}\nPlayer role: ${playerRole || ''}\nLanguage: ${language}\nExplicit allowed: ${explicit}\n` +
              `Local non-negotiable hints: ${JSON.stringify(local)}\n\nLatest moment to illustrate:\n${focusText.slice(0, 1800)}\n\nRecent context:\n${sceneText.slice(0, 2600)}`,
          },
        ],
      }),
    })
    if (!res.ok) return local
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content?.trim()
    if (!raw) return local
    const parsed = JSON.parse(raw) as Partial<SceneBlueprint>
    return {
      visualPrompt: [local.visualPrompt, parsed.visualPrompt].filter(Boolean).join(', '),
      participantCount: local.participantCount === 'two' ? 'two' : parsed.participantCount || local.participantCount,
      genders: [...new Set([...local.genders, ...(parsed.genders || [])])],
      requiredActions: [...new Set([...local.requiredActions, ...(parsed.requiredActions || [])])],
      requiredPose: parsed.requiredPose || local.requiredPose,
      setting: parsed.setting || local.setting,
      clothing: parsed.clothing || local.clothing,
      forbidden: [...new Set([...local.forbidden, ...(parsed.forbidden || [])])],
    }
  } catch (_e) {
    return local
  }
}

function buildFinalPrompt(blueprint: SceneBlueprint, explicit: boolean): string {
  const participants = blueprint.participantCount === 'two'
    ? `EXACTLY TWO ADULT PARTICIPANTS visible: ${blueprint.genders.join(' and ')}`
    : `EXACT PARTICIPANTS: ${blueprint.genders.join(' and ')}`
  const required = blueprint.requiredActions.length
    ? `NON-NEGOTIABLE ACTIONS: ${blueprint.requiredActions.join('; ')}`
    : 'NON-NEGOTIABLE ACTION: follow the latest text literally'

  const prompt = [
    participants,
    required,
    `MANDATORY POSE: ${blueprint.requiredPose}`,
    `MANDATORY SETTING: ${blueprint.setting}`,
    `CLOTHING/NUDITY: ${blueprint.clothing}`,
    blueprint.visualPrompt.slice(0, 420),
    explicit ? 'adult explicit erotic scene only if the text describes it' : 'sensual but non-explicit scene',
    'POSE ACCURACY: recreate the exact body positions and contact points from the latest text, do not improvise a different pose',
    'FACE AND MOUTH QUALITY: realistic lips, teeth, tongue and jaw, no warped mouth, no fused mouths, no smeared lips, no distorted bite',
    'quality gate: professional realistic photo, stable readable pose, believable body mechanics, correct limb count, realistic hands and feet, no extra limbs, no fused bodies',
  ].join(', ')
  return prompt.slice(0, 1024)
}

type CandidateReview = {
  index: number
  pass: boolean
  anatomyScore: number
  poseScore: number
  faceMouthScore: number
  reason: string
}

async function pickBestCandidate(
  imageUrls: string[],
  prompt: string,
  blueprint: SceneBlueprint,
  focusText: string,
): Promise<string | undefined> {
  if (imageUrls.length === 0) return undefined
  if (!LOVABLE_API_KEY) return imageUrls[0]

  try {
    const content: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text:
          'You are a strict image quality inspector for a paid adult roleplay product. Evaluate every candidate against the latest script and reject bad outputs. ' +
          'Hard fail any image with warped mouth/lips/teeth/tongue, smeared face, fused mouths, extra/missing limbs, broken anatomy, fused bodies, arms through faces, impossible legs, wrong participant count, wrong gender, or a pose that does not match the script. ' +
          'Score anatomy, pose, and faceMouth from 0 to 10. pass can be true only if anatomyScore >= 8, poseScore >= 8, faceMouthScore >= 8, participant count/gender are correct, and the pose follows the latest script. ' +
          'Return JSON only: {"candidates":[{"index":0,"pass":false,"anatomyScore":0,"poseScore":0,"faceMouthScore":0,"reason":"short"}],"bestIndex":null,"reason":"short"}. ' +
          `Latest script to match literally: ${focusText.slice(0, 1200)}\nRequired scene prompt: ${prompt}\nBlueprint: ${JSON.stringify(blueprint)}`,
      },
      ...imageUrls.slice(0, 3).map((url) => ({ type: 'image_url', image_url: { url } })),
    ]

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content }],
      }),
    })
    if (!res.ok) return imageUrls[0]
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content?.trim()
    const parsed = raw ? JSON.parse(raw) : null
    const reviews = Array.isArray(parsed?.candidates) ? parsed.candidates as CandidateReview[] : []
    const passing = reviews
      .filter((review) =>
        review?.pass === true &&
        Number(review.anatomyScore) >= 8 &&
        Number(review.poseScore) >= 8 &&
        Number(review.faceMouthScore) >= 8 &&
        Number.isInteger(Number(review.index)) &&
        Number(review.index) >= 0 &&
        Number(review.index) < imageUrls.length,
      )
      .sort((a, b) =>
        (Number(b.anatomyScore) + Number(b.poseScore) + Number(b.faceMouthScore)) -
        (Number(a.anatomyScore) + Number(a.poseScore) + Number(a.faceMouthScore)),
      )
    if (passing.length > 0) return imageUrls[Number(passing[0].index)]
  } catch (_e) {
    return undefined
  }

  return undefined
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
    const characterRole: string = (body?.characterRole || '').toString()
    const playerRole: string = (body?.playerRole || '').toString()
    const storyTitle: string = (body?.storyTitle || '').toString()
    const storyDescription: string = (body?.storyDescription || '').toString()
    const explicit: boolean = !!body?.explicit
    const language: string = (body?.language || 'es').toString()
    const dryRun: boolean = !!body?.dryRun

    if (!sceneText) {
      return new Response(
        JSON.stringify({ error: 'invalid_input', detail: 'sceneText is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const blueprint = await buildSceneBlueprint(sceneText, focusText, characterRole, playerRole, storyTitle, storyDescription, explicit, language)
    const prompt = buildFinalPrompt(blueprint, explicit)
    const negativePrompt = [
      'lowres, blurry, low quality, watermark, text, signature',
      'bad anatomy, bad hands, bad fingers, extra fingers, missing fingers, fused fingers',
      'extra arms, extra legs, missing limbs, broken limbs, twisted limbs, dislocated joints',
      'extra feet, missing feet, duplicated legs, three legs, three arms, detached limb, floating limb',
      'elbow from head, arm through face, hand through face, leg through body, malformed body, deformed, mutated',
      'distorted face, asymmetrical face, fused bodies, tangled bodies, impossible penetration, incoherent pose, contortionist pose',
      'deformed mouth, warped lips, melted lips, fused lips, fused mouths, smeared mouth, distorted teeth, bad teeth, extra teeth, deformed tongue, broken jaw, distorted jaw, face melting, mouth glitch',
      'broken spine, dislocated hip, unnatural knees, split legs unless explicitly described, body horror, doll-like anatomy',
      ...blueprint.forbidden,
    ].join(', ')

    if (dryRun) {
      return new Response(
        JSON.stringify({ prompt, negativePrompt, blueprint }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const request: Record<string, unknown> = {
      model_name: explicit ? EXPLICIT_MODEL : REALISTIC_MODEL,
    prompt: prompt.slice(0, 1024),
    negative_prompt: negativePrompt.slice(0, 1024),
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      image_num: 4,
      steps: 38,
      seed: -1,
      clip_skip: 1,
      guidance_scale: 7.5,
      sampler_name: 'DPM++ 2M Karras',
      restore_faces: true,
      hires_fix: {
        target_width: 768,
        target_height: 1072,
        strength: 0.35,
        upscaler: 'R-ESRGAN 4x+',
      },
    }

    const startRes = await fetch('https://api.novita.ai/v3/async/txt2img', {
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
        JSON.stringify({ error: 'novita_error', detail: startText, prompt, blueprint }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const startData = JSON.parse(startText)
    const taskId = startData?.task_id
    if (!taskId) {
      return new Response(
        JSON.stringify({ error: 'novita_error', detail: 'No task_id returned', prompt, blueprint }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

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
        const urls = (pollData?.images || [])
          .map((image: { image_url?: string }) => image?.image_url)
          .filter(Boolean)
        const url = await pickBestCandidate(urls, prompt, blueprint, focusText)
        if (!url) {
          return new Response(
            JSON.stringify({ error: 'quality_rejected', detail: 'Generated images were rejected for anatomy, mouth/face quality, or pose mismatch. Please regenerate.', prompt, blueprint }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({ imageUrl: url, prompt, blueprint }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      if (status === 'TASK_STATUS_FAILED') {
        return new Response(
          JSON.stringify({ error: 'novita_error', detail: pollData?.task?.reason || 'Task failed', prompt, blueprint }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    return new Response(
      JSON.stringify({ error: 'timeout', detail: 'Image generation timed out', prompt, blueprint }),
      { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'server_error', detail: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})