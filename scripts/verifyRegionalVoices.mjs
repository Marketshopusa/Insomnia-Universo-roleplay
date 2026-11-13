// Manual cloud smoke check. Uses the deployment's own provider credentials.
import assert from 'node:assert/strict';
import { synthesizeGemini, previewVoice } from '../api/_geminiTts.mjs';
import { synthesizeExpressiveScene } from '../src/lib/expressiveAudio.mjs';
import { prepareExpressiveSpeech } from '../src/lib/expressiveSpeech.mjs';

try {
  for (const region of ['ve', 'mx']) {
    const started = Date.now();
    const result = await synthesizeGemini('Buenos días. Me alegra que podamos conversar con calma.', 'Kore', 'es', { region });
    assert.equal(result.status, 200, `regional speech failed: ${region}`);
    assert.ok(result.pcm?.length > 24000, 'no audible speech returned');
    console.log('REGIONAL_VOICE_CHECK', JSON.stringify({ voice: 'Kore', region, audioBytes: result.pcm.length, ms: Date.now() - started }));
  }
  for (const [voice, region, text] of [
    ['Kore', 've', '*Me río suavemente* Qué buena noticia.'],
    ['Puck', 'mx', '*Sollozo* Necesito un momento.'],
  ]) {
    const started = Date.now();
    const result = await synthesizeExpressiveScene(prepareExpressiveSpeech(text, { roleplay: true }), voice, 'es', {
      region, resolvedVoice: previewVoice(voice), cache: new Map(), deadlineMs: 45000,
      synthesize: synthesizeGemini,
    });
    assert.equal(result.status, 200, 'expressive speech failed');
    assert.ok(result.parts.some((part) => part.kind === 'reaction' && part.endSample > part.startSample), 'missing reaction');
    assert.ok(result.parts.some((part) => part.kind === 'speech' && part.endSample > part.startSample), 'missing dialogue');
    console.log('REGIONAL_VOICE_CHECK', JSON.stringify({ voice, region, parts: result.parts, audioBytes: result.pcm.length, ms: Date.now() - started }));
  }
} catch (error) {
  console.error('REGIONAL_VOICE_CHECK_FAILED', JSON.stringify({ code: error.code || error.name, message: String(error.message || error).slice(0, 180) }));
  process.exitCode = 1;
}
